-- ============================================================================
-- ILG LIVE QUIZ ENGINE — Supabase schema
-- Run this once in Supabase SQL Editor (or `supabase db push`) on a fresh
-- project. Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- QUIZ TEMPLATES (permanent)
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Multiple named admin accounts, each with their own preset username and
-- password (set by the super admin — no self-service signup or email
-- flow). role='super_admin' can see and manage every account's quizzes
-- and reset anyone's password; role='user' is capped at quiz_limit quizzes
-- of their own. Passwords are bcrypt-hashed, never stored in plain text.
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       text unique not null,
  password_hash  text not null,
  display_name   text,
  role           text not null default 'user' check (role in ('user', 'super_admin')),
  quiz_limit     int not null default 5, -- ignored for role='super_admin', which has no cap
  created_at     timestamptz not null default now()
);
alter table admin_users enable row level security;

create table if not exists quizzes (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid references admin_users(id) on delete set null, -- null = a legacy quiz from before named accounts existed, or an account since deleted; visible to every user, not just the super admin, so nothing already made disappears on upgrade
  title                     text not null,
  description               text default '',
  time_limit_minutes        int  not null default 15,
  pass_mark_percent         int  not null default 60,
  leaderboard_enabled       boolean not null default true,
  ai_feedback_enabled       boolean not null default true,
  randomize_questions       boolean not null default false,
  randomize_answers         boolean not null default false,
  back_navigation_enabled   boolean not null default false,
  scoring_mode              text not null default 'speed_bonus'
                              check (scoring_mode in ('standard', 'speed_bonus')),
  speed_bonus_window_seconds int not null default 20,
  question_timer_seconds    int  not null default 20, -- how long each question stays open in a LIVE session (all scoring modes) before auto-reveal
  translation_enabled       boolean not null default false, -- OFF by default: AI translation costs money per question per language, so it only runs for quizzes that explicitly opt in
  require_contact_info      boolean not null default false, -- OFF by default: mobile/email fields hidden on join for casual quizzes; turn on for a real competition needing duplicate-prevention
  issue_certificate         boolean not null default false, -- OFF by default: when on, a participant who passes gets a certificate offered on their results page
  certificate_message       text, -- optional custom achievement sentence for THIS quiz's certificate; null = use the app-wide default wording
  brand_logo_url            text, -- optional per-quiz brand logo (e.g. Cerruti 1881, Palm Angels) shown ALONGSIDE the company logo on this quiz's certificate; null = company logo only  after_answer_mode         text not null default 'auto_advance'
                              check (after_answer_mode in ('auto_advance', 'next_button')), -- used by Preview only; a live session is always presenter-controlled
  status                    text not null default 'draft'
                              check (status in ('draft', 'published')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table if not exists questions (
  id                    uuid primary key default gen_random_uuid(),
  quiz_id               uuid not null references quizzes(id) on delete cascade,
  order_index           int not null,
  question_text         text not null,
  image_url             text,
  media_type            text not null default 'image' check (media_type in ('image', 'video')),
  option_a              text not null,
  option_b              text not null,
  option_c              text not null,
  option_d              text not null,
  correct_option        text not null check (correct_option in ('A', 'B', 'C', 'D')),
  explanation            text default '',
  wrong_feedback_a      text default '',
  wrong_feedback_b      text default '',
  wrong_feedback_c      text default '',
  wrong_feedback_d      text default '',
  category              text default '',
  difficulty            text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  learning_topic        text default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (quiz_id, order_index)
);

-- ---------------------------------------------------------------------------
-- LIVE SESSIONS (temporary — auto-deleted, see cleanup function below)
-- quiz_snapshot freezes the quiz+questions at launch time (spec §39):
-- editing the template later never changes a running/finished session.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  id                            uuid primary key default gen_random_uuid(),
  quiz_id                       uuid not null references quizzes(id) on delete cascade,
  quiz_snapshot                 jsonb not null,
  status                        text not null default 'waiting'
                                  check (status in ('waiting', 'live', 'finished')),
  -- Presenter-controlled, synchronized session mechanics: ONE question is
  -- live for every participant at once, tracked here rather than on each
  -- participant's own row. `phase` governs where that shared question is
  -- in its lifecycle; `phase_deadline` is when it auto-reveals if the
  -- presenter hasn't clicked "Reveal answer" first.
  current_question_index       int not null default 0,
  current_question_started_at  timestamptz,
  phase                         text not null default 'waiting'
                                  check (phase in ('waiting', 'question', 'revealed', 'finished')),
  phase_deadline                timestamptz,
  -- A short, easy-to-type fallback for joining when scanning the QR code
  -- doesn't work (camera permission blocked, some MDM-locked work
  -- phones, etc.) or when someone would rather just type a code than
  -- deal with a long URL. Unique only among currently-active (non-
  -- finished) sessions — old codes free up once a session ends.
  short_code                    text,
  created_at                    timestamptz not null default now(),
  started_at                    timestamptz,
  ended_at                      timestamptz,
  delete_at                     timestamptz not null default (now() + interval '24 hours'),
  -- How many questions were actually presented before this session ended
  -- — set once, at the moment it finishes, to current_question_index + 1.
  -- Ending a quiz early (a deliberate "cut it short, find a winner now"
  -- call) must not silently divide everyone's score by the FULL deck
  -- size; every score/pass-fail/certificate calculation for this session
  -- uses this number as the denominator instead, once it's set. Null for
  -- a session still in progress — nothing to fall back to needed there,
  -- since nothing reads this until the session finishes.
  questions_presented           int
);
create unique index if not exists idx_sessions_short_code_active on sessions(short_code) where status != 'finished';

