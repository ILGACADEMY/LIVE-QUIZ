import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

/**
 * Per-question feedback for a wrong answer. The administrator's own
 * explanation is passed in as the primary source of truth and the model is
 * explicitly told not to invent technical facts beyond it (spec §31).
 */
export async function generateWrongAnswerFeedback(params: {
  questionText: string;
  participantAnswerText: string;
  correctAnswerText: string;
  adminExplanation: string;
  brandContext?: string;
}): Promise<string> {
  const { questionText, participantAnswerText, correctAnswerText, adminExplanation, brandContext } = params;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 220,
    system:
      "You write short, encouraging educational feedback for a luxury retail training quiz. " +
      "Use ONLY the facts given to you in the trainer's explanation — never invent technical " +
      "specifications, materials, or figures that weren't provided. Three short parts, no headers: " +
      "(1) why the chosen answer was incorrect, (2) what the correct answer is, (3) one key learning " +
      "point to remember at the sales counter. Keep it under 80 words, warm but professional tone.",
    messages: [
      {
        role: "user",
        content:
          `Question: ${questionText}\n` +
          `Participant answered: ${participantAnswerText}\n` +
          `Correct answer: ${correctAnswerText}\n` +
          `Trainer's explanation (authoritative — do not contradict or add to the facts here): ${adminExplanation || "(none provided)"}\n` +
          (brandContext ? `Brand context: ${brandContext}\n` : "")
      }
    ]
  });

  return extractText(msg);
}

/** A single participant's end-of-quiz learning profile (spec §32). */
export async function generateLearningProfile(params: {
  quizTitle: string;
  participantName: string;
  categoryBreakdown: { category: string; correct: number; total: number }[];
  topicBreakdown: { topic: string; correct: number; total: number }[];
  languageName?: string; // defaults to English; the profile is written natively in this language, not translated afterward
}): Promise<{ summary: string; strong: string[]; improve: string[]; focusTopics: string[]; recommendation: string }> {
  const languageName = params.languageName ?? "English";
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      "You analyze a luxury watch retail trainee's quiz performance, broken down both by broad category and by " +
      "specific learning topic, and return ONLY valid JSON, no preamble, no markdown fences, matching exactly: " +
      '{"summary": string, "strong": string[], "improve": string[], "focusTopics": string[], "recommendation": string}. ' +
      `Write every string value in ${languageName}, not English, unless ${languageName} is English. ` +
      `Refer to the trainee by their actual name, ${params.participantName}, wherever you would otherwise write ` +
      '"the trainee" or "this trainee" — naturally, not in every single sentence. ' +
      "summary is a substantive 3-5 sentence overview of this trainee's actual knowledge level on THIS course's " +
      "content — reference the real percentage figures given to you for each category, name specific strengths and " +
      "gaps rather than speaking generically, and describe what the pattern of results suggests about their " +
      "underlying understanding (e.g. do they know facts but misapply them, or are whole categories genuinely " +
      "unfamiliar). strong/improve list broad CATEGORY names (max 4 each) based on the category results. " +
      "focusTopics lists the specific LEARNING TOPICS (max 5) where this trainee should concentrate their revision " +
      "next, chosen from the topic results — prioritize topics with low accuracy, and be specific (e.g. " +
      "'Chronograph tachymeter function' rather than just repeating a category name). recommendation is one or two " +
      "sentences naming a concrete next study action.",
    messages: [
      {
        role: "user",
        content: `Quiz: ${params.quizTitle}\n\nCategory results (with percentages):\n${params.categoryBreakdown
          .map((c) => `- ${c.category}: ${c.correct}/${c.total} correct (${Math.round((c.correct / c.total) * 100)}%)`)
          .join("\n")}\n\nLearning topic results (with percentages):\n${params.topicBreakdown
          .map((t) => `- ${t.topic}: ${t.correct}/${t.total} correct (${Math.round((t.correct / t.total) * 100)}%)`)
          .join("\n")}`
      }
    ]
  });
  return safeParseJson(extractText(msg), { summary: "", strong: [], improve: [], focusTopics: [], recommendation: "" });
}

