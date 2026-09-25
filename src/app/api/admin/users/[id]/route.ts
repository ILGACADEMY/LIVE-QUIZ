import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminSession, hashPassword } from "@/lib/admin-auth";

// PUT /api/admin/users/:id — super-admin only.
// Body: { password?, quizLimit?, displayName? } — send only what's
// changing. This is the "I get to change the password" route: the
// super admin can reset anyone's password at any time, no email or
// confirmation link involved — hand them the new one directly.
export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = getAdminSession(req);
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { password, quizLimit, displayName } = await req.json();
  const update: Record<string, unknown> = {};

  if (password !== undefined) {
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    update.password_hash = await hashPassword(password);
  }
  if (typeof quizLimit === "number" && quizLimit > 0) update.quiz_limit = quizLimit;
  if (displayName !== undefined) update.display_name = displayName || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .update(update)
    .eq("id", params.id)
    .select("id, username, display_name, role, quiz_limit, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

// DELETE /api/admin/users/:id — super-admin only. Removes the account;
// any quizzes they owned become "legacy" (owner_id set to null) rather
// than being deleted with them — see the owner_id column comment in
// the schema. A super admin can't delete their own account this way
// (guards against ever locking everyone out of user management).
export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = getAdminSession(req);
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.userId === params.id) {
    return NextResponse.json({ error: "You can't delete your own account while logged into it." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("admin_users").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
