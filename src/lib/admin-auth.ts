import "server-only";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "ilg_admin_session";

export type Role = "admin" | "trainer";

/**
 * Two shared passwords, two roles — still deliberately simple (no
 * per-person accounts), but now supports handing a trainer running
 * sessions in another region a password that can launch and control a
 * quiz without being able to touch its content:
 *   - ADMIN_PASSWORD → "admin": everything, including creating, editing,
 *     duplicating, and deleting quiz templates.
 *   - TRAINER_PASSWORD → "trainer": can view the quiz list, launch a
 *     session, and fully control it live (start/reveal/next/end,
 *     leaderboard, exports, AI analysis) — but every quiz-editing route
 *     and page rejects this role outright, not just hides the button for
 *     it.
 * The cookie holds only the ROLE name (never the password itself) once
 * validated — httpOnly, so it can only ever be set by our own server
 * after a real password check in /api/admin/login.
 */
export function roleForPassword(password: string): Role | null {
  if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) return "admin";
  if (process.env.TRAINER_PASSWORD && password === process.env.TRAINER_PASSWORD) return "trainer";
  return null;
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

function roleFromCookieValue(value: string | undefined): Role | null {
  return value === "admin" || value === "trainer" ? value : null;
}

/** The role of the current request, or null if not logged in at all. */
export function requestRole(req: NextRequest): Role | null {
  return roleFromCookieValue(req.cookies.get(COOKIE_NAME)?.value);
}

/** The role of the current server-component session, or null. */
export function sessionRole(): Role | null {
  return roleFromCookieValue(cookies().get(COOKIE_NAME)?.value);
}

/** Full admin only — quiz creation/editing/deletion, branding, uploads. */
export function isAdminRequestAuthorized(req: NextRequest): boolean {
  return requestRole(req) === "admin";
}
export function isAdminSessionAuthorized(): boolean {
  return sessionRole() === "admin";
}

/** Admin OR trainer — launching and running a live session, and reviewing its results afterward. */
export function isSessionControllerRequestAuthorized(req: NextRequest): boolean {
  return requestRole(req) === "admin" || requestRole(req) === "trainer";
}
export function isSessionControllerSessionAuthorized(): boolean {
  return sessionRole() === "admin" || sessionRole() === "trainer";
}

export { COOKIE_NAME };
