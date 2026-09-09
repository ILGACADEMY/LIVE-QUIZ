import "server-only";
import { redirect } from "next/navigation";
import { isAdminSessionAuthorized, isSessionControllerSessionAuthorized, sessionRole, Role } from "./admin-auth";

/** Call at the top of any page that edits/creates/deletes quiz content —
 *  the quiz library's create/edit/duplicate/delete actions, the question
 *  editor. Trainers are redirected away, same as anyone not logged in. */
export function requireAdmin() {
  if (!isAdminSessionAuthorized()) {
    redirect("/admin/login");
  }
}

/** Call at the top of any page a trainer should be able to reach:
 *  launching/controlling a live session, viewing the quiz list to pick
 *  one to launch, previewing a quiz read-only. Returns the caller's role
 *  so the page can pass it down to hide admin-only actions in the UI —
 *  that's a UX nicety, not the real boundary; the real boundary is each
 *  API route checking isAdminRequestAuthorized/isSessionControllerRequestAuthorized itself. */
export function requireSessionController(): Role {
  const role = sessionRole();
  if (!isSessionControllerSessionAuthorized() || !role) {
    redirect("/admin/login");
  }
  return role;
}
