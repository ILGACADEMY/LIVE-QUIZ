import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/sessions/by-code/:code
// Public — this is the whole point of the code, someone types it with no
// login. Only matches an active (non-finished) session, same scope as the
// uniqueness constraint on short_code itself.
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.replace(/\D/g, ""); // tolerate spaces/dashes if someone types it that way

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("short_code", code)
    .neq("status", "finished")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "That code doesn't match an active quiz. Double-check it and try again." }, { status: 404 });

  return NextResponse.json({ sessionId: session.id });
}
