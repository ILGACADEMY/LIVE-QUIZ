import { ScoringMode } from "./types";

export interface ScoreResult {
  isCorrect: boolean;
  baseScore: number;
  speedBonus: number;
  questionScore: number;
}

const MAX_SPEED_BONUS = 10;

/**
 * Server-authoritative scoring. `elapsedMs` MUST be computed from a
 * server-recorded question-start timestamp and the moment the server
 * received the submission — never trust a client-reported elapsed time.
 *
 * SPEED BONUS: a correct answer earns 1 base point plus up to 10 bonus
 * points, scaling linearly down to 0 across the configured window. At the
 * default 20-second window this is exactly 0.5 points lost per second
 * (10 pts at 0s elapsed → 0 pts at 20s elapsed). For any other window the
 * same 0-to-10 range is scaled proportionally across that window's length.
 * Wrong answers always score 0, regardless of speed. Bonus is rounded to
 * the nearest 0.5 point.
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

  if (scoringMode !== "speed_bonus" || speedBonusWindowSeconds <= 0) {
    return { isCorrect: true, baseScore, speedBonus: 0, questionScore: baseScore };
  }

  const elapsedSeconds = elapsedMs / 1000;
  const remainingSeconds = Math.max(0, speedBonusWindowSeconds - elapsedSeconds);
  const rawBonus = (remainingSeconds / speedBonusWindowSeconds) * MAX_SPEED_BONUS;
  const speedBonus = Math.round(rawBonus * 2) / 2; // nearest 0.5

  return {
    isCorrect: true,
    baseScore,
    speedBonus,
    questionScore: Math.round((baseScore + speedBonus) * 2) / 2
  };
}
