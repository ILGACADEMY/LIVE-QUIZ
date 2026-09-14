import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { LiveSession } from "@/lib/types";

// GET /api/sessions/:id/certificate?participantId=X
//
// Eligibility is re-checked from data frozen at the time this session was
// launched (quiz_snapshot) and the participant's actual recorded score —
// never from the quiz's CURRENT settings. That's what guarantees a
// certificate already issued can never be invalidated by an admin later
// turning the setting off or changing the pass mark, and that a
// newly-passing participant on an old session can't unexpectedly qualify
// just because someone enabled certificates after the fact — the
// snapshot is what it was the moment this session started.
//
// Idempotent: calling this again for the same participant returns the
// SAME certificate (looked up by session_id+participant_id, unique in
// the table) rather than ever generating a second one.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ error: "participantId is required" }, { status: 400 });

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (sessionError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  if (!participant.completed_at) {
    return NextResponse.json({ eligible: false, reason: "not_finished" });
  }

  const quiz = session.quiz_snapshot.quiz;
  const totalQuestions = session.quiz_snapshot.questions.length;

  if (!quiz.issue_certificate) {
    return NextResponse.json({ eligible: false, reason: "not_enabled" });
  }

  const { count: correctCount } = await supabaseAdmin
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("session_id", params.id)
    .eq("participant_id", participantId)
    .eq("is_correct", true);

  const percentage = totalQuestions > 0 ? Math.round(((correctCount ?? 0) / totalQuestions) * 100) : 0;
  const passed = percentage >= quiz.pass_mark_percent;

  if (!passed) {
    return NextResponse.json({ eligible: false, reason: "not_passed" });
  }

  // Already issued? Return the same one — never generate a second
  // certificate for the same participant.
  const { data: appSettings } = await supabaseAdmin
    .from("app_settings")
    .select("logo_url, certificate_org_name, certificate_org_subtitle")
    .limit(1)
    .maybeSingle();
  const branding = {
    logoUrl: appSettings?.logo_url ?? null,
    orgName: appSettings?.certificate_org_name ?? "ILG ACADEMY",
    orgSubtitle: appSettings?.certificate_org_subtitle ?? "TRAINING & DEVELOPMENT",
    message: quiz.certificate_message ?? null,
    brandLogoUrl: quiz.brand_logo_url ?? null
  };

  const { data: existing } = await supabaseAdmin
    .from("certificates")
    .select("*")
    .eq("session_id", params.id)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      eligible: true,
      certificateNumber: existing.certificate_number,
      participantName: existing.participant_name,
      quizTitle: existing.quiz_title,
      scorePercent: existing.score_percent,
      issuedAt: existing.issued_at,
      completedAt: participant.completed_at,
      branding
    });
  }

  const { data: numberResult, error: numberError } = await supabaseAdmin.rpc("next_certificate_number");
  if (numberError || !numberResult) {
    return NextResponse.json({ error: "Could not generate a certificate number." }, { status: 500 });
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("certificates")
    .insert({
      session_id: params.id,
      participant_id: participantId,
      certificate_number: numberResult,
      quiz_title: quiz.title,
      participant_name: participant.name,
      score_percent: percentage
    })
    .select()
    .single();

  if (insertError) {
    // A near-simultaneous duplicate request would hit the unique
    // (session_id, participant_id) constraint here — treat it the same
    // as "already issued" rather than surfacing a raw DB error.
    if (insertError.code === "23505") {
      const { data: raceWinner } = await supabaseAdmin
        .from("certificates")
        .select("*")
        .eq("session_id", params.id)
        .eq("participant_id", participantId)
        .maybeSingle();
      if (raceWinner) {
        return NextResponse.json({
          eligible: true,
          certificateNumber: raceWinner.certificate_number,
          participantName: raceWinner.participant_name,
          quizTitle: raceWinner.quiz_title,
          scorePercent: raceWinner.score_percent,
          issuedAt: raceWinner.issued_at,
          completedAt: participant.completed_at,
          branding
        });
      }
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    eligible: true,
    certificateNumber: created.certificate_number,
    participantName: created.participant_name,
    quizTitle: created.quiz_title,
    scorePercent: created.score_percent,
    issuedAt: created.issued_at,
    completedAt: participant.completed_at,
    branding
  });
}
