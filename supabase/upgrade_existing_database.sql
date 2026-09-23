-- Upgrade migration for an EXISTING ILGACADEMY/LIVE-QUIZ Supabase database.
-- Safe to run once in the Supabase SQL Editor — everything here is
-- additive (new columns, new table, new indexes) and uses IF NOT EXISTS
-- throughout, so it won't error even if some part of it was already
-- applied. Nothing is dropped, nothing existing is modified.
--
-- Do NOT run supabase/schema.sql on this database — that file is written
-- for a brand new, empty Supabase project (CREATE TABLE IF NOT EXISTS,
-- which silently does nothing on tables that already exist) and will not
-- add any of the columns below to your current tables. This file is the
-- one to run instead.

-- ============ image/video questions + per-question live timer ============
alter table questions add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video'));
alter table quizzes add column if not exists question_timer_seconds int not null default 20;
alter table quizzes add column if not exists translation_enabled boolean not null default false;

-- ============ presenter-controlled, synchronized session mechanics ============
alter table sessions add column if not exists current_question_index int not null default 0;
alter table sessions add column if not exists current_question_started_at timestamptz;
alter table sessions add column if not exists phase text not null default 'waiting'
  check (phase in ('waiting', 'question', 'revealed', 'finished'));
alter table sessions add column if not exists phase_deadline timestamptz;

-- ============ required store/city + mobile-or-email duplicate prevention ============
alter table participants add column if not exists store text;
alter table participants add column if not exists city text;
alter table participants add column if not exists mobile text;
alter table participants add column if not exists email text;
create unique index if not exists idx_participants_session_mobile on participants(session_id, mobile) where mobile is not null;
create unique index if not exists idx_participants_session_email on participants(session_id, email) where email is not null;

-- ============ one-time logo branding ============
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  logo_url text,
  updated_at timestamptz not null default now()
);
insert into app_settings (id)
select gen_random_uuid()
where not exists (select 1 from app_settings);

-- ============ short join code (QR alternative) ============
alter table sessions add column if not exists short_code text;

-- ============ scoring denominator when a quiz ends early ============
alter table sessions add column if not exists questions_presented int;
create unique index if not exists idx_sessions_short_code_active on sessions(short_code) where status != 'finished';

-- ============ named, expiring trainer accounts (replaces the old single shared TRAINER_PASSWORD) ============
create table if not exists trainers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  password_hash      text not null,
  assigned_quiz_id   uuid references quizzes(id) on delete set null,
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);
create unique index if not exists idx_trainers_name on trainers(lower(name));

-- ============ translated explanations (results page, never shown live) ============
alter table question_translations add column if not exists explanation text;

-- ============ optional mobile/email requirement per quiz ============
alter table quizzes add column if not exists require_contact_info boolean not null default false;

-- ============ translated waiting-screen instructions (one small cache entry per session+language) ============
create table if not exists instruction_translations (
  session_id     uuid not null references sessions(id) on delete cascade,
  language_code  text not null,
  bullets        jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (session_id, language_code)
);

-- ============ certificates ============
alter table quizzes add column if not exists issue_certificate boolean not null default false;
alter table quizzes add column if not exists certificate_message text;
alter table quizzes add column if not exists brand_logo_url text;
alter table app_settings add column if not exists certificate_org_name text not null default 'ILG ACADEMY';
alter table app_settings add column if not exists certificate_org_subtitle text not null default 'TRAINING & DEVELOPMENT';
alter table app_settings add column if not exists certificate_location text;
alter table app_settings add column if not exists certificate_signer_name text;
alter table app_settings add column if not exists certificate_signature_url text;
alter table app_settings add column if not exists certificate_background_url text;

-- ============ persistent attempt history, survives the 24h session cleanup ============
create table if not exists quiz_attempt_history (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid,
  quiz_title          text not null,
  participant_key     text not null,
  participant_name    text not null,
  category_breakdown  jsonb not null,
  score_percent       int not null,
  completed_at        timestamptz not null default now()
);
create index if not exists idx_attempt_history_lookup on quiz_attempt_history(quiz_id, participant_key, completed_at desc);

create sequence if not exists certificate_number_seq start 1;

create or replace function next_certificate_number()
returns text
language sql
as $$
  select 'ILG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('certificate_number_seq')::text, 6, '0');
$$;

create table if not exists certificates (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions(id) on delete cascade,
  participant_id      uuid not null references participants(id) on delete cascade,
  certificate_number  text not null unique,
  quiz_title          text not null,
  participant_name    text not null,
  score_percent       int not null,
  issued_at           timestamptz not null default now(),
  unique (session_id, participant_id)
);

-- ============ named admin accounts (preset username/password, per-user quiz limits) ============
create table if not exists admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       text unique not null,
  password_hash  text not null,
  display_name   text,
  role           text not null default 'user' check (role in ('user', 'super_admin')),
  quiz_limit     int not null default 5,
  created_at     timestamptz not null default now()
);
alter table quizzes add column if not exists owner_id uuid references admin_users(id) on delete set null;

-- ============ durable answer event log (survives 24h session cleanup) ============
-- Deliberately NOT foreign-keyed to sessions.id — sessions (and today's
-- answers table) are auto-deleted 24 hours after finishing, and a
-- cascading FK to sessions would delete these rows right along with
-- them, defeating the entire point. session_id is kept as a plain
-- reference field (useful for debugging/tracing) but never gates this
-- table's own lifetime. Foreign-keyed to quizzes instead, since quizzes
-- themselves are never auto-deleted.
create table if not exists answer_events (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid references quizzes(id) on delete cascade,
  session_id     uuid, -- intentionally not a foreign key — see comment above
  question_index int not null,
  question_text  text,
  category       text,
  learning_topic text,
  difficulty     text,
  is_correct     boolean not null,
  elapsed_ms     int not null,
  answered_at    timestamptz not null default now()
);
create index if not exists idx_answer_events_quiz on answer_events(quiz_id, answered_at desc);

create or replace function next_certificate_sequence()
returns bigint
language sql
as $$
  select nextval('certificate_number_seq');
$$;
-- provided mobile/email on join (an existing, admin-controlled per-quiz
-- setting) — there's no reliable identity to build a profile around
-- otherwise, and no profile should be created without someone knowingly
-- giving that contact info first. Keyed on the same normalized
-- mobile-or-email string already used by quiz_attempt_history, for
-- consistency with the one existing precedent for "the same person
-- across attempts."
-- ---------------------------------------------------------------------------
create table if not exists participant_profiles (
  id                 uuid primary key default gen_random_uuid(),
  participant_key    text not null unique,
  display_name       text not null,
  xp_total           int not null default 0,
  quizzes_completed  int not null default 0,
  created_at         timestamptz not null default now(),
  last_active_at     timestamptz not null default now()
);

-- Atomic find-or-create-and-increment — a plain upsert with a static XP
-- value would overwrite the running total instead of adding to it; this
-- is what makes the increment safe even if this ever runs concurrently
-- for the same person.
create or replace function upsert_participant_profile(p_key text, p_name text, p_xp_earned int)
returns void
language sql
as $$
  insert into participant_profiles (participant_key, display_name, xp_total, quizzes_completed, last_active_at)
  values (p_key, p_name, p_xp_earned, 1, now())
  on conflict (participant_key)
  do update set
    display_name = excluded.display_name,
    xp_total = participant_profiles.xp_total + excluded.xp_total,
    quizzes_completed = participant_profiles.quizzes_completed + 1,
    last_active_at = now();
$$;
