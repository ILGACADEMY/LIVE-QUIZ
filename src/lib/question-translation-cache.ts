import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { translateQuestion } from "./ai";
import { languageName } from "./languages";
import { Question } from "./types";

/**
 * Translates and caches one question into one language, if it isn't
 * cached already. Silently does nothing on failure — this is always a
 * best-effort warm-up; if it doesn't complete in time, the live question
 * screen's own on-demand translation (in the state route) still catches
 * it as a fallback, same as before this existed. Exported directly (not
 * just via preWarmQuestionTranslations below) for the one case that
 * needs a SPECIFIC language rather than "every language already joined"
 * — a participant joining mid-quiz with a language nobody's picked yet,
 * warmed at their own join time before they're in the participants
 * table for the broader helper below to see.
 */
export async function ensureQuestionTranslated(sessionId: string, questionIndex: number, q: Question, languageCode: string): Promise<void> {
  if (languageCode === "en") return;

  const { data: cached } = await supabaseAdmin
    .from("question_translations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("question_index", questionIndex)
    .eq("language_code", languageCode)
    .maybeSingle();
  if (cached) return;

  try {
    const translated = await translateQuestion({
      languageName: languageName(languageCode),
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c,
      optionD: q.option_d
    });
    await supabaseAdmin.from("question_translations").upsert(
      {
        session_id: sessionId,
        question_index: questionIndex,
        language_code: languageCode,
        question_text: translated.question_text,
        option_a: translated.option_a,
        option_b: translated.option_b,
        option_c: translated.option_c,
        option_d: translated.option_d
      },
      { onConflict: "session_id,question_index,language_code" }
    );
  } catch (err) {
    console.error("Pre-translation warm-up error (non-fatal — live fallback still applies):", err);
  }
}

/**
 * Pre-warms a question's translation cache for every language currently
 * represented among joined participants, in parallel. Called from:
 *   - /start, for question 0, the moment the presenter clicks Start
 *   - /advance, for the NEXT question, the moment the current one is
 *     revealed — so translation happens during the reveal screen's
 *     dwell time (however long the presenter spends on it), not during
 *     the next question's scored, timed window.
 * This deliberately makes the PRESENTER's click wait a few seconds the
 * first time a given language needs a given question warmed — that's
 * the right place for this latency to live, since it's not scored,
 * rather than making a translated participant's answering window
 * effectively shorter than everyone else's.
 *
 * A genuinely new language that nobody had picked yet, appearing for
 * the first time exactly as a question goes live, isn't covered by
 * this — there's no way to warm a cache for a language nobody's chosen
 * before it's chosen. That case still falls back to the same on-demand
 * translation as before, with the same delay. Everything else — the
 * overwhelming majority of cases — is fixed.
 */
export async function preWarmQuestionTranslations(sessionId: string, questionIndex: number, question: Question): Promise<void> {
  const { data: participants } = await supabaseAdmin.from("participants").select("language").eq("session_id", sessionId);
  const languages = Array.from(new Set((participants ?? []).map((p) => p.language).filter((l): l is string => !!l && l !== "en")));
  if (languages.length === 0) return;
  await Promise.all(languages.map((lang) => ensureQuestionTranslated(sessionId, questionIndex, question, lang)));
}
