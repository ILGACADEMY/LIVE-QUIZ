import { ScoringMode } from "./types";

export interface ScoreResult {
  isCorrect: boolean;
  baseScore: number;
  speedBonus: number;
  questionScore: number;
}

/**
 * Server-authoritative scoring. `elapsedMs` MUST be computed from a
 * server-recorded question-start timestamp and the moment the server
 * received the submission — never trust a client-reported elapsed time
 * (spec §11, §43).
 *
 * SPEED BONUS = whole remaining seconds in the configured window, only if
 * the answer is correct (spec §9). A correct answer submitted at or after
 * the window has elapsed still earns its 1 base point, just 0 bonus.
 */
export function scoreAnswer(params: {
  selectedOption: string;
  correctOption: string;
  elapsedMs: number;
  scoringMode: ScoringMode;
  speedBonusWindowSeconds: number;
}): ScoreResult {
  const { selectedOption, correctOption, elapsedMs, scoringMode, speedBonusWindowSeconds } = params;
  const isCorrect = selectedOption === correctOption;

  if (!isCorrect) {
    return { isCorrect: false, baseScore: 0, speedBonus: 0, questionScore: 0 };
  }

  const baseScore = 1;

  if (scoringMode !== "speed_bonus") {
    return { isCorrect: true, baseScore, speedBonus: 0, questionScore: baseScore };
  }

  const elapsedSeconds = elapsedMs / 1000;
  const remaining = Math.max(0, speedBonusWindowSeconds - elapsedSeconds);
  const speedBonus = Math.floor(remaining); // whole seconds remaining, per spec example table

  return {
    isCorrect: true,
    baseScore,
    speedBonus,
    questionScore: baseScore + speedBonus
  };
}
