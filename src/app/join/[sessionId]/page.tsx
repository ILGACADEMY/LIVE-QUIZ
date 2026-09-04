"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_LANGUAGES, detectSupportedLanguage } from "@/lib/languages";
import { AVATARS, randomAvatar } from "@/lib/avatars";

export default function JoinPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quizTitle, setQuizTitle] = useState<string | null>(null);

  useEffect(() => {
    setAvatar(randomAvatar());
    if (typeof navigator !== "undefined") setLanguage(detectSupportedLanguage(navigator.language));
    fetch(`/api/sessions/${params.sessionId}/state`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setQuizTitle(data.quizTitle))
      .catch(() => setError("This quiz session was not found or has ended."));
  }, [params.sessionId]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sessions/${params.sessionId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), language })
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not join this quiz.");
      return;
    }
    sessionStorage.setItem(
      `ilg-quiz-${params.sessionId}`,
      JSON.stringify({ participantId: data.participant.id, name: data.participant.name, avatar: data.participant.avatar })
    );
    router.push(`/play/${params.sessionId}`);
  }

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
      {/* Decorative slow-rotating watch dial, low opacity — the "rich" hero motif */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
        <svg viewBox="0 0 400 400" className="w-[140vw] h-[140vw] max-w-none animate-[spin_120s_linear_infinite]">
          <circle cx="200" cy="200" r="180" fill="none" stroke="#C9A24B" strokeWidth="1" />
          <circle cx="200" cy="200" r="150" fill="none" stroke="#C9A24B" strokeWidth="1" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const x1 = 200 + 165 * Math.sin(angle);
            const y1 = 200 - 165 * Math.cos(angle);
            const x2 = 200 + 180 * Math.sin(angle);
            const y2 = 200 - 180 * Math.cos(angle);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#C9A24B" strokeWidth="2" />;
          })}
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-sm text-center">
        <p className="text-gold text-xs tracking-[0.35em] font-body font-medium mb-3">ILG ACADEMY</p>
        <h1 className="font-display italic text-4xl md:text-5xl leading-tight mb-1">Horology Lab</h1>
        <div className="w-10 h-px bg-gold/50 mx-auto my-5" />
        {quizTitle && <p className="text-parchment/60 text-sm mb-10">{quizTitle}</p>}
        {!quizTitle && !error && <p className="text-parchment/40 text-sm mb-10">Loading session…</p>}

        <form onSubmit={handleJoin} className="case-panel p-8 text-left">
          <div className="flex items-center justify-center mb-6">
            <button
              type="button"
              onClick={() => setAvatar(randomAvatar())}
              className="w-16 h-16 flex items-center justify-center text-3xl border border-hairline hover:border-gold transition-colors"
              title="Tap to change your avatar"
            >
              {avatar}
            </button>
          </div>

          <label className="field-label block mb-2">Your name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={60}
            className="field-input mb-1"
            placeholder="Leave blank to join as a guest"
          />
          <p className="text-parchment/30 text-xs mb-5">No name? We'll give you a fun one.</p>

          <label className="field-label block mb-2">Quiz language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="field-input mb-6">
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel}
              </option>
            ))}
          </select>

          {error && <p className="text-crimson text-sm mb-4">{error}</p>}

          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? "Joining…" : "Join quiz"}
          </button>
        </form>
      </div>
    </main>
  );
}
