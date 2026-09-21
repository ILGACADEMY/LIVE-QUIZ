"use client";

import { useEffect, useState, useCallback } from "react";

interface AdminUserRow {
  id: string;
  username: string;
  display_name: string | null;
  role: "user" | "super_admin";
  quiz_limit: number;
  quiz_count: number;
  created_at: string;
}

export default function ManageUsers() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"user" | "super_admin">("user");
  const [newQuizLimit, setNewQuizLimit] = useState(5);
  const [adding, setAdding] = useState(false);

  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    } else {
      setError("Could not load accounts.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || null,
          role: newRole,
          quizLimit: newQuizLimit
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the account.");
        return;
      }
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
      setNewRole("user");
      setNewQuizLimit(5);
      setShowAdd(false);
      load();
    } finally {
      setAdding(false);
    }
  }

  async function changePassword(id: string) {
    const newPass = passwordEdits[id]?.trim();
    if (!newPass) return;
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPass })
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not change that password.");
      return;
    }
    setPasswordEdits((prev) => ({ ...prev, [id]: "" }));
  }

  async function changeQuizLimit(id: string, quizLimit: number) {
    setBusyId(id);
    await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizLimit })
    });
    setBusyId(null);
    load();
  }

  async function deleteUser(id: string, username: string) {
    if (!confirm(`Remove ${username}'s account? Any quizzes they made will stay, just without an owner.`)) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) load();
    else setError("Could not remove that account.");
  }

  if (!users) return <p className="text-parchment/50">Loading accounts…</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-parchment/50 text-sm">
          {users.length} account{users.length !== 1 ? "s" : ""}
        </p>
        <button onClick={() => setShowAdd((v) => !v)} className="btn-gold">
          {showAdd ? "Cancel" : "+ Add account"}
        </button>
      </div>

      {error && <p className="text-crimson text-sm mb-4">{error}</p>}

      {showAdd && (
        <form onSubmit={addUser} className="case-panel p-6 mb-6">
          <p className="field-label mb-4">New account</p>
          <p className="text-parchment/40 text-xs mb-4">
            Set a username and password yourself and hand them to that person directly — there's no signup link or
            email involved.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="field-label block mb-2">Username</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="field-input"
                placeholder="e.g. sarah"
                autoCapitalize="none"
              />
            </div>
            <div>
              <label className="field-label block mb-2">Password</label>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field-input"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="field-label block mb-2">Display name (optional)</label>
              <input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} className="field-input" placeholder="e.g. Sarah" />
            </div>
            <div>
              <label className="field-label block mb-2">Quiz limit</label>
              <input
                type="number"
                min={1}
                value={newQuizLimit}
                onChange={(e) => setNewQuizLimit(Number(e.target.value))}
                className="field-input"
                disabled={newRole === "super_admin"}
              />
            </div>
          </div>
          <label className="field-label block mb-2">Role</label>
          <div className="flex gap-3 mb-5">
            <button
              type="button"
              onClick={() => setNewRole("user")}
              className={`px-4 py-2 border text-sm ${newRole === "user" ? "border-gold text-gold" : "border-hairline text-parchment/50"}`}
            >
              Regular user — capped at their quiz limit
            </button>
            <button
              type="button"
              onClick={() => setNewRole("super_admin")}
              className={`px-4 py-2 border text-sm ${newRole === "super_admin" ? "border-gold text-gold" : "border-hairline text-parchment/50"}`}
            >
              Super admin — no cap, sees everyone's quizzes
            </button>
          </div>
          <button type="submit" disabled={adding || !newUsername.trim() || newPassword.length < 6} className="btn-gold px-6 py-2.5">
            {adding ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <div className="case-panel divide-y divide-hairline">
        {users.map((u) => (
          <div key={u.id} className="p-5 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-display text-lg">
                {u.display_name || u.username}
                {u.role === "super_admin" && <span className="text-gold text-xs ml-2 align-middle">SUPER ADMIN</span>}
              </p>
              <p className="text-parchment/50 text-xs mt-1">
                @{u.username} ·{" "}
                {u.role === "super_admin" ? (
                  "No quiz limit"
                ) : (
                  <>
                    {u.quiz_count} of{" "}
                    <input
                      type="number"
                      min={u.quiz_count}
                      defaultValue={u.quiz_limit}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (val > 0 && val !== u.quiz_limit) changeQuizLimit(u.id, val);
                      }}
                      className="w-14 bg-transparent border-b border-hairline text-center"
                    />{" "}
                    quizzes used
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={passwordEdits[u.id] ?? ""}
                onChange={(e) => setPasswordEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                placeholder="New password"
                className="field-input text-sm py-2 w-40"
              />
              <button
                onClick={() => changePassword(u.id)}
                disabled={busyId === u.id || !(passwordEdits[u.id]?.trim())}
                className="btn-ghost px-3 py-2 text-sm"
              >
                Set password
              </button>
              <button onClick={() => deleteUser(u.id, u.username)} disabled={busyId === u.id} className="px-3 py-2 text-sm text-crimson/80 hover:text-crimson">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