create table if not exists participants (
  id                          uuid primary key default gen_random_uuid(),
  session_id                  uuid not null references sessions(id) on delete cascade,
  name                        text not null,
  store                       text, -- required at the API layer on join
  city                        text, -- required at the API layer on join
  mobile                      text, -- normalized (digits + optional leading +); at least one of mobile/email required at the API layer
  email                       text, -- normalized (trimmed, lowercased); at least one of mobile/email required at the API layer
  avatar                      text not null default '🦉',
  language                    text not null default 'en',
  joined_at                   timestamptz not null default now(),
  -- current_question_index / current_question_started_at below are no
  -- longer read for pacing (sessions.current_question_index above is now
  -- the single source of truth for what's live) — kept only so existing
  -- rows/deployments aren't broken by a dropped column.
  current_question_index      int not null default 0,
  current_question_started_at timestamptz,
  base_score                  int not null default 0,
  speed_score                 numeric(6,1) not null default 0,
  total_score                 numeric(6,1) not null default 0,
  completed_at                timestamptz,
  last_submission_at          timestamptz
);

create table if not exists answers (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions(id) on delete cascade,
  participant_id    uuid not null references participants(id) on delete cascade,
  question_index    int not null,
  selected_option   text not null check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct        boolean not null,
  base_score        int not null,
  speed_bonus       numeric(6,1) not null,
  question_score    numeric(6,1) not null,
  elapsed_ms        int not null,
  answered_at       timestamptz not null default now(),
  unique (session_id, participant_id, question_index) -- prevents double submission (spec §12, §43)
);

create index if not exists idx_questions_quiz on questions(quiz_id);
create index if not exists idx_sessions_quiz on sessions(quiz_id);
create index if not exists idx_participants_session on participants(session_id);
-- Duplicate-attempt prevention: at most one participant row per session per
-- mobile number / email address. The join route checks for an existing
-- match first and resumes that participant rather than erroring — these
-- indexes are the hard DB-level backstop against a race (two submits at
-- once) rather than the primary mechanism.
create unique index if not exists idx_participants_session_mobile on participants(session_id, mobile) where mobile is not null;
create unique index if not exists idx_participants_session_email on participants(session_id, email) where email is not null;
create index if not exists idx_answers_session on answers(session_id);
create index if not exists idx_answers_participant on answers(participant_id);
create index if not exists idx_sessions_delete_at on sessions(delete_at);

-- ---------------------------------------------------------------------------
-- Translation cache. Participants can view questions in their own phone's
-- language while the presenter/admin screens stay in English. Each
-- question is translated by AI once per (session, question, language) and
-- reused for every participant who picks that language — not re-translated
-- per person, which matters at ~300 concurrent participants.
-- ---------------------------------------------------------------------------
create table if not exists question_translations (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions(id) on delete cascade,
  question_index    int not null,
  language_code     text not null,
  question_text     text not null,
  option_a          text not null,
  option_b          text not null,
  option_c          text not null,
  option_d          text not null,
  explanation       text, -- only needed for the results page (never shown live), so nullable and filled in lazily on first view
  created_at        timestamptz not null default now(),
  unique (session_id, question_index, language_code)
);

alter table question_translations enable row level security;

-- Translated waiting-screen instructions — one small cache entry per
-- session+language, same idea as question_translations above but for
-- the fixed instructional text (question count, scoring rules, pass
-- mark) rather than per-question content.
create table if not exists instruction_translations (
  session_id     uuid not null references sessions(id) on delete cascade,
  language_code  text not null,
  bullets        jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (session_id, language_code)
);
alter table instruction_translations enable row level security;

-- ---------------------------------------------------------------------------
-- Certificates — one row per issued certificate, ever. certificate_number is
-- globally unique and never reused, generated from a real sequence (not
-- "count existing rows + 1", which would race and collide under
-- concurrent finishes). The pass mark that actually applied is captured
-- here at issue time via quiz_title/score_percent — combined with the
-- fact that quiz_snapshot itself is already frozen per session at launch
-- (see sessions.quiz_snapshot), a later change to a quiz's pass mark or
-- certificate setting can never retroactively alter or invalidate a
-- certificate that was already issued.
-- ---------------------------------------------------------------------------
create sequence if not exists certificate_number_seq start 1;

-- Wraps the sequence increment + formatting in one atomic call, so two
-- participants finishing at the same instant can never be handed the
-- same certificate number — Postgres sequences guarantee that on their
-- own, this function just does the formatting on top.
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
alter table certificates enable row level security;

-- ---------------------------------------------------------------------------
-- Quiz attempt history — deliberately NOT tied to sessions.id with a
-- cascading delete. Sessions (and everything under them — participants,
-- answers) are auto-purged 24 hours after they finish; this table exists
-- specifically so "how did I do last time" survives that cleanup and
-- still means something weeks or months later, not just same-day
-- retakes. participant_key is whichever of mobile/email was collected
-- (normalized the same way the join route does) — matching across
-- attempts is only possible for quizzes with "Require mobile/email on
-- join" turned on; a quiz without it simply never writes a row here,
-- and the results page falls back to comparing against the pass mark
-- instead of a real previous attempt.
-- ---------------------------------------------------------------------------
create table if not exists quiz_attempt_history (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid, -- soft reference, no FK cascade — this row must survive the quiz template itself being deleted
  quiz_title          text not null,
  participant_key     text not null, -- normalized mobile, or email if no mobile
  participant_name    text not null,
  category_breakdown  jsonb not null,
  score_percent       int not null,
  completed_at        timestamptz not null default now()
);
create index if not exists idx_attempt_history_lookup on quiz_attempt_history(quiz_id, participant_key, completed_at desc);
alter table quiz_attempt_history enable row level security;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- All writes happen through Next.js API routes using the service_role key,
-- which bypasses RLS. The anon key (used by the browser) gets read-only,
-- narrow access — and never to `correct_option`, `explanation`, or
-- `wrong_feedback_*` on questions, which participants must never see.
-- Live "who's online / how many answered" numbers are pushed to clients via
-- Supabase Realtime **broadcast** channels from the server (see
-- src/lib/realtime.ts), not via table replication — so no policy is needed
-- for that and no row data leaks through Realtime.
-- ---------------------------------------------------------------------------
alter table quizzes enable row level security;
alter table questions enable row level security;
alter table sessions enable row level security;
alter table participants enable row level security;
alter table answers enable row level security;

drop policy if exists "service role full access quizzes" on quizzes;
drop policy if exists "service role full access questions" on questions;
drop policy if exists "service role full access sessions" on sessions;
drop policy if exists "service role full access participants" on participants;
drop policy if exists "service role full access answers" on answers;

-- No anon policies are created on purpose: the anon key gets zero direct
-- table access. All reads participants/admin need go through API routes
-- that return sanitized JSON. This is the simplest safe posture for a
-- quiz where the DB itself contains the answer key.

-- ---------------------------------------------------------------------------
-- Auto-deletion (spec §35): sessions past their delete_at are purged.
-- Cascades remove participants and answers automatically. The quiz
-- template (quizzes/questions) is never touched by this function.
-- ---------------------------------------------------------------------------
create or replace function cleanup_expired_sessions()
returns void
language plpgsql
security definer
as $$
begin
  delete from sessions where delete_at < now();
end;
$$;

-- Schedule it every hour with pg_cron (enable the extension first in
-- Database → Extensions in the Supabase dashboard, then run this once):
--
--   select cron.schedule(
--     'cleanup-expired-quiz-sessions',
--     '0 * * * *',
--     $$select cleanup_expired_sessions();$$
--   );
--
-- If your plan doesn't have pg_cron, call POST /api/sessions/cleanup from
-- any external scheduler (Vercel Cron, GitHub Actions cron, etc.) instead —
-- that route calls the same function. See README "Automatic data deletion".

-- ---------------------------------------------------------------------------
-- Storage bucket for question images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('quiz-images', 'quiz-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Branding (one-time logo upload, shown on every page)
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  logo_url text,
  certificate_org_name text not null default 'ILG ACADEMY',
  certificate_org_subtitle text not null default 'TRAINING & DEVELOPMENT',
  certificate_location text, -- optional line near the bottom, e.g. "ILG OF SWITZERLAND MÖHLIN, AARGAU SWITZERLAND"; blank = not shown
  certificate_signer_name text, -- printed under the signature image, e.g. "Mohamed Dilshad Rahim"
  certificate_signature_url text, -- an uploaded image of an actual handwritten signature, shown above the signer name
  certificate_background_url text, -- optional full-page background image (a designed template) — if set, drawn behind everything else instead of the built-in drawn layout
  updated_at timestamptz not null default now()
);
insert into app_settings (id)
select gen_random_uuid()
where not exists (select 1 from app_settings);

-- ---------------------------------------------------------------------------
-- Named, expiring trainer accounts — each one can present exactly ONE
-- assigned quiz (start/reveal/next/end it, view results) and nothing
-- else: no quiz list beyond their own assignment, no editing, no other
-- quiz's data. `password_hash` is salted+hashed (scrypt), never stored
-- or logged in plain text, unlike the single shared ADMIN_PASSWORD env
-- var this sits alongside. `expires_at` is enforced on every request, not
-- just at login — access stops working the moment it passes, even for an
-- already-open session.
-- ---------------------------------------------------------------------------
create table if not exists trainers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  password_hash      text not null,
  assigned_quiz_id   uuid references quizzes(id) on delete set null,
  expires_at         timestamptz, -- null = never expires
  created_at         timestamptz not null default now()
);
create unique index if not exists idx_trainers_name on trainers(lower(name));

