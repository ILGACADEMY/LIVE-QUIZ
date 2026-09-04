import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { LiveSession, PublicQuestion } from "@/lib/types";

function toPublicQuestion(session: LiveSession, index: number): PublicQuestion | null {
  const q = session.quiz_snapshot.questions[index];
  if (!q) return null;
  return {
    index,
    question_text: q.question_text,
    image_url: q.image_url,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    category: q.category,
    difficulty: q.difficulty
  };
}

// GET /api/sessions/:id/state?participantId=...
// Without participantId → aggregate counters only (safe for admin dashboard
// and the public leaderboard screen; no answer key, no participant names).
// With participantId → that participant's next question / waiting / finished
// state, and lazily starts their server-side per-question timer.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const totalQuestions = session.quiz_snapshot.questions.length;

  if (!participantId) {
    const [{ count: joined }, { data: progressRows }, { count: completed }, { count: answeredTotal }] = await Promise.all([
      supabaseAdmin.from("participants").select("*", { count: "exact", head: true }).eq("session_id", params.id),
      supabaseAdmin.from("participants").select("current_question_index").eq("session_id", params.id).gt("current_question_index", 0),
      supabaseAdmin
        .from("participants")
        .select("*", { count: "exact", head: true })
        .eq("session_id", params.id)
        .not("completed_at", "is", null),
      supabaseAdmin.from("answers").select("*", { count: "exact", head: true }).eq("session_id", params.id)
    ]);

    const started = progressRows?.length ?? 0;
    const avgQuestionIndex = started
      ? Math.round((progressRows!.reduce((s, r) => s + r.current_question_index, 0) / started) * 10) / 10
      : 0;

    return NextResponse.json({
      status: session.status,
      quizTitle: session.quiz_snapshot.quiz.title,
      totalQuestions,
      timeLimitMinutes: session.quiz_snapshot.quiz.time_limit_minutes,
      startedAt: session.started_at,
      counts: {
        joined: joined ?? 0,
        started,
        completed: completed ?? 0,
        answersReceived: answeredTotal ?? 0,
        avgQuestionIndex
      }
    });
  }

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  if (session.status !== "live") {
    return NextResponse.json({ status: session.status, phase: "waiting" });
  }

  // Enforce the total quiz timer (spec §24): once time is up, no more
  // answers, regardless of what question the participant is on.
  const deadline = session.started_at
    ? new Date(session.started_at).getTime() + session.quiz_snapshot.quiz.time_limit_minutes * 60_000
    : null;
  const timeExpired = deadline !== null && Date.now() > deadline;

  if (timeExpired && !participant.completed_at) {
    await supabaseAdmin
      .from("participants")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", participant.id);
  }

  if (timeExpired || participant.completed_at || participant.current_question_index >= totalQuestions) {
    return NextResponse.json({
      status: "live",
      phase: "finished",
      totalScore: participant.total_score,
      totalQuestions
    });
  }

  // Lazily start this participant's per-question timer the first time they
  // fetch the question — this timestamp is what scoring is measured against.
  if (!participant.current_question_started_at) {
    const startedAt = new Date().toISOString();
    await supabaseAdmin
      .from("participants")
      .update({ current_question_started_at: startedAt })
      .eq("id", participant.id);
    participant.current_question_started_at = startedAt;
  }

  const { count: answeredSoFar } = await supabaseAdmin
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("session_id", params.id)
    .eq("question_index", participant.current_question_index);

  return NextResponse.json({
    status: "live",
    phase: "question",
    question: toPublicQuestion(session, participant.current_question_index),
    questionNumber: participant.current_question_index + 1,
    totalQuestions,
    questionStartedAt: participant.current_question_started_at,
    speedBonusEnabled: session.quiz_snapshot.quiz.scoring_mode === "speed_bonus",
    speedBonusWindowSeconds: session.quiz_snapshot.quiz.speed_bonus_window_seconds,
    afterAnswerMode: session.quiz_snapshot.quiz.after_answer_mode,
    answeredSoFar: answeredSoFar ?? 0,
    deadline
  });
}
