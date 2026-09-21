"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({ username }: { username: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-parchment/40">Logged in as {username}</span>
      <button onClick={handleLogout} className="text-parchment/50 hover:text-gold">
        Log out
      </button>
    </div>
  );
}
