-- ============================================================================
-- ILG LIVE QUIZ ENGINE — Supabase schema
-- Run this once in Supabase SQL Editor (or `supabase db push`) on a fresh
-- project. Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- QUIZ TEMPLATES (permanent)
-- ---------------------------------------------------------------------------
create table if not exists quizzes (
  id                        uuid primary key default gen_random_uuid(),
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
  after_answer_mode         text not null default 'auto_advance'
                              check (after_answer_mode in ('auto_advance', 'next_button')),
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
  id                        uuid primary key default gen_random_uuid(),
  quiz_id                   uuid not null references quizzes(id) on delete cascade,
  quiz_snapshot             jsonb not null,
  status                    text not null default 'waiting'
                              check (status in ('waiting', 'live', 'finished')),
  created_at                timestamptz not null default now(),
  started_at                timestamptz,
  ended_at                  timestamptz,
  delete_at                 timestamptz not null default (now() + interval '24 hours')
);

create table if not exists participants (
  id                          uuid primary key default gen_random_uuid(),
  session_id                  uuid not null references sessions(id) on delete cascade,
  name                        text not null,
  avatar                      text not null default '🦉',
  language                    text not null default 'en',
  joined_at                   timestamptz not null default now(),
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
  created_at        timestamptz not null default now(),
  unique (session_id, question_index, language_code)
);

alter table question_translations enable row level security;

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
