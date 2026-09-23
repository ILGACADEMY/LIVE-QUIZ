import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { LiveSession, countScoredQuestions } from "@/lib/types";
import { translateQuestion } from "@/lib/ai";
import { languageName } from "@/lib/languages";
import { getPreviousAttempt, getParticipantProfile } from "@/lib/attempt-history";

const OPTION_FIELD = { A: "option_a", B: "option_b", C: "option_c", D: "option_d" } as const;

// GET /api/sessions/:id/results?participantId=...
// Only shown once the participant has finished — correctness and the
// answer key are withheld until then (spec §13, §28).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ error: "participantId is required" }, { status: 400 });

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (sessionError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  if (!participant.completed_at) {
    return NextResponse.json({ error: "Quiz not finished yet." }, { status: 409 });
  }

  const { data: answers, error: aError } = await supabaseAdmin
    .from("answers")
    .select("*")
    .eq("session_id", params.id)
    .eq("participant_id", participantId)
    .order("question_index", { ascending: true });
  if (aError) return NextResponse.json({ error: aError.message }, { status: 500 });

  const quiz = session.quiz_snapshot.quiz;
  // Scores against how many questions were ACTUALLY presented in this
  // session, not the full quiz template's length — ending a quiz early
  // (a deliberate "cut it short, find a winner now" call) must not
  // silently divide everyone's score by questions they never had a
  // chance to see. Falls back to the full deck length only for a
  // session finished before this column existed.
  const totalQuestions = session.questions_presented ?? countScoredQuestions(session.quiz_snapshot.questions);
  const correctCount = answers.filter((a) => a.is_correct).length;
  const percentage = Math.round((correctCount / totalQuestions) * 100);
  const passed = percentage >= quiz.pass_mark_percent;

  const timeSeconds =
    participant.completed_at && participant.joined_at
      ? Math.round(
          (new Date(participant.completed_at).getTime() - new Date(session.started_at ?? participant.joined_at).getTime()) /
            1000
        )
      : null;

  // Results are the one place a participant's language choice should
  // show up even though nothing live ever revealed this content to them
  // (see the "correct/incorrect only" change earlier) — this is where
  // they actually read the correct answer and the explanation, so it's
  // the place that matters most to get translated.
  const language = participant.language ?? "en";
  const shouldTranslate = language !== "en" && quiz.translation_enabled;

  const breakdown = await Promise.all(
    answers.map(async (a) => {
      const q = session.quiz_snapshot.questions[a.question_index];
      const selectedText = q[OPTION_FIELD[a.selected_option as keyof typeof OPTION_FIELD]];
      const correctText = q[OPTION_FIELD[q.correct_option]];

      if (!shouldTranslate) {
        return {
          questionIndex: a.question_index,
          questionText: q.question_text,
          category: q.category,
          isCorrect: a.is_correct,
          selectedText,
          correctText,
          explanation: q.explanation,
          baseScore: a.base_score,
          speedBonus: a.speed_bonus,
          questionScore: a.question_score
        };
      }

      // Reuses the SAME cache table the live question screen writes to —
      // if this question was already translated during the live quiz
      // (question_text/options), this reuses that row and only needs to
      // fill in the explanation, rather than re-translating everything.
      const { data: cached } = await supabaseAdmin
        .from("question_translations")
        .select("*")
        .eq("session_id", params.id)
        .eq("question_index", a.question_index)
        .eq("language_code", language)
        .maybeSingle();

      if (cached && cached.explanation) {
        const optionMap: Record<string, string> = { A: cached.option_a, B: cached.option_b, C: cached.option_c, D: cached.option_d };
        return {
          questionIndex: a.question_index,
          questionText: cached.question_text,
          category: q.category,
          isCorrect: a.is_correct,
          selectedText: optionMap[a.selected_option] ?? selectedText,
          correctText: optionMap[q.correct_option] ?? correctText,
          explanation: cached.explanation,
          baseScore: a.base_score,
          speedBonus: a.speed_bonus,
          questionScore: a.question_score
        };
      }

      try {
        const translated = await translateQuestion({
          languageName: languageName(language),
          questionText: q.question_text,
          optionA: q.option_a,
          optionB: q.option_b,
          optionC: q.option_c,
          optionD: q.option_d,
          explanation: q.explanation
        });
        await supabaseAdmin.from("question_translations").upsert(
          {
            session_id: params.id,
            question_index: a.question_index,
            language_code: language,
            question_text: translated.question_text,
            option_a: translated.option_a,
            option_b: translated.option_b,
            option_c: translated.option_c,
            option_d: translated.option_d,
            explanation: translated.explanation
          },
          { onConflict: "session_id,question_index,language_code" }
        );
        const optionMap: Record<string, string> = {
          A: translated.option_a,
          B: translated.option_b,
          C: translated.option_c,
          D: translated.option_d
        };
        return {
          questionIndex: a.question_index,
          questionText: translated.question_text,
          category: q.category,
          isCorrect: a.is_correct,
          selectedText: optionMap[a.selected_option] ?? selectedText,
          correctText: optionMap[q.correct_option] ?? correctText,
          explanation: translated.explanation,
          baseScore: a.base_score,
          speedBonus: a.speed_bonus,
          questionScore: a.question_score
        };
      } catch (err) {
        console.error("Results translation error, falling back to English:", err);
        return {
          questionIndex: a.question_index,
          questionText: q.question_text,
          category: q.category,
          isCorrect: a.is_correct,
          selectedText,
          correctText,
          explanation: q.explanation,
          baseScore: a.base_score,
          speedBonus: a.speed_bonus,
          questionScore: a.question_score
        };
      }
    })
  );

  const categoryBreakdown = Object.values(
    breakdown.reduce<Record<string, { category: string; correct: number; total: number }>>((acc, b) => {
      const key = b.category || "General";
      acc[key] = acc[key] || { category: key, correct: 0, total: 0 };
      acc[key].total += 1;
      if (b.isCorrect) acc[key].correct += 1;
      return acc;
    }, {})
  );

  // "How did I do last time" for the results page's self-vs-own-history
  // radar — a real previous attempt if this quiz collects mobile/email
  // and one exists; the client falls back to comparing against the pass
  // mark instead when this comes back null (first attempt, or this quiz
  // never collects contact info to match on).
  const participantKey = participant.mobile || participant.email || null;
  const previousAttempt = await getPreviousAttempt(session.quiz_id, participantKey, participant.completed_at);
  // "You earned X XP — Y total" — the first visible sign of the new
  // persistent profile system. Null when this quiz doesn't collect
  // contact info, same condition as previousAttempt above, since both
  // depend on the same reliable identity.
  const profile = await getParticipantProfile(participantKey);

  // Same shape, grouped by the question's specific learning_topic instead
  // of its broader category — this is what lets the AI profile name a
  // precise thing to revise ("Chronograph tachymeter function") rather
  // than only a broad category ("Movements").
  const topicBreakdown = Object.values(
    answers.reduce<Record<string, { topic: string; correct: number; total: number }>>((acc, a) => {
      const q = session.quiz_snapshot.questions[a.question_index];
      const key = q.learning_topic || q.category || "General";
      acc[key] = acc[key] || { topic: key, correct: 0, total: 0 };
      acc[key].total += 1;
      if (a.is_correct) acc[key].correct += 1;
      return acc;
    }, {})
  );

  return NextResponse.json({
    quizTitle: quiz.title,
    name: participant.name,
    language: participant.language ?? "en",
    completedAt: participant.completed_at,
    totalScore: participant.total_score,
    baseScore: participant.base_score,
    speedBonus: participant.speed_score,
    percentage,
    passMarkPercent: quiz.pass_mark_percent,
    passed,
    timeSeconds,
    aiFeedbackEnabled: quiz.ai_feedback_enabled,
    breakdown,
    categoryBreakdown,
    topicBreakdown,
    previousAttempt,
    profile
  });
}
