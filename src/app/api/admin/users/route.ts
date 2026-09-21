import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminSession, hashPassword } from "@/lib/admin-auth";

// GET /api/admin/users — super-admin only. Lists every named account,
// with a live count of how many quizzes each currently owns (so the
// UI can show "3 of 5" against their limit).
export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, username, display_name, role, quiz_limit, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: quizCounts } = await supabaseAdmin.from("quizzes").select("owner_id").not("owner_id", "is", null);
  const counts: Record<string, number> = {};
  (quizCounts ?? []).forEach((q) => {
    if (q.owner_id) counts[q.owner_id] = (counts[q.owner_id] ?? 0) + 1;
  });

  return NextResponse.json({
    users: users.map((u) => ({ ...u, quiz_count: counts[u.id] ?? 0 }))
  });
}

// POST /api/admin/users — super-admin only. Creates a new account with
// a preset username/password chosen by the super admin — no signup
// link, no email sent; hand the credentials to that person directly.
export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { username, password, displayName, role, quizLimit } = await req.json();
  if (!username || !username.trim()) return NextResponse.json({ error: "Username is required." }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .insert({
      username: normalizedUsername,
      password_hash: passwordHash,
      display_name: displayName || null,
      role: role === "super_admin" ? "super_admin" : "user",
      quiz_limit: typeof quizLimit === "number" && quizLimit > 0 ? quizLimit : 5
    })
    .select("id, username, display_name, role, quiz_limit, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: { ...data, quiz_count: 0 } }, { status: 201 });
}
