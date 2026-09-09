import { NextRequest, NextResponse } from "next/server";
import { roleForPassword, adminCookieOptions } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const role = roleForPassword(password);
  if (!role) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role });
  const opts = adminCookieOptions();
  res.cookies.set(opts.name, role, opts); // cookie holds the ROLE, never the password itself
  return res;
}
