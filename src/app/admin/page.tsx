import { requireAdmin } from "@/lib/require-admin";
import { getAdminSessionFromCookies } from "@/lib/admin-auth";
import QuizLibrary from "@/components/admin/QuizLibrary";
import AiConnectionTest from "@/components/admin/AiConnectionTest";
import StorageConnectionTest from "@/components/admin/StorageConnectionTest";
import BrandingSettings from "@/components/admin/BrandingSettings";
import LogoutButton from "@/components/admin/LogoutButton";

export default function AdminHome() {
  requireAdmin();
  const session = getAdminSessionFromCookies();
  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">MERIDIAN</p>
            <h1 className="font-display text-3xl italic">My Quizzes</h1>
          </div>
          {session?.role === "super_admin" && (
            <div className="flex items-center gap-4">
              <a href="/admin/assistant" className="btn-ghost">
                Trainer Assistant
              </a>
              <a href="/admin/users" className="btn-ghost">
                Manage accounts
              </a>
              <LogoutButton username={session.username} />
            </div>
          )}
          {session && session.role !== "super_admin" && (
            <div className="flex items-center gap-4">
              <a href="/admin/assistant" className="btn-ghost">
                Trainer Assistant
              </a>
              <LogoutButton username={session.username} />
            </div>
          )}
        </div>
        <AiConnectionTest />
        <StorageConnectionTest />
        <BrandingSettings />
        <QuizLibrary />
      </div>
    </main>
  );
}
