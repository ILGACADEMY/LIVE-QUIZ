"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MeridianWordmark from "@/components/shared/MeridianWordmark";

// /join — type-in-a-code fallback to /join/[sessionId]. Exists for
// exactly two situations: a phone's camera/security settings won't let
// it scan the QR at all, or someone finds the long session URL easier to
// mistype than a short code. The presenter's dashboard shows this short
// code prominently right alongside the QR for this reason.
export default function JoinByCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from the presenter's screen.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sessions/by-code/${digits}`);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not find that quiz.");
      return;
    }
    const data = await res.json();
    router.push(`/join/${data.sessionId}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <MeridianWordmark size="small" />
      <p className="text-parchment/50 text-sm mt-6 mb-8">Enter the code shown on the presenter's screen</p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          autoFocus
          className="field-input text-center text-3xl font-dial tracking-[0.3em] mb-4"
          placeholder="000000"
        />
        {error && <p className="text-crimson text-sm mb-4">{error}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full">
          {loading ? "Checking…" : "Join"}
        </button>
      </form>
    </main>
  );
}
