import { requireAdmin } from "@/lib/require-admin";
import { getAdminSessionFromCookies } from "@/lib/admin-auth";
import ManageUsers from "@/components/admin/ManageUsers";

export default async function ManageUsersPage() {
  await requireAdmin();
  const session = await getAdminSessionFromCookies();

  if (session?.role !== "super_admin") {
    return (
      <main className="min-h-screen px-6 py-10 md:px-12">
        <div className="max-w-2xl mx-auto case-panel p-10 text-center">
          <p className="font-display italic text-xl mb-2">Super admin only</p>
          <p className="text-parchment/50 text-sm">
            Managing accounts and quiz limits is only available to a super admin. If you need a password changed or
            your quiz limit raised, ask whoever set up your account.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="max-w-3xl mx-auto">
        <a href="/admin" className="text-parchment/50 text-sm mb-6 inline-block hover:text-gold">
          ← My Quizzes
        </a>
        <div className="mb-10">
          <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">MERIDIAN</p>
          <h1 className="font-display text-3xl italic">Manage accounts</h1>
        </div>
        <ManageUsers />
      </div>
    </main>
  );
}
