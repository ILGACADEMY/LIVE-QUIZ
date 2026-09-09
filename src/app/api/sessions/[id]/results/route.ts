import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { LiveSession } from "@/lib/types";

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
  const totalQuestions = session.quiz_snapshot.questions.length;
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

  const breakdown = answers.map((a) => {
    const q = session.quiz_snapshot.questions[a.question_index];
    return {
      questionIndex: a.question_index,
      questionText: q.question_text,
      category: q.category,
      isCorrect: a.is_correct,
      selectedText: q[OPTION_FIELD[a.selected_option as keyof typeof OPTION_FIELD]],
      correctText: q[OPTION_FIELD[q.correct_option]],
      explanation: q.explanation,
      baseScore: a.base_score,
      speedBonus: a.speed_bonus,
      questionScore: a.question_score
    };
  });

  const categoryBreakdown = Object.values(
    breakdown.reduce<Record<string, { category: string; correct: number; total: number }>>((acc, b) => {
      const key = b.category || "General";
      acc[key] = acc[key] || { category: key, correct: 0, total: 0 };
      acc[key].total += 1;
      if (b.isCorrect) acc[key].correct += 1;
      return acc;
    }, {})
  );

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
    totalScore: participant.total_score,
    baseScore: participant.base_score,
    speedBonus: participant.speed_score,
    percentage,
    passed,
    timeSeconds,
    aiFeedbackEnabled: quiz.ai_feedback_enabled,
    breakdown,
    categoryBreakdown,
    topicBreakdown
  });
}
