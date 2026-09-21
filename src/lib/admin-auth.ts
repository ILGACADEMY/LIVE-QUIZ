import "server-only";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "ilg_admin_session";

/**
 * Named admin accounts, each with their own preset username and
 * password (set by the super admin — there's no self-service signup
 * or email flow, by design). The cookie holds a small signed token —
 * { userId, role } — rather than a raw password, so the server can
 * tell WHICH person is logged in, not just "is someone logged in."
 * Signed with HMAC-SHA256 using ADMIN_PASSWORD as the secret, so no
 * new environment variable is needed beyond what's already set up.
 *
 * ADMIN_PASSWORD itself still works too, as a master recovery
 * login — logging in with just that (no username) grants full
 * super-admin access regardless of the admin_users table. This
 * matters because there's no "forgot password" email flow here: if
 * every named account somehow got locked out, this is the only way
 * back in, and it's already the one credential guaranteed to be set
 * (it's required for the app to run at all).
 */

export interface AdminSession {
  userId: string | null; // null for a master-password login — there's no specific account behind it
  role: "user" | "super_admin";
  username: string; // "master" for the recovery login
}

function sign(payload: string): string {
  const secret = process.env.ADMIN_PASSWORD ?? "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function encodeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

export function createSessionToken(session: AdminSession): string {
  return encodeSession(session);
}

export function isValidMasterPassword(password: string): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

/** For API routes (NextRequest-based). */
export function getAdminSession(req: NextRequest): AdminSession | null {
  return decodeSession(req.cookies.get(COOKIE_NAME)?.value);
}

export function isAdminRequestAuthorized(req: NextRequest): boolean {
  return getAdminSession(req) !== null;
}

export function isSuperAdminRequest(req: NextRequest): boolean {
  return getAdminSession(req)?.role === "super_admin";
}

/** For server components/actions (cookies()-based, no request object). */
export function getAdminSessionFromCookies(): AdminSession | null {
  return decodeSession(cookies().get(COOKIE_NAME)?.value);
}

export function isAdminSessionAuthorized(): boolean {
  return getAdminSessionFromCookies() !== null;
}

export { COOKIE_NAME };
