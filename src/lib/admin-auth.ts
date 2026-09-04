import "server-only";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "ilg_admin_session";

/**
 * Deliberately simple: one shared ADMIN_PASSWORD env var gates the whole
 * /admin area, matching "ADMIN LOGIN" in the spec without building a full
 * multi-trainer auth system. On login we set a signed-enough opaque cookie
 * (the password itself, httpOnly) — good enough for a single-organization
 * internal tool behind HTTPS. See README "Hardening for production" for
 * how to upgrade to per-trainer Supabase Auth accounts later.
 */
export function isValidAdminPassword(password: string): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

export function adminCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12 // 12 hours
  };
}

export function isAdminRequestAuthorized(req: NextRequest): boolean {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  return Boolean(cookie) && cookie === process.env.ADMIN_PASSWORD;
}

export function isAdminSessionAuthorized(): boolean {
  const cookie = cookies().get(COOKIE_NAME)?.value;
  return Boolean(cookie) && cookie === process.env.ADMIN_PASSWORD;
}

export { COOKIE_NAME };
