import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword, adminCookieOptions } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const opts = adminCookieOptions();
  res.cookies.set(opts.name, password, opts);
  return res;
}
