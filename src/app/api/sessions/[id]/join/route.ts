import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { broadcastSessionEvent } from "@/lib/realtime";

// POST /api/sessions/:id/join — { name }. No account, no email, no password
// (spec §20-21). Returns a participant id the browser stores (e.g. in
// sessionStorage) to authenticate subsequent /answer and /state calls.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { name } = await req.json();
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (trimmed.length > 60) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, status")
    .eq("id", params.id)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "This quiz session was not found or has ended." }, { status: 404 });
  }
  if (session.status === "finished") {
    return NextResponse.json({ error: "This quiz session has already ended." }, { status: 410 });
  }

  const { data: participant, error } = await supabaseAdmin
    .from("participants")
    .insert({ session_id: params.id, name: trimmed })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supabaseAdmin
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("session_id", params.id);

  await broadcastSessionEvent(params.id, "answer_count", { joined: count ?? 0, type: "joined" });

  return NextResponse.json({ participant, sessionStatus: session.status }, { status: 201 });
}
