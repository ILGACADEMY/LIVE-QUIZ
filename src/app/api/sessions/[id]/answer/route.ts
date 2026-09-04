import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { scoreAnswer } from "@/lib/scoring";
import { broadcastSessionEvent } from "@/lib/realtime";
import { LiveSession, OptionKey } from "@/lib/types";

const VALID_OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

// POST /api/sessions/:id/answer — { participantId, questionIndex, selectedOption }
// This is the only place scoring happens. The client never sends elapsed
// time or a score — only which option was picked. Everything else is
// derived server-side from participant.current_question_started_at
// (spec §11, §43).
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

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  // Reject answers for a question the participant isn't currently on. This
  // is what makes double-submission and answer-after-advance impossible,
  // on top of the DB unique constraint as a second line of defense.
  if (participant.current_question_index !== questionIndex) {
    return NextResponse.json({ error: "This question is no longer active for you." }, { status: 409 });
  }
  if (!participant.current_question_started_at) {
    return NextResponse.json({ error: "Question timer was not started." }, { status: 409 });
  }
  if (participant.completed_at) {
    return NextResponse.json({ error: "You have already finished this quiz." }, { status: 409 });
  }

  const deadline = session.started_at
    ? new Date(session.started_at).getTime() + session.quiz_snapshot.quiz.time_limit_minutes * 60_000
    : null;
  if (deadline !== null && receivedAt > deadline) {
    await supabaseAdmin.from("participants").update({ completed_at: new Date().toISOString() }).eq("id", participant.id);
    return NextResponse.json({ error: "Time is up for this quiz." }, { status: 409 });
  }

  const question = session.quiz_snapshot.questions[questionIndex];
  if (!question) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const elapsedMs = receivedAt - new Date(participant.current_question_started_at).getTime();

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

  const totalQuestions = session.quiz_snapshot.questions.length;
  const nextIndex = questionIndex + 1;
  const isLastQuestion = nextIndex >= totalQuestions;

  const { error: updateError } = await supabaseAdmin
    .from("participants")
    .update({
      base_score: participant.base_score + result.baseScore,
      speed_score: participant.speed_score + result.speedBonus,
      total_score: participant.total_score + result.questionScore,
      current_question_index: nextIndex,
      current_question_started_at: null,
      last_submission_at: new Date().toISOString(),
      completed_at: isLastQuestion ? new Date().toISOString() : null
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

  // Never return correctness or the correct option here — the UI shows only
  // a neutral "Answer locked" confirmation during the live quiz (spec §13).
  return NextResponse.json({ locked: true, isLastQuestion });
}
