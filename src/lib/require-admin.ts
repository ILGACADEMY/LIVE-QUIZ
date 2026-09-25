import "server-only";
import { redirect } from "next/navigation";
import { isAdminSessionAuthorized } from "./admin-auth";

/** Call at the top of any admin server component/page — now async, so
 *  every caller needs `await requireAdmin()`. This isn't optional to
 *  get right: skipping the await would mean the redirect for a genuinely
 *  unauthenticated visitor doesn't happen before the rest of the page
 *  runs — the actual admin-gating check silently doing nothing. */
export async function requireAdmin() {
  if (!(await isAdminSessionAuthorized())) {
    redirect("/admin/login");
  }
}
