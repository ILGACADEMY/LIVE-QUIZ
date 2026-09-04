import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";

// POST /api/sessions/:id/end — "END QUIZ" (spec §23). Session data (spec
// §35) is retained for 24h from this moment for the admin to review
// results/leaderboard, then auto-deleted. Use /delete to purge sooner.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endedAt = new Date();
  const deleteAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .update({ status: "finished", ended_at: endedAt.toISOString(), delete_at: deleteAt.toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await broadcastSessionEvent(params.id, "quiz_ended", { deleted: false });

  return NextResponse.json({ session });
}
