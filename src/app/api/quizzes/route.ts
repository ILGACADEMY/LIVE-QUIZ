import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin-auth";

// GET /api/quizzes — "MY QUIZZES" library.
// A regular user sees their own quizzes plus any "legacy" quiz with no
// owner (created before named accounts existed) — nothing already made
// disappears just because this feature was added later. A super admin
// sees every quiz from everyone, with whose it is included so the UI
// can show that.
export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabaseAdmin.from("quizzes").select("*, questions(count), admin_users(username, display_name)").order("updated_at", { ascending: false });

  if (session.role !== "super_admin") {
    // owner_id = mine, OR owner_id is null (a legacy quiz)
    query = query.or(`owner_id.eq.${session.userId},owner_id.is.null`);
  }

  const { data: quizzes, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    quizzes: quizzes.map((q: any) => ({
      ...q,
      question_count: q.questions?.[0]?.count ?? 0,
      owner_username: q.admin_users?.username ?? null,
      owner_display_name: q.admin_users?.display_name ?? null,
      questions: undefined,
      admin_users: undefined
    }))
  });
}

// POST /api/quizzes — "CREATE NEW QUIZ"
export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The quiz-limit check: a named regular user (not the master login,
  // not a super_admin) is capped at their own quiz_limit — checked
  // against how many they currently own, not counting legacy
  // (ownerless) quizzes, since those were never "theirs" to begin with.
  if (session.role !== "super_admin" && session.userId) {
    const { data: user } = await supabaseAdmin.from("admin_users").select("quiz_limit").eq("id", session.userId).maybeSingle();
    const limit = user?.quiz_limit ?? 5;
    const { count } = await supabaseAdmin.from("quizzes").select("id", { count: "exact", head: true }).eq("owner_id", session.userId);
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: `You've reached your limit of ${limit} quizzes. Delete one first, or ask your admin to raise your limit.` },
        { status: 403 }
      );
    }
  }

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .insert({
      owner_id: session.userId, // null for a master-login-created quiz — same "legacy, visible to everyone" treatment
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
      question_timer_seconds: body.question_timer_seconds ?? 20,
      translation_enabled: body.translation_enabled ?? false,
      require_contact_info: body.require_contact_info ?? false,
      issue_certificate: body.issue_certificate ?? false,
      certificate_message: body.certificate_message ?? null,
      brand_logo_url: body.brand_logo_url ?? null,
      after_answer_mode: body.after_answer_mode ?? "auto_advance",
      status: "draft"
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ quiz: data }, { status: 201 });
}
