import { NextRequest, NextResponse } from "next/server";
import { isValidMasterPassword, verifyPassword, createSessionToken, adminCookieOptions } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/admin/login
 * Body: { username?, password }
 *
 * With a username: checked against the admin_users table (bcrypt).
 * Without a username (or username left blank): treated as the master
 * recovery login — password checked against ADMIN_PASSWORD directly,
 * granting full super-admin access. This is the fallback that exists
 * because there's no self-service "forgot password" flow for named
 * accounts here — the master password is guaranteed to always work,
 * since the app requires it to be set to run at all.
 */
export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (!username || !username.trim()) {
    if (!isValidMasterPassword(password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    const token = createSessionToken({ userId: null, role: "super_admin", username: "master" });
    const res = NextResponse.json({ ok: true, role: "super_admin", username: "master" });
    const opts = adminCookieOptions();
    res.cookies.set(opts.name, token, opts);
    return res;
  }

  const { data: user } = await supabaseAdmin
    .from("admin_users")
    .select("id, username, password_hash, role, display_name")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const token = createSessionToken({ userId: user.id, role: user.role, username: user.username });
  const res = NextResponse.json({ ok: true, role: user.role, username: user.username, displayName: user.display_name });
  const opts = adminCookieOptions();
  res.cookies.set(opts.name, token, opts);
  return res;
}
