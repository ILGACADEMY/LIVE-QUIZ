import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { broadcastSessionEvent } from "@/lib/realtime";
import { randomAvatar } from "@/lib/avatars";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

function normalizeMobile(raw: string): string {
  // Keep digits and a single leading + — strips spaces/dashes/parens so
  // "+971 50 123 4567" and "+971-50-123-4567" match as the same number.
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return (hasPlus ? "+" : "") + digits;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// POST /api/sessions/:id/join — { name, store, city, mobile, email?, language? }
// Name, store, city, AND mobile are all required. Email is optional — it's
// only ever used as a second matching key for duplicate prevention if
// someone happens to provide one; nothing is sent to it. Mobile is the one
// that has to be mandatory, because it's what actually makes duplicate-
// attempt prevention work: without it, there'd be nothing to check.
// See the note in the README about why device-level checks (IMEI etc.)
// aren't possible from a web app at all — this is the strongest check that
// actually is possible.
//
// If the mobile (or email, if given) has already joined THIS session, we
// don't create a second participant or reject them outright — we return
// their EXISTING participant record instead. This covers the legitimate
// case (their browser storage got cleared, they refresh and re-submit)
// without ever producing two scored entries for the same person.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { name, store, city, mobile, email, language } = await req.json();

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedStore = typeof store === "string" ? store.trim() : "";
  const trimmedCity = typeof city === "string" ? city.trim() : "";
  const rawMobile = typeof mobile === "string" ? mobile.trim() : "";
  const rawEmail = typeof email === "string" ? email.trim() : "";

  if (!trimmedName) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (trimmedName.length > 60) return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  if (!trimmedStore) return NextResponse.json({ error: "Please enter your store." }, { status: 400 });
  if (trimmedStore.length > 100) return NextResponse.json({ error: "Store name is too long." }, { status: 400 });
  if (!trimmedCity) return NextResponse.json({ error: "Please enter your city." }, { status: 400 });
  if (trimmedCity.length > 100) return NextResponse.json({ error: "City name is too long." }, { status: 400 });
  if (!rawMobile) {
    return NextResponse.json({ error: "Please enter your mobile number." }, { status: 400 });
  }

  const normalizedMobile = normalizeMobile(rawMobile);
  const normalizedEmail = rawEmail ? normalizeEmail(rawEmail) : null;
  if (normalizedMobile.replace("+", "").length < 6) {
    return NextResponse.json({ error: "That mobile number looks incomplete." }, { status: 400 });
  }
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "That email address looks incomplete." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, status, quiz_snapshot")
    .eq("id", params.id)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "This quiz session was not found or has ended." }, { status: 404 });
  }
  if (session.status === "finished") {
    return NextResponse.json({ error: "This quiz session has already ended." }, { status: 410 });
  }

  // Server-side enforcement, not just a hidden UI element: if this quiz
  // doesn't have translation turned on, force English regardless of what
  // was submitted. This is what actually guarantees zero AI translation
  // calls (and zero cost) for a quiz the admin didn't opt in — the join
  // screen also hides the language picker, but that alone wouldn't stop
  // someone hitting this endpoint directly with a different language.
  const translationEnabled = Boolean(session.quiz_snapshot?.quiz?.translation_enabled);
  const languageCode = translationEnabled && SUPPORTED_LANGUAGES.some((l) => l.code === language) ? language : "en";

  // Look for an existing participant in THIS session matching mobile (or
  // email too, if one was given) before creating a new one.
  let existingQuery = supabaseAdmin.from("participants").select("*").eq("session_id", params.id);
  existingQuery = normalizedEmail
    ? existingQuery.or(`mobile.eq.${normalizedMobile},email.eq.${normalizedEmail}`)
    : existingQuery.eq("mobile", normalizedMobile);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) {
    return NextResponse.json({ participant: existing, sessionStatus: session.status, resumed: true }, { status: 200 });
  }

  const avatar = randomAvatar();

  const { data: participant, error } = await supabaseAdmin
    .from("participants")
    .insert({
      session_id: params.id,
      name: trimmedName,
      store: trimmedStore,
      city: trimmedCity,
      mobile: normalizedMobile,
      email: normalizedEmail,
      avatar,
      language: languageCode
    })
    .select()
    .single();
  if (error) {
    // A unique-index race (two simultaneous submits with the same
    // mobile/email) lands here — treat it the same as the resume path
    // above rather than showing a raw DB error.
    if (error.code === "23505") {
      let query = supabaseAdmin.from("participants").select("*").eq("session_id", params.id).eq("mobile", normalizedMobile);
      const { data: existing } = await query.maybeSingle();
      if (existing) return NextResponse.json({ participant: existing, sessionStatus: session.status, resumed: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabaseAdmin
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("session_id", params.id);

  await broadcastSessionEvent(params.id, "answer_count", { joined: count ?? 0, type: "joined" });

  return NextResponse.json({ participant, sessionStatus: session.status, resumed: false }, { status: 201 });
}
