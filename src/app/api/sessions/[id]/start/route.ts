import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";

const COUNTDOWN_SECONDS = 3;

// POST /api/sessions/:id/start
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startsAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString();

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .update({ status: "live", started_at: startsAt })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every joined participant's browser is subscribed to this channel and
  // runs its own local 3-2-1 against `startsAt`, so the countdown lands in
  // sync regardless of individual network latency.
  await broadcastSessionEvent(params.id, "quiz_started", { startsAt });

  return NextResponse.json({ session });
}
