import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/certificates/verify/:number — deliberately public, no
 * admin auth. This is the actual working half of the certificate's
 * anti-reuse design: it doesn't stop someone from editing a PDF's
 * text, but it makes that editing detectable — whoever scans the QR
 * code or types in the certificate number sees the TRUE name, quiz,
 * score, and date Meridian actually issued, straight from the
 * permanent record made the moment the certificate was first created.
 * If what's printed on a certificate doesn't match what this returns,
 * that's the tamper signal.
 */
export async function GET(req: NextRequest, { params }: { params: { number: string } }) {
  const { data, error } = await supabaseAdmin
    .from("certificates")
    .select("certificate_number, quiz_title, participant_name, score_percent, issued_at")
    .eq("certificate_number", params.number)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    certificateNumber: data.certificate_number,
    quizTitle: data.quiz_title,
    participantName: data.participant_name,
    scorePercent: data.score_percent,
    issuedAt: data.issued_at
  });
}
