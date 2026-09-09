export type ScoringMode = "standard" | "speed_bonus";
export type AfterAnswerMode = "auto_advance" | "next_button";
export type QuizStatus = "draft" | "published";
export type SessionStatus = "waiting" | "live" | "finished";
export type SessionPhase = "waiting" | "question" | "revealed" | "finished";
export type OptionKey = "A" | "B" | "C" | "D";
export type Difficulty = "easy" | "medium" | "hard";

export interface Quiz {
  id: string;
  title: string;
  description: string;
  time_limit_minutes: number;
  pass_mark_percent: number;
  leaderboard_enabled: boolean;
  ai_feedback_enabled: boolean;
  randomize_questions: boolean;
  randomize_answers: boolean;
  back_navigation_enabled: boolean;
  scoring_mode: ScoringMode;
  speed_bonus_window_seconds: number;
  question_timer_seconds: number; // per-question active window, all scoring modes
  translation_enabled: boolean; // OFF by default — AI translation costs money per question per language, so it only runs when a quiz explicitly opts in
  after_answer_mode: AfterAnswerMode; // NOTE: no longer used for pacing — see README note in migration 002 patch guide. Kept on the type/schema so existing builder UI doesn't break; presenter always controls advancement now regardless of this setting.
  status: QuizStatus;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  order_index: number;
  question_text: string;
  image_url: string | null;
  media_type: "image" | "video";
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionKey;
  explanation: string;
  wrong_feedback_a: string;
  wrong_feedback_b: string;
  wrong_feedback_c: string;
  wrong_feedback_d: string;
  category: string;
  difficulty: Difficulty;
  learning_topic: string;
}

/** Question shape safe to send to a participant's browser — no answer key. */
export interface PublicQuestion {
  index: number;
  question_text: string;
  image_url: string | null;
  media_type: "image" | "video";
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  category: string;
  difficulty: Difficulty;
}

export interface QuizSnapshot {
  quiz: Quiz;
  questions: Question[];
}

export interface LiveSession {
  id: string;
  quiz_id: string;
  quiz_snapshot: QuizSnapshot;
  status: SessionStatus;
  current_question_index: number; // NEW — session-level, the single question live for everyone
  current_question_started_at: string | null; // NEW
  phase: SessionPhase; // NEW
  phase_deadline: string | null; // NEW — when the current question auto-reveals
  short_code: string | null; // NEW — short numeric code, QR-scan fallback
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  delete_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  avatar: string;
  language: string;
  joined_at: string;
  store: string | null;
  city: string | null;
  mobile: string | null;
  email: string | null;
  // current_question_index / current_question_started_at still exist in the
  // DB (migration 002 doesn't drop them) but are no longer read for
  // pacing — sessions.current_question_index is now the single source of
  // truth for what question is live. Left here as optional/legacy so any
  // remaining reads don't break; don't write to them going forward.
  current_question_index?: number;
  current_question_started_at?: string | null;
  base_score: number;
  speed_score: number;
  total_score: number;
  completed_at: string | null;
  last_submission_at: string | null;
}

export interface Answer {
  id: string;
  session_id: string;
  participant_id: string;
  question_index: number;
  selected_option: OptionKey;
  is_correct: boolean;
  base_score: number;
  speed_bonus: number;
  question_score: number;
  elapsed_ms: number;
  answered_at: string;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
  time_seconds: number | null;
}
