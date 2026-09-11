"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_LANGUAGES, detectSupportedLanguage } from "@/lib/languages";
import { AVATARS, randomAvatar } from "@/lib/avatars";
import MeridianWordmark from "@/components/shared/MeridianWordmark";

export default function JoinPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [store, setStore] = useState("");
  const [city, setCity] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quizTitle, setQuizTitle] = useState<string | null>(null);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [requireContactInfo, setRequireContactInfo] = useState(false);

  useEffect(() => {
    setAvatar(randomAvatar());
    if (typeof navigator !== "undefined") setLanguage(detectSupportedLanguage(navigator.language));
    fetch(`/api/sessions/${params.sessionId}/state`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setQuizTitle(data.quizTitle);
        setTranslationEnabled(Boolean(data.translationEnabled));
        setRequireContactInfo(Boolean(data.requireContactInfo));
      })
      .catch(() => setError("This quiz session was not found or has ended."));
  }, [params.sessionId]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Please enter your name.");
    if (!store.trim()) return setError("Please enter your store.");
    if (!city.trim()) return setError("Please enter your city.");
    if (requireContactInfo && !mobile.trim()) return setError("Please enter your mobile number.");

    setLoading(true);
    const res = await fetch(`/api/sessions/${params.sessionId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        store: store.trim(),
        city: city.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        language,
        avatar
      })
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
    <main className="min-h-screen relative flex flex-col items-center justify-center px-6 py-6 overflow-hidden">
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
        <MeridianWordmark size="small" />
        {quizTitle && <p className="text-parchment/60 text-sm mt-2 mb-3">{quizTitle}</p>}
        {!quizTitle && !error && <p className="text-parchment/40 text-sm mt-2 mb-3">Loading session…</p>}

        <form onSubmit={handleJoin} className="case-panel p-6 text-left">
          <div className="flex flex-col items-center mb-4">
            <button
              type="button"
              onClick={() => setAvatar(randomAvatar())}
              className="w-14 h-14 flex items-center justify-center text-2xl border border-hairline hover:border-gold transition-colors"
              title="Tap to change your icon"
            >
              {avatar}
            </button>
            <p className="text-parchment/30 text-xs mt-1.5">Tap to change your icon</p>
          </div>

          <label className="field-label block mb-2">Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={60} className="field-input mb-5" placeholder="Required" />

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <label className="field-label block mb-2">Store</label>
              <input value={store} onChange={(e) => setStore(e.target.value)} required maxLength={100} className="field-input" placeholder="e.g. Dubai Mall" />
            </div>
            <div>
              <label className="field-label block mb-2">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} required maxLength={100} className="field-input" placeholder="e.g. Dubai" />
            </div>
          </div>

          {requireContactInfo && (
            <>
              <label className="field-label block mb-2">Mobile number</label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                type="tel"
                required
                className="field-input mb-1"
                placeholder="e.g. +971 50 123 4567"
              />
              <p className="text-parchment/30 text-xs mb-5">Required.</p>

              <label className="field-label block mb-2">Email (optional)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="field-input mb-1" placeholder="you@example.com" />
              <p className="text-parchment/30 text-xs mb-5">Not required — nothing is sent to it.</p>
            </>
          )}

          {translationEnabled && (
            <>
              <label className="field-label block mb-2">Quiz language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="field-input mb-6">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </option>
                ))}
              </select>
            </>
          )}

          {error && <p className="text-crimson text-sm mb-4">{error}</p>}

          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? "Joining…" : "Join quiz"}
          </button>
        </form>
      </div>
    </main>
  );
}
