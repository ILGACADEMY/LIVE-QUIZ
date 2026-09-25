import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { broadcastSessionEvent } from "@/lib/realtime";
import { recordAttemptHistory } from "@/lib/attempt-history";
import { countScoredQuestions } from "@/lib/types";

// POST /api/sessions/:id/end — "END QUIZ" (spec §23). Session data (spec
// §35) is retained for 24h from this moment for the admin to review
// results/leaderboard, then auto-deleted. Use /delete to purge sooner.
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: current, error: fetchError } = await supabaseAdmin
    .from("sessions")
    .select("status, current_question_index, quiz_snapshot")
    .eq("id", params.id)
    .single();
  if (fetchError || !current) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const endedAt = new Date();
  const deleteAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);

  // How many QUESTIONS were actually shown before this end — whether
  // that's the natural last question or a deliberate early cut-short
  // ("stop here, find a winner now"). 0 if the quiz never even started.
  // Every score/pass-fail/certificate calculation for this session uses
  // this as the denominator instead of the full deck size, so ending
  // early doesn't silently divide everyone's score by questions they
  // never had a chance to answer. Deliberately counts only item_type
  // 'question' entries among what was shown — an info page shown along
  // the way is not a question and must never inflate this denominator.
  const itemsShown = current.status === "live" ? current.quiz_snapshot.questions.slice(0, current.current_question_index + 1) : [];
  const questionsPresented = countScoredQuestions(itemsShown);

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .update({
      status: "finished",
      ended_at: endedAt.toISOString(),
      delete_at: deleteAt.toISOString(),
      questions_presented: questionsPresented
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // This is what actually gives participants their results, AI feedback,
  // and PDF download after an early end — without this, completed_at
  // stayed null for everyone (it's normally only set by /advance on
  // reaching the last question naturally), which blocked the results
  // endpoint entirely and left participants stuck on a bare "session
  // ended" screen with nothing to show for whatever they did answer.
  await supabaseAdmin
    .from("participants")
    .update({ completed_at: endedAt.toISOString() })
    .eq("session_id", params.id)
    .is("completed_at", null);

  // Writes the persistent per-person history this quiz's future results
  // pages compare against — deliberately independent of this session's
  // own 24h auto-delete, so "how did I do last time" still works weeks
  // later. Only for participants who have a mobile/email on file; a
  // quiz without that has nothing reliable to key a future match on.
  await recordAttemptHistory(params.id);

  await broadcastSessionEvent(params.id, "quiz_ended", { deleted: false });

  return NextResponse.json({ session });
}
