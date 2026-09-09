import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";
import { preWarmQuestionTranslations } from "@/lib/question-translation-cache";
import { LiveSession } from "@/lib/types";

const COUNTDOWN_SECONDS = 3;
const COUNTDOWN_SECONDS_WITH_TRANSLATION = 6; // extra safety margin on top of pre-warming — belt and suspenders, not the primary fix

// POST /api/sessions/:id/start
// Presenter-controlled model (migration 002): starting a quiz now also
// puts question 0 live for EVERY participant at once, with a shared
// server-side deadline — not just flipping status and letting each
// participant free-run from there.
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

  // Pre-translate question 0 for every language already joined, BEFORE
  // starting the 3-2-1 countdown below — not during it. This is what
  // stops a translated participant's timer effectively running while
  // they're still waiting on a live translation call: by the time the
  // countdown even begins, the cache is already warm. Only adds delay
  // to this "Start quiz" click itself (a presenter action, not a scored
  // one), and only the first time each language needs this question.
  const translationEnabled = session.quiz_snapshot.quiz.translation_enabled;
  if (translationEnabled) {
    await preWarmQuestionTranslations(params.id, 0, session.quiz_snapshot.questions[0]);
  }

  // A slightly longer countdown when translation is on — the pre-warm
  // above already does the real work, this is just extra buffer for
  // anything unexpected (a slow network moment, a brand-new language
  // that slipped in right at the wrong instant). 6s, not 10s: enough
  // margin without needlessly slowing the room down for everyone on
  // every single question.
  const countdownSeconds = translationEnabled ? COUNTDOWN_SECONDS_WITH_TRANSLATION : COUNTDOWN_SECONDS;
  const startsAt = new Date(Date.now() + countdownSeconds * 1000);
  const questionTimerSeconds = session.quiz_snapshot.quiz.question_timer_seconds ?? 20;
  const phaseDeadline = new Date(startsAt.getTime() + questionTimerSeconds * 1000);

  const { data: updated, error } = await supabaseAdmin
    .from("sessions")
    .update({
      status: "live",
      started_at: startsAt.toISOString(),
      current_question_index: 0,
      current_question_started_at: startsAt.toISOString(),
      phase: "question",
      phase_deadline: phaseDeadline.toISOString()
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every joined participant's browser is subscribed to this channel and
  // runs its own local 3-2-1 against `startsAt`, so the countdown lands in
  // sync regardless of individual network latency.
  await broadcastSessionEvent(params.id, "quiz_started", { startsAt: startsAt.toISOString() });

  return NextResponse.json({ session: updated });
}
