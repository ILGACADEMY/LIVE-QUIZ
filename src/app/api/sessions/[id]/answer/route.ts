import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { scoreAnswer } from "@/lib/scoring";
import { broadcastSessionEvent } from "@/lib/realtime";
import { LiveSession, OptionKey } from "@/lib/types";

const VALID_OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

// POST /api/sessions/:id/answer — { participantId, questionIndex, selectedOption }
// Scoring is still entirely server-side, but elapsed time is now measured
// from the SESSION's current_question_started_at (shared by everyone),
// not a per-participant timestamp — matching the presenter-controlled
// model where one question is live for the whole room at once.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const receivedAt = Date.now();
  const { participantId, questionIndex, selectedOption } = await req.json();

  if (!participantId || typeof questionIndex !== "number" || !VALID_OPTIONS.includes(selectedOption)) {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (sessionError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status !== "live") {
    return NextResponse.json({ error: "This quiz is not currently live." }, { status: 409 });
  }

  // Reject answers for anything other than the ONE question currently live
  // for the whole room — this is what makes it impossible to answer a
  // question that's already been revealed, or one that hasn't started yet.
  if (session.phase !== "question" || session.current_question_index !== questionIndex) {
    return NextResponse.json({ error: "This question is no longer active." }, { status: 409 });
  }
  if (session.phase_deadline && receivedAt > new Date(session.phase_deadline).getTime()) {
    return NextResponse.json({ error: "Time is up for this question." }, { status: 409 });
  }
  if (!session.current_question_started_at) {
    return NextResponse.json({ error: "Question timer was not started." }, { status: 409 });
  }
  // Defense in depth for the pre-question countdown: a correctly-behaving
  // client withholds the question during the shared 3-2-1, so this
  // shouldn't normally trigger, but a submission arriving before the
  // question has actually started (by server clock, not client clock)
  // is rejected outright rather than silently scored.
  if (receivedAt < new Date(session.current_question_started_at).getTime()) {
    return NextResponse.json({ error: "This question hasn't started yet." }, { status: 409 });
  }

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  if (participant.completed_at) {
    return NextResponse.json({ error: "You have already finished this quiz." }, { status: 409 });
  }

  const question = session.quiz_snapshot.questions[questionIndex];
  if (!question) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const elapsedMs = receivedAt - new Date(session.current_question_started_at).getTime();

  const result = scoreAnswer({
    selectedOption,
    correctOption: question.correct_option,
    elapsedMs,
    scoringMode: session.quiz_snapshot.quiz.scoring_mode,
    speedBonusWindowSeconds: session.quiz_snapshot.quiz.speed_bonus_window_seconds
  });

  // Unique (session_id, participant_id, question_index) constraint makes
  // this the authoritative guard against double submission at the DB level.
  const { error: insertError } = await supabaseAdmin.from("answers").insert({
    session_id: params.id,
    participant_id: participantId,
    question_index: questionIndex,
    selected_option: selectedOption,
    is_correct: result.isCorrect,
    base_score: result.baseScore,
    speed_bonus: result.speedBonus,
    question_score: result.questionScore,
    elapsed_ms: elapsedMs
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Answer already recorded for this question." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Score totals update immediately; advancing to the next question is now
  // entirely the presenter's call (POST /advance), never automatic here —
  // so current_question_index/current_question_started_at/completed_at are
  // no longer touched on the participant row at all.
  const { error: updateError } = await supabaseAdmin
    .from("participants")
    .update({
      base_score: participant.base_score + result.baseScore,
      speed_score: participant.speed_score + result.speedBonus,
      total_score: participant.total_score + result.questionScore,
      last_submission_at: new Date().toISOString()
    })
    .eq("id", participantId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { count: answeredCount } = await supabaseAdmin
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("session_id", params.id)
    .eq("question_index", questionIndex);

  await broadcastSessionEvent(params.id, "answer_count", {
    questionIndex,
    answered: answeredCount ?? 0
  });

  // Never return correctness or the correct option here — participants
  // find out together when the presenter (or the timer) reveals it.
  return NextResponse.json({ locked: true });
}
