import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isSessionControllerRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";
import { LiveSession } from "@/lib/types";

const COUNTDOWN_SECONDS = 3;

// POST /api/sessions/:id/start
// Presenter-controlled model (migration 002): starting a quiz now also
// puts question 0 live for EVERY participant at once, with a shared
// server-side deadline — not just flipping status and letting each
// participant free-run from there.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSessionControllerRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session, error: fetchError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (fetchError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const startsAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000);
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
