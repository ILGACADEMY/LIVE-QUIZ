"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sessions/${params.sessionId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed })
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not join this quiz.");
      return;
    }
    const { participant } = await res.json();
    sessionStorage.setItem(`ilg-quiz-${params.sessionId}`, JSON.stringify({ participantId: participant.id, name: trimmed }));
    router.push(`/play/${params.sessionId}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleJoin} className="w-full max-w-sm text-center">
        <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-4">ILG ACADEMY</p>
        <h1 className="font-display italic text-3xl mb-8">Enter your name to join</h1>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={60}
          className="field-input text-center mb-4"
          placeholder="Your name"
        />

        {error && <p className="text-crimson text-sm mb-4">{error}</p>}

        <button type="submit" disabled={loading || !name.trim()} className="btn-gold w-full">
          {loading ? "Joining…" : "Join quiz"}
        </button>
      </form>
    </main>
  );
}
