import "server-only";
import { redirect } from "next/navigation";
import { isAdminSessionAuthorized } from "./admin-auth";

/** Call at the top of any admin server component/page. */
export function requireAdmin() {
  if (!isAdminSessionAuthorized()) {
    redirect("/admin/login");
  }
}
