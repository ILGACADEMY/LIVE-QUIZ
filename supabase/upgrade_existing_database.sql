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
