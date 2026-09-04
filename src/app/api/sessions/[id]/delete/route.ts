import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";

// POST /api/sessions/:id/delete — immediate purge, ahead of the 24h auto
// deletion. Cascades remove participants + answers. The quiz template is
// untouched (spec §36).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await broadcastSessionEvent(params.id, "quiz_ended", { deleted: true });

  const { error } = await supabaseAdmin.from("sessions").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
