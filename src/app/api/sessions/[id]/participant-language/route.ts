import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { ensureQuestionTranslated } from "@/lib/question-translation-cache";

// POST /api/sessions/:id/participant-language — { participantId, language }
//
// For the one real gap in choosing a language only at join time: someone
// who forgot, or just changed their mind, and already clicked Join. This
// updates their stored language going forward — the waiting screen's
// instructions, and any question they see from here on, pick it up on
// the very next poll, no rejoin needed. Same server-side enforcement as
// at join: if this quiz doesn't have translation turned on, the request
// is rejected outright rather than silently accepted and ignored.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { participantId, language } = await req.json();
  if (!participantId || typeof participantId !== "string") {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }
  if (!language || !SUPPORTED_LANGUAGES.some((l) => l.code === language)) {
    return NextResponse.json({ error: "That's not a supported language." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, status, quiz_snapshot, current_question_index, phase")
    .eq("id", params.id)
    .single();
  if (sessionError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (!session.quiz_snapshot?.quiz?.translation_enabled) {
    return NextResponse.json({ error: "This quiz doesn't have translation turned on." }, { status: 400 });
  }

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const { error: updateError } = await supabaseAdmin.from("participants").update({ language }).eq("id", participantId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Same mid-quiz pre-warm as a late joiner picking a brand-new language
  // — if a question is already live and this is the first time anyone's
  // used this language for it, warm the cache now rather than making
  // this participant hit the live on-demand translation delay.
  if (language !== "en" && session.status === "live" && (session.phase === "question" || session.phase === "revealed")) {
    const currentQuestion = session.quiz_snapshot.questions[session.current_question_index];
    if (currentQuestion) {
      await ensureQuestionTranslated(params.id, session.current_question_index, currentQuestion, language).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
