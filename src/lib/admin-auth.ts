import "server-only";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "ilg_admin_session";

/**
 * Deliberately simple: one shared ADMIN_PASSWORD env var gates the whole
 * /admin area. On login we set an httpOnly cookie holding the password
 * itself — good enough for a single-organization internal tool behind
 * HTTPS. (A named, expiring, per-quiz trainer-login system was built and
 * then deliberately reverted — it added real complexity for a need that
 * didn't end up being worth it. If that need comes back later, it's
 * still in this project's git history to revive rather than rebuild from
 * scratch.)
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
