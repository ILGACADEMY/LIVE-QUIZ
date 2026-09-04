import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { broadcastSessionEvent } from "@/lib/realtime";
import { randomAvatar, randomGuestName } from "@/lib/avatars";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

// POST /api/sessions/:id/join — { name?, language? }. Name is optional —
// leave it blank and we assign a fun guest name + cartoon avatar instead.
// No account, no email, no password. Returns a participant id the browser
// stores (e.g. in sessionStorage) to authenticate subsequent calls.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { name, language } = await req.json();
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (trimmed.length > 60) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const languageCode = SUPPORTED_LANGUAGES.some((l) => l.code === language) ? language : "en";
  const finalName = trimmed || randomGuestName();
  const avatar = randomAvatar();

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
    .insert({ session_id: params.id, name: finalName, avatar, language: languageCode })
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
