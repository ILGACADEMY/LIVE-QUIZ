import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { generateLearningProfile, generateQuizPerformanceAnalysis } from "@/lib/ai";
import { LiveSession } from "@/lib/types";

// POST /api/ai/analysis — { type: "profile", sessionId, participantId }
//                       — { type: "admin", sessionId }  (requires admin auth)
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.type === "profile") {
    const { sessionId, participantId } = body;
    const resultsUrl = new URL(`/api/sessions/${sessionId}/results`, req.url);
    resultsUrl.searchParams.set("participantId", participantId);
    const res = await fetch(resultsUrl, { headers: req.headers });
    if (!res.ok) return NextResponse.json({ error: "Could not load results." }, { status: 400 });
    const results = await res.json();

    try {
      const profile = await generateLearningProfile({
        quizTitle: results.quizTitle,
        categoryBreakdown: results.categoryBreakdown
      });
      return NextResponse.json({ profile });
    } catch (err) {
      console.error("AI profile error:", err);
      return NextResponse.json({ profile: null }, { status: 200 });
    }
  }

  if (body.type === "admin") {
    if (!isAdminRequestAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { sessionId } = body;

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single<LiveSession>();
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const { data: participants } = await supabaseAdmin
      .from("participants")
      .select("*")
      .eq("session_id", sessionId)
      .not("completed_at", "is", null);
    const { data: answers } = await supabaseAdmin.from("answers").select("*").eq("session_id", sessionId);

    if (!participants || participants.length === 0 || !answers) {
      return NextResponse.json({ analysis: "Not enough completed responses yet to generate an analysis." });
    }

    const totalQuestions = session.quiz_snapshot.questions.length;
    const averageScorePercent = Math.round(
      (participants.reduce((sum, p) => sum + (p.base_score / totalQuestions) * 100, 0) / participants.length)
    );
    const passRatePercent = Math.round(
      (participants.filter((p) => (p.base_score / totalQuestions) * 100 >= session.quiz_snapshot.quiz.pass_mark_percent)
        .length /
        participants.length) *
        100
    );
    const averageCompletionSeconds =
      participants.reduce((sum, p) => {
        if (!p.completed_at || !session.started_at) return sum;
        return sum + (new Date(p.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000;
      }, 0) / participants.length;

    const questionDifficulty = session.quiz_snapshot.questions.map((q, i) => {
      const forQuestion = answers.filter((a) => a.question_index === i);
      const correctPercent = forQuestion.length
        ? Math.round((forQuestion.filter((a) => a.is_correct).length / forQuestion.length) * 100)
        : 0;
      return { questionText: q.question_text, correctPercent };
    });

    const highSpeedLowAccuracy = questionDifficulty.filter((q) => q.correctPercent < 50).length;
    const speedVsAccuracyNote =
      highSpeedLowAccuracy > totalQuestions / 3
        ? "A notable number of questions had low accuracy despite the speed-bonus incentive to answer fast — accuracy may be suffering for speed."
        : "Accuracy stayed reasonably strong across the session even with the speed bonus in play.";

    try {
      const analysis = await generateQuizPerformanceAnalysis({
        quizTitle: session.quiz_snapshot.quiz.title,
        participantCount: participants.length,
        averageScorePercent,
        passRatePercent,
        averageCompletionSeconds,
        questionDifficulty,
        speedVsAccuracyNote
      });
      return NextResponse.json({ analysis, averageScorePercent, passRatePercent });
    } catch (err) {
      console.error("AI admin analysis error:", err);
      return NextResponse.json({ analysis: null, averageScorePercent, passRatePercent });
    }
  }

  return NextResponse.json({ error: "Unknown analysis type" }, { status: 400 });
}
