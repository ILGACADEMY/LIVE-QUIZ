"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="case-panel w-full max-w-sm p-8">
        <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">MERIDIAN</p>
        <h1 className="font-display text-2xl italic mb-8">Admin login</h1>

        <label className="field-label block mb-2">Username</label>
        <input
          type="text"
          autoFocus
          autoCapitalize="none"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="field-input mb-4"
          placeholder="Leave blank to use the master password"
        />

        <label className="field-label block mb-2">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input mb-2"
          placeholder="••••••••"
        />
        <p className="text-parchment/30 text-xs mb-4">
          {username.trim() ? "Your own username and password." : "No username set? Leave it blank and use the shared master password."}
        </p>

        {error && <p className="text-crimson text-sm mb-4">{error}</p>}

        <button type="submit" disabled={loading || !password} className="btn-gold w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
