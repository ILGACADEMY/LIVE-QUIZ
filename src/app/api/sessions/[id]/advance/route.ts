import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";
import { preWarmQuestionTranslations } from "@/lib/question-translation-cache";
import { LiveSession } from "@/lib/types";

// POST /api/sessions/:id/advance
//
// The presenter's single "Next" control. What it does depends on the
// session's current phase — this is a deliberate two-click pattern
// (reveal, then advance) for a QUESTION, matching how Kahoot/Menti-style
// tools behave and giving the room a clear moment to see the answer
// before moving on:
//
//   phase === 'question' → reveal now (cuts the timer short if it hasn't
//                           expired yet; harmless no-op if it already has,
//                           since the state route auto-reveals on timeout)
//   phase === 'revealed' → advance to the next item (or finish the
//                           quiz if that was the last one)
//
// An INFO PAGE (item_type 'info_page') is different — there's no
// correct answer to reveal, so its "Next" click goes straight from
// 'question' phase to the next item in one step, reusing the exact same
// move-to-next-item logic a question's second click uses. It also never
// gets a phase_deadline (see moveToNextItem below), so the self-healing
// auto-reveal check in the state route naturally never fires for it —
// nothing there needed to change to make that true.
//
// This never runs on a timer by itself — only ever in response to a
// presenter clicking the button, or (for a question's question →
// revealed step only) automatically once the per-question deadline
// passes, handled by the self-healing check in the state route rather
// than here.
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
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

  // Shared by both "revealed → next" (a question's second click) and
  // "question → next" (an info page's only click) — moves to the next
  // item, or finishes the quiz if there wasn't one. Kept as one function
  // so there's a single place this logic lives, not two copies that
  // could quietly drift apart.
  async function moveToNextItem(fromPhase: "question" | "revealed") {
    const items = session!.quiz_snapshot.questions;
    const totalItems = items.length;
    const nextIndex = session!.current_question_index + 1;

    if (nextIndex >= totalItems) {
      const endedAt = new Date();
      const deleteAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);

      const { error } = await supabaseAdmin
        .from("sessions")
        .update({ status: "finished", phase: "finished", ended_at: endedAt.toISOString(), delete_at: deleteAt.toISOString(), phase_deadline: null })
        .eq("id", params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await supabaseAdmin
        .from("participants")
        .update({ completed_at: endedAt.toISOString() })
        .eq("session_id", params.id)
        .is("completed_at", null);

      await broadcastSessionEvent(params.id, "quiz_ended", { deleted: false });
      return NextResponse.json({ phase: "finished" });
    }

    const nextItem = items[nextIndex];
    const nextIsInfoPage = nextItem.item_type === "info_page";

    // A short shared countdown before the item actually appears —
    // matches the 3-2-1 the room already sees at the very beginning of
    // the quiz, kept consistent whether the next item is a question or
    // an info page. Longer (6s vs 3s) when translation is on for a
    // question — an info page has no answer text to translate ahead of
    // time in the same way, so it always uses the shorter countdown.
    const COUNTDOWN_MS = (!nextIsInfoPage && session!.quiz_snapshot.quiz.translation_enabled ? 6 : 3) * 1000;
    const startedAt = new Date(Date.now() + COUNTDOWN_MS);
    // An info page never gets a phase_deadline — no auto-timer, no
    // auto-reveal-on-timeout; the presenter reads it and advances
    // whenever they're ready. This single null is what keeps the
    // self-healing check in the state route naturally inert for it.
    const questionTimerSeconds = session!.quiz_snapshot.quiz.question_timer_seconds ?? 20;
    const deadline = nextIsInfoPage ? null : new Date(startedAt.getTime() + questionTimerSeconds * 1000);

    if (!nextIsInfoPage && session!.quiz_snapshot.quiz.translation_enabled) {
      await preWarmQuestionTranslations(params.id, nextIndex, nextItem);
    }

    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        current_question_index: nextIndex,
        current_question_started_at: startedAt.toISOString(),
        phase: "question",
        phase_deadline: deadline ? deadline.toISOString() : null
      })
      .eq("id", params.id)
      .eq("phase", fromPhase); // guards against a double-click race
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await broadcastSessionEvent(params.id, "question_advanced", {
      questionIndex: nextIndex,
      startsAt: startedAt.toISOString()
    });
    return NextResponse.json({ phase: "question", questionIndex: nextIndex });
  }

  if (session.phase === "question") {
    const currentItem = session.quiz_snapshot.questions[session.current_question_index];
    if (currentItem.item_type === "info_page") {
      return moveToNextItem("question");
    }

    const { error } = await supabaseAdmin
      .from("sessions")
      .update({ phase: "revealed", phase_deadline: null })
      .eq("id", params.id)
      .eq("phase", "question"); // guards against a double-click race
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const nextIndex = session.current_question_index + 1;
    const nextItem = session.quiz_snapshot.questions[nextIndex];
    if (
      session.quiz_snapshot.quiz.translation_enabled &&
      nextIndex < session.quiz_snapshot.questions.length &&
      nextItem.item_type !== "info_page"
    ) {
      await preWarmQuestionTranslations(params.id, nextIndex, nextItem);
    }

    await broadcastSessionEvent(params.id, "question_revealed", {
      questionIndex: session.current_question_index
    });
    return NextResponse.json({ phase: "revealed" });
  }

  if (session.phase === "revealed") {
    return moveToNextItem("revealed");
  }

  return NextResponse.json({ error: `Cannot advance from phase '${session.phase}'.` }, { status: 409 });
}