/** Admin-facing aggregate analysis across all participants (spec §33-34). */
export async function generateQuizPerformanceAnalysis(params: {
  quizTitle: string;
  participantCount: number;
  averageScorePercent: number;
  passRatePercent: number;
  averageCompletionSeconds: number;
  questionDifficulty: { questionText: string; correctPercent: number }[];
  categoryBreakdown: { category: string; correct: number; total: number }[];
  topicBreakdown: { topic: string; correct: number; total: number }[];
  speedVsAccuracyNote: string;
}): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      "You write a detailed trainer-facing performance analysis for a luxury retail quiz session, covering the " +
      "WHOLE GROUP's knowledge on this course's content. Plain prose, 8-12 sentences, no headers or bullet lists. " +
      "Reference concrete numbers given to you — category and topic percentages especially, not just the overall " +
      "average. Explicitly name which categories/topics the group as a whole is strong in and which need a " +
      "refresher, call out the hardest and easiest individual questions by their text, note any speed-vs-accuracy " +
      "trade-off, and end with two or three specific, actionable training recommendations for what to cover in the " +
      "next session.",
    messages: [
      {
        role: "user",
        content:
          `Quiz: ${params.quizTitle}\n` +
          `Participants: ${params.participantCount}\n` +
          `Average score: ${params.averageScorePercent}%\n` +
          `Pass rate: ${params.passRatePercent}%\n` +
          `Average completion time: ${Math.round(params.averageCompletionSeconds)}s\n` +
          `Category results (with percentages):\n${params.categoryBreakdown
            .map((c) => `- ${c.category}: ${c.correct}/${c.total} correct (${Math.round((c.correct / c.total) * 100)}%)`)
            .join("\n")}\n` +
          `Learning topic results (with percentages):\n${params.topicBreakdown
            .map((t) => `- ${t.topic}: ${t.correct}/${t.total} correct (${Math.round((t.correct / t.total) * 100)}%)`)
            .join("\n")}\n` +
          `Question difficulty (% who got it right):\n${params.questionDifficulty
            .map((q) => `- "${q.questionText}": ${q.correctPercent}%`)
            .join("\n")}\n` +
          `Speed/accuracy observation: ${params.speedVsAccuracyNote}`
      }
    ]
  });

  return extractText(msg);
}

function extractText(msg: Anthropic.Messages.Message): string {
  return msg.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function safeParseJson<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/^```json\s*|```$/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * Translates one question + its four options into the target language.
 * Called once per (session, question, language) and cached — see
 * `question_translations` in supabase/schema.sql — never once per
 * participant, so a 300-person session doesn't fan out into hundreds of
 * AI calls for the same question.
 */
export async function translateQuestion(params: {
  languageName: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  explanation?: string; // only ever needed for the results page, never the live question
}): Promise<{ question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; explanation: string }> {
  const fallback = {
    question_text: params.questionText,
    option_a: params.optionA,
    option_b: params.optionB,
    option_c: params.optionC,
    option_d: params.optionD,
    explanation: params.explanation ?? ""
  };

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system:
      `Translate the given watch-retail training quiz question, its four answer options` +
      `${params.explanation ? ", and its explanation" : ""} into ${params.languageName}. ` +
      "Keep technical horology terms accurate and natural for a retail sales context. Return ONLY valid JSON, no preamble, " +
      'no markdown fences, matching exactly: {"question_text": string, "option_a": string, "option_b": string, "option_c": string, "option_d": string, "explanation": string}. ' +
      'If no explanation was provided, return "" for that field — do not invent one.',
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          question_text: params.questionText,
          option_a: params.optionA,
          option_b: params.optionB,
          option_c: params.optionC,
          option_d: params.optionD,
          explanation: params.explanation ?? ""
        })
      }
    ]
  });

  return safeParseJson(extractText(msg), fallback);
}

/**
 * Translates the fixed waiting-screen instruction bullets (question
 * count, timer, scoring rules, pass mark) as plain strings. Unlike
 * translateQuestion, this only ever needs to preserve meaning, not any
 * inline styling — the numbers are already baked into each English
 * sentence before this is called, and the translation just needs to
 * carry them through naturally (a competent translation keeps numerals
 * as numerals in virtually every language this app supports).
 */
