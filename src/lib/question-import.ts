import { EditableQuestion, blankQuestion } from "@/components/admin/QuestionEditor";

/**
 * Parses a simple, Word-friendly plain-text template into questions.
 * Deliberately forgiving about capitalization, spacing, and label
 * wording (e.g. "Topic:" or "Learning topic:" both work) — the goal is
 * that someone typing this straight into Word, in a completely ordinary
 * way, doesn't need to learn a strict syntax.
 *
 * Expected shape per question (blank line between questions):
 *
 *   Q: What is the primary function of a balance wheel?
 *   A) Store energy
 *   B) Regulate timekeeping
 *   C) Display the date
 *   D) Waterproof the case
 *   Correct: B
 *   Explanation: The balance wheel oscillates at a fixed rate...
 *   Category: Movements
 *   Difficulty: Medium
 *   Topic: Balance wheel function
 *
 * Only Q/A/B/C/D/Correct are required — Explanation/Category/
 * Difficulty/Topic are optional and left blank if omitted.
 */
export function parseQuestionsFromText(raw: string): { questions: EditableQuestion[]; warnings: string[] } {
  const warnings: string[] = [];
  // Split into blocks on blank lines, but also start a new block whenever
  // a line begins a new "Q" — handles people who forget the blank line
  // between questions.
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const startsNewQuestion = /^(Q\d*[:.)]|Question\s*\d*[:.)])/i.test(trimmed);
    if (startsNewQuestion && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    if (trimmed) current.push(trimmed);
  }
  if (current.length > 0) blocks.push(current);

  const questions: EditableQuestion[] = [];

  blocks.forEach((block, blockIndex) => {
    const q = blankQuestion();
    let foundQuestionText = false;
    let optionsFound = 0;
    let hasCorrect = false;

    for (const line of block) {
      const qMatch = line.match(/^(?:Q\d*|Question\s*\d*)[:.)]\s*(.+)$/i);
      if (qMatch) {
        q.question_text = qMatch[1].trim();
        foundQuestionText = true;
        continue;
      }
      const optMatch = line.match(/^([A-D])[).:]\s*(.+)$/i);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase();
        const text = optMatch[2].trim();
        if (letter === "A") q.option_a = text;
        if (letter === "B") q.option_b = text;
        if (letter === "C") q.option_c = text;
        if (letter === "D") q.option_d = text;
        optionsFound++;
        continue;
      }
      const correctMatch = line.match(/^Correct(?:\s*answer)?[:.]\s*([A-D])/i);
      if (correctMatch) {
        q.correct_option = correctMatch[1].toUpperCase() as EditableQuestion["correct_option"];
        hasCorrect = true;
        continue;
      }
      const explanationMatch = line.match(/^Explanation[:.]\s*(.+)$/i);
      if (explanationMatch) {
        q.explanation = explanationMatch[1].trim();
        continue;
      }
      const categoryMatch = line.match(/^Category[:.]\s*(.+)$/i);
      if (categoryMatch) {
        q.category = categoryMatch[1].trim();
        continue;
      }
      const difficultyMatch = line.match(/^Difficulty[:.]\s*(easy|medium|hard)/i);
      if (difficultyMatch) {
        q.difficulty = difficultyMatch[1].toLowerCase() as EditableQuestion["difficulty"];
        continue;
      }
      const topicMatch = line.match(/^(?:Learning\s*)?Topic[:.]\s*(.+)$/i);
      if (topicMatch) {
        q.learning_topic = topicMatch[1].trim();
        continue;
      }
      // A line that doesn't match any known label, appearing right after
      // the question line and before any options, is treated as a
      // continuation of the question text (people sometimes wrap long
      // questions onto a second line in Word without meaning to end it).
      if (foundQuestionText && optionsFound === 0 && !hasCorrect) {
        q.question_text = `${q.question_text} ${line}`.trim();
      }
    }

    if (!foundQuestionText) {
      warnings.push(`Block ${blockIndex + 1}: couldn't find a question line (starting with "Q:") — skipped.`);
      return;
    }
    if (optionsFound < 4) {
      warnings.push(`"${q.question_text.slice(0, 50)}…": only found ${optionsFound} of 4 answer options — added anyway, please check it.`);
    }
    if (!hasCorrect) {
      warnings.push(`"${q.question_text.slice(0, 50)}…": no "Correct: X" line found — defaulted to A, please check it.`);
    }

    questions.push(q);
  });

  if (questions.length === 0) {
    warnings.push("No questions could be found at all. Make sure each question starts with a line like \"Q: ...\".");
  }

  return { questions, warnings };
}

/** The downloadable template's exact contents — kept in one place so the
 *  download button and this file's own doc comment can never drift apart. */
export const QUESTION_IMPORT_TEMPLATE = `Q: What is the primary function of a watch's balance wheel?
A) Store energy
B) Regulate timekeeping
C) Display the date
D) Waterproof the case
Correct: B
Explanation: The balance wheel oscillates at a fixed rate to regulate the release of energy, which is what makes a mechanical watch keep accurate time.
Category: Movements
Difficulty: Medium
Topic: Balance wheel function

Q: Which material is most commonly used for scratch-resistant watch crystals?
A) Acrylic
B) Mineral glass
C) Sapphire crystal
D) Plexiglass
Correct: C
Explanation: Sapphire crystal is second only to diamond in hardness, making it highly scratch-resistant compared to mineral glass or acrylic.
Category: Materials
Difficulty: Easy
Topic: Case materials

`;
