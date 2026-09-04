export type ScoringMode = "standard" | "speed_bonus";
export type AfterAnswerMode = "auto_advance" | "next_button";
export type QuizStatus = "draft" | "published";
export type SessionStatus = "waiting" | "live" | "finished";
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
  after_answer_mode: AfterAnswerMode;
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
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  delete_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  joined_at: string;
  current_question_index: number;
  current_question_started_at: string | null;
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
