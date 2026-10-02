import { requireAdmin } from "@/lib/require-admin";
import LaunchSession from "@/components/shared/LaunchSession";

/**
 * /launch — the simple, trainer-facing "find a quiz and start it" page
 * reached from the new homepage's main CTA. Protected the same way
 * every other admin-facing page already is: quizzes are owned by
 * specific accounts, so a trainer still needs to be logged in here,
 * same as they always have been — this page just doesn't show them
 * the full admin dashboard to get to that one action.
 */
export default async function LaunchPage() {
  await requireAdmin();
  return <LaunchSession />;
}