export async function translateBullets(languageName: string, bullets: string[]): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system:
      `Translate each of the following short quiz-instruction sentences into ${languageName}, keeping any numbers ` +
      "exactly as numerals. Return ONLY a valid JSON array of strings, same length and order as given, no preamble, " +
      "no markdown fences.",
    messages: [{ role: "user", content: JSON.stringify(bullets) }]
  });
  const parsed = safeParseJson<string[]>(extractText(msg), bullets);
  return Array.isArray(parsed) && parsed.length === bullets.length ? parsed : bullets;
}

/**
 * Checks a question's text fields for genuine spelling/typo errors —
 * deliberately conservative, since this content is full of brand names
 * (Cerruti, Longines), model names, and technical horology terms that a
 * naive spell-checker would flag as "wrong" when they're not. Only
 * returns fields that actually had a real issue, with the corrected
 * version — the admin reviews and applies each one, nothing is changed
 * automatically.
 */
export async function checkQuestionSpelling(params: {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  explanation: string;
}): Promise<{ field: "questionText" | "optionA" | "optionB" | "optionC" | "optionD" | "explanation"; original: string; corrected: string }[]> {
  const fields: Array<[string, string]> = [
    ["questionText", params.questionText],
    ["optionA", params.optionA],
    ["optionB", params.optionB],
    ["optionC", params.optionC],
    ["optionD", params.optionD],
    ["explanation", params.explanation]
  ];
  const nonEmpty = fields.filter(([, text]) => text && text.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system:
      "You proofread short pieces of text from a luxury watch retail training quiz for genuine spelling and typo " +
      "errors only — not grammar style, not phrasing, not word choice. Be conservative: brand names (e.g. Cerruti, " +
      "Longines, Palm Angels), watch model names, and technical horology terms (e.g. tourbillon, chronograph, " +
      "tachymeter) are correct as given even if unusual — never 'fix' those. Return ONLY a valid JSON array, no " +
      'preamble, no markdown fences, of objects {"field": string, "corrected": string} — ONLY for fields that ' +
      "actually contain a real spelling/typo error, with the field name exactly as given and the fully corrected " +
      "text for that field. Return an empty array [] if nothing needs fixing.",
    messages: [
      {
        role: "user",
        content: JSON.stringify(Object.fromEntries(nonEmpty))
      }
    ]
  });

  const parsed = safeParseJson<{ field: string; corrected: string }[]>(extractText(msg), []);
  if (!Array.isArray(parsed)) return [];

  const originals = Object.fromEntries(nonEmpty);
  return parsed
    .filter((r) => r.field in originals && typeof r.corrected === "string" && r.corrected !== originals[r.field as keyof typeof originals])
    .map((r) => ({
      field: r.field as "questionText" | "optionA" | "optionB" | "optionC" | "optionD" | "explanation",
      original: originals[r.field as keyof typeof originals],
      corrected: r.corrected
    }));
}

/**
 * Suggests a short, easy-to-understand feedback message for one specific
 * wrong answer option — shown to a participant who picked it, explaining
 * why it's wrong in a way that actually helps them understand the
 * concept, not just "incorrect." The admin reviews and can edit before
 * saving; this only ever fills in a starting draft.
 */
export async function suggestWrongAnswerFeedback(params: {
  questionText: string;
  correctText: string;
  wrongOptionText: string;
  explanation?: string;
}): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 150,
    system:
      "You write a single short, encouraging feedback sentence (max 25 words) shown to a luxury watch retail " +
      "trainee who picked a WRONG answer on a quiz question. Explain simply why that specific wrong choice is " +
      "incorrect and briefly point toward the actual concept — plain language, easy to understand quickly on a " +
      "phone screen, not a lecture. Return ONLY the sentence itself, no preamble, no quotation marks.",
    messages: [
      {
        role: "user",
        content:
          `Question: ${params.questionText}\n` +
          `The wrong answer they picked: ${params.wrongOptionText}\n` +
          `The correct answer: ${params.correctText}` +
          (params.explanation ? `\nGeneral explanation: ${params.explanation}` : "")
      }
    ]
  });
  return extractText(msg).trim().replace(/^"|"$/g, "");
}
