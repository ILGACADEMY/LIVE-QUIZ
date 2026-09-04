/**
 * The only fields ever written to the `questions` table, from any route.
 * Building insert rows from this whitelist — rather than spreading
 * whatever object happens to be on hand — means server-managed columns
 * (id, created_at, updated_at, quiz_id) from a previously-loaded question
 * can never leak into a fresh insert. Mixing "fresh" rows (missing those
 * keys) with "loaded" rows (carrying them) in the same bulk insert is what
 * caused two separate not-null-constraint bugs before this existed.
 */
export const QUESTION_FIELDS = [
  "question_text",
  "image_url",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
  "explanation",
  "wrong_feedback_a",
  "wrong_feedback_b",
  "wrong_feedback_c",
  "wrong_feedback_d",
  "category",
  "difficulty",
  "learning_topic"
] as const;

export function toQuestionRow(q: Record<string, unknown>, quizId: string, orderIndex: number) {
  const row: Record<string, unknown> = { quiz_id: quizId, order_index: orderIndex };
  for (const field of QUESTION_FIELDS) {
    row[field] = q[field] ?? (field === "image_url" ? null : "");
  }
  return row;
}