-- ---------------------------------------------------------------------------
-- Durable answer event log — survives the 24h session/answers cleanup on
-- purpose. Deliberately NOT foreign-keyed to sessions.id (a cascading FK
-- there would delete these rows right along with the session, defeating
-- the point); session_id is kept only as a plain reference field.
-- ---------------------------------------------------------------------------
create table if not exists answer_events (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid references quizzes(id) on delete cascade,
  session_id     uuid,
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

-- ---------------------------------------------------------------------------
-- Persistent participant profiles — the foundation for XP, streaks, and any
-- future "my progress" experience. Only created for a participant who
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

-- ---------------------------------------------------------------------------
-- Security fix: these four tables were missing "enable row level
-- security" entirely, unlike every other table in this schema. Enabled
-- with zero policies — the same pattern already used successfully on
-- every other table here — which means default-deny for the public
-- anon key (the only key ever exposed to the browser), while the
-- server's service-role key (used exclusively in API routes) is
-- unaffected, since it bypasses RLS by design. No application code
-- changes needed since nothing in this app ever queries these tables
-- via the anon key in the first place.
-- ---------------------------------------------------------------------------
alter table app_settings enable row level security;
alter table trainers enable row level security;
alter table answer_events enable row level security;
alter table participant_profiles enable row level security;
