"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Quiz } from "@/lib/types";

type QuizRow = Quiz & { question_count: number };

/**
 * A deliberately narrow slice of what QuizLibrary.tsx already does —
 * only search, select, and launch, reusing the exact same /api/quizzes
 * (listing) and /api/sessions (launch) calls rather than building any
 * new backend logic. No create/edit/delete here on purpose: those stay
 * in the full admin dashboard, which this page is explicitly not a
 * replacement for.
 */
export default function LaunchSession() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/quizzes");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setQuizzes(data.quizzes);
      else {
        setError(data.error ?? "Could not load your quizzes.");
        setQuizzes([]);
      }
    } catch {
      setError("Network error — could not reach the server.");
      setQuizzes([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLaunch() {
    if (!selectedId) return;
    setLaunching(true);
    setError(null);
    // Identical to QuizLibrary.tsx's launchQuiz — same endpoint, same
    // payload shape, same resulting redirect — so a session launched
    // from here behaves exactly like one launched from the full admin
    // dashboard, because it's the same action.
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_id: selectedId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/admin/session/${data.session.id}`);
      } else {
        setError(data.error ?? "Could not launch this quiz.");
        setLaunching(false);
      }
    } catch {
      setError("Network error — could not reach the server.");
      setLaunching(false);
    }
  }

  const filtered = (quizzes ?? []).filter((q) => q.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="min-h-screen px-6 py-12 md:px-16 flex flex-col items-center">
      <div className="w-full max-w-xl">
        <Link href="/" className="text-parchment/40 text-sm mb-8 inline-block hover:text-gold">
          ← Meridian
        </Link>

        <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">START A SESSION</p>
        <h1 className="font-display italic text-3xl text-ivory mb-8">Choose a quiz to launch</h1>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search quizzes…"
          className="field-input w-full mb-6"
          autoFocus
        />

        {error && <p className="text-crimson text-sm mb-4">{error}</p>}

        {quizzes === null ? (
          <p className="text-parchment/40 text-sm">Loading your quizzes…</p>
        ) : filtered.length === 0 ? (
          <p className="text-parchment/40 text-sm">
            {quizzes.length === 0 ? "No saved quizzes yet — create one in Admin first." : "No quizzes match your search."}
          </p>
        ) : (
          <div className="border border-hairline divide-y divide-hairline mb-8 max-h-[50vh] overflow-y-auto">
            {filtered.map((quiz) => (
              <button
                key={quiz.id}
                onClick={() => setSelectedId(quiz.id)}
                className={`w-full text-left px-5 py-4 transition-colors ${
                  selectedId === quiz.id ? "bg-gold/10 border-l-2 border-gold" : "hover:bg-white/[0.02]"
                }`}
              >
                <p className="text-ivory">{quiz.title}</p>
                <p className="text-parchment/40 text-xs mt-1">
                  {quiz.question_count} question{quiz.question_count !== 1 ? "s" : ""}
                </p>
              </button>
            ))}
          </div>
        )}

        <button onClick={handleLaunch} disabled={!selectedId || launching} className="btn-gold w-full py-4 text-base">
          {launching ? "Launching…" : "Launch Quiz"}
        </button>
      </div>
    </main>
  );
}
