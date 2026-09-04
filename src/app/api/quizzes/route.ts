import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/quizzes — "MY QUIZZES" library (spec §3)
export async function GET(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: quizzes, error } = await supabaseAdmin
    .from("quizzes")
    .select("*, questions(count)")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    quizzes: quizzes.map((q: any) => ({
      ...q,
      question_count: q.questions?.[0]?.count ?? 0,
      questions: undefined
    }))
  });
}

// POST /api/quizzes — "CREATE NEW QUIZ" (spec §4)
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .insert({
      title: body.title ?? "Untitled Quiz",
      description: body.description ?? "",
      time_limit_minutes: body.time_limit_minutes ?? 15,
      pass_mark_percent: body.pass_mark_percent ?? 60,
      leaderboard_enabled: body.leaderboard_enabled ?? true,
      ai_feedback_enabled: body.ai_feedback_enabled ?? true,
      randomize_questions: body.randomize_questions ?? false,
      randomize_answers: body.randomize_answers ?? false,
      back_navigation_enabled: body.back_navigation_enabled ?? false,
      scoring_mode: body.scoring_mode ?? "speed_bonus",
      speed_bonus_window_seconds: body.speed_bonus_window_seconds ?? 20,
      after_answer_mode: body.after_answer_mode ?? "auto_advance",
      status: "draft"
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ quiz: data }, { status: 201 });
}
