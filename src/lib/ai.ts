import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

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
  categoryBreakdown: { category: string; correct: number; total: number }[];
  topicBreakdown: { topic: string; correct: number; total: number }[];
}): Promise<{ strong: string[]; improve: string[]; focusTopics: string[]; recommendation: string }> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "You analyze a luxury watch retail trainee's quiz performance, broken down both by broad category and by " +
      "specific learning topic, and return ONLY valid JSON, no preamble, no markdown fences, matching exactly: " +
      '{"strong": string[], "improve": string[], "focusTopics": string[], "recommendation": string}. ' +
      "strong/improve list broad CATEGORY names (max 4 each) based on the category results. focusTopics lists the " +
      "specific LEARNING TOPICS (max 5) where this trainee should concentrate their revision next, chosen from the " +
      "topic results — prioritize topics with low accuracy, and be specific (e.g. 'Chronograph tachymeter function' " +
      "rather than just repeating a category name). recommendation is one sentence tying it together: what to " +
      "revise next and why.",
    messages: [
      {
        role: "user",
        content: `Quiz: ${params.quizTitle}\n\nCategory results:\n${params.categoryBreakdown
          .map((c) => `- ${c.category}: ${c.correct}/${c.total} correct`)
          .join("\n")}\n\nLearning topic results:\n${params.topicBreakdown
          .map((t) => `- ${t.topic}: ${t.correct}/${t.total} correct`)
          .join("\n")}`
      }
    ]
  });
  return safeParseJson(extractText(msg), { strong: [], improve: [], focusTopics: [], recommendation: "" });
}

/** Admin-facing aggregate analysis across all participants (spec §33-34). */
export async function generateQuizPerformanceAnalysis(params: {
  quizTitle: string;
  participantCount: number;
  averageScorePercent: number;
  passRatePercent: number;
  averageCompletionSeconds: number;
  questionDifficulty: { questionText: string; correctPercent: number }[];
  speedVsAccuracyNote: string;
}): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "You write a concise trainer-facing performance analysis for a luxury retail quiz session. " +
      "Plain prose, 4-6 sentences, no headers or bullet lists. Reference concrete numbers given to you. " +
      "Call out the hardest and easiest questions by their text, note any speed-vs-accuracy trade-off, " +
      "and end with one specific training recommendation.",
    messages: [
      {
        role: "user",
        content:
          `Quiz: ${params.quizTitle}\n` +
          `Participants: ${params.participantCount}\n` +
          `Average score: ${params.averageScorePercent}%\n` +
          `Pass rate: ${params.passRatePercent}%\n` +
          `Average completion time: ${Math.round(params.averageCompletionSeconds)}s\n` +
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
}): Promise<{ question_text: string; option_a: string; option_b: string; option_c: string; option_d: string }> {
  const fallback = {
    question_text: params.questionText,
    option_a: params.optionA,
    option_b: params.optionB,
    option_c: params.optionC,
    option_d: params.optionD
  };

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      `Translate the given watch-retail training quiz question and its four answer options into ${params.languageName}. ` +
      "Keep technical horology terms accurate and natural for a retail sales context. Return ONLY valid JSON, no preamble, " +
      'no markdown fences, matching exactly: {"question_text": string, "option_a": string, "option_b": string, "option_c": string, "option_d": string}.',
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          question_text: params.questionText,
          option_a: params.optionA,
          option_b: params.optionB,
          option_c: params.optionC,
          option_d: params.optionD
        })
      }
    ]
  });

  return safeParseJson(extractText(msg), fallback);
}

