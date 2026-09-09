import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";
import { LiveSession } from "@/lib/types";

// POST /api/sessions/:id/advance
//
// The presenter's single "Next" control. What it does depends on the
// session's current phase — this is a deliberate two-click pattern
// (reveal, then advance), matching how Kahoot/Menti-style tools behave
// and giving the room a clear moment to see the answer before moving on:
//
//   phase === 'question' → reveal now (cuts the timer short if it hasn't
//                           expired yet; harmless no-op if it already has,
//                           since the state route auto-reveals on timeout)
//   phase === 'revealed' → advance to the next question (or finish the
//                           quiz if that was the last one)
//
// This never runs on a timer by itself — only ever in response to a
// presenter clicking the button, or (for the question → revealed step
// only) automatically once the per-question deadline passes, handled by
// the self-healing check in the state route rather than here.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session, error: fetchError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (fetchError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (session.status !== "live") {
    return NextResponse.json({ error: "This quiz is not currently live." }, { status: 409 });
  }

  if (session.phase === "question") {
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({ phase: "revealed", phase_deadline: null })
      .eq("id", params.id)
      .eq("phase", "question"); // guards against a double-click race
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await broadcastSessionEvent(params.id, "question_revealed", {
      questionIndex: session.current_question_index
    });
    return NextResponse.json({ phase: "revealed" });
  }

  if (session.phase === "revealed") {
    const totalQuestions = session.quiz_snapshot.questions.length;
    const nextIndex = session.current_question_index + 1;

    if (nextIndex >= totalQuestions) {
      const endedAt = new Date();
      const deleteAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);

      const { error } = await supabaseAdmin
        .from("sessions")
        .update({ status: "finished", phase: "finished", ended_at: endedAt.toISOString(), delete_at: deleteAt.toISOString(), phase_deadline: null })
        .eq("id", params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Presenter-driven completion (unlike the old self-paced model)
      // means participants don't individually set their own completed_at
      // as they finish — mark everyone who hasn't already been marked
      // (e.g. by the manual /end route) complete now, all at once.
      await supabaseAdmin
        .from("participants")
        .update({ completed_at: endedAt.toISOString() })
        .eq("session_id", params.id)
        .is("completed_at", null);

      await broadcastSessionEvent(params.id, "quiz_ended", { deleted: false });
      return NextResponse.json({ phase: "finished" });
    }

    const startedAt = new Date();
    const questionTimerSeconds = session.quiz_snapshot.quiz.question_timer_seconds ?? 20;
    const deadline = new Date(startedAt.getTime() + questionTimerSeconds * 1000);

    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        current_question_index: nextIndex,
        current_question_started_at: startedAt.toISOString(),
        phase: "question",
        phase_deadline: deadline.toISOString()
      })
      .eq("id", params.id)
      .eq("phase", "revealed"); // guards against a double-click race
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await broadcastSessionEvent(params.id, "question_advanced", { questionIndex: nextIndex });
    return NextResponse.json({ phase: "question", questionIndex: nextIndex });
  }

  return NextResponse.json({ error: `Cannot advance from phase '${session.phase}'.` }, { status: 409 });
}
