"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabaseBrowser } from "@/lib/supabase/client";
import MeridianWordmark from "@/components/shared/MeridianWordmark";

interface AdminLeaderboardRow {
  rank: number;
  name: string;
  store: string | null;
  city: string | null;
  totalScore: number;
  baseScore: number;
  speedBonus: number;
  correctCount: number;
  totalQuestions: number;
  completedAt: string;
}

interface PresenterQuestion {
  questionText: string;
  imageUrl: string | null;
  mediaType: "image" | "video";
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
  correctOption?: "A" | "B" | "C" | "D";
  explanation?: string;
  distribution?: { key: "A" | "B" | "C" | "D"; count: number; percent: number }[];
}

interface StateResponse {
  status: "waiting" | "live" | "finished";
  phase: "waiting" | "question" | "revealed" | "finished";
  quizTitle: string;
  questionNumber: number;
  totalQuestions: number;
  startedAt: string | null;
  phaseDeadline: string | null;
  question: PresenterQuestion | null;
  counts: { joined: number; completed: number; answered: number; pending: number };
}

export default function AdminSessionDashboard({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<StateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [fullLeaderboard, setFullLeaderboard] = useState<AdminLeaderboardRow[] | null>(null);
  const [filterOptions, setFilterOptions] = useState<{ stores: string[]; cities: string[] }>({ stores: [], cities: [] });
  const [nameSearch, setNameSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/state`);
    if (res.ok) setState(await res.json());
  }, [sessionId]);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${sessionId}`);
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [poll, sessionId]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`session:${sessionId}`)
      .on("broadcast", { event: "answer_count" }, () => poll())
      .on("broadcast", { event: "question_revealed" }, () => poll())
      .on("broadcast", { event: "question_advanced" }, () => poll())
      .on("broadcast", { event: "quiz_ended" }, () => poll())
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [sessionId, poll]);

  async function start() {
    setBusy(true);
    await fetch(`/api/sessions/${sessionId}/start`, { method: "POST" });
    setBusy(false);
    poll();
  }

  // The single presenter control that either reveals the current
  // question or advances to the next one, depending on phase — see
  // /api/sessions/:id/advance for the exact rule.
  async function advance() {
    setBusy(true);
    await fetch(`/api/sessions/${sessionId}/advance`, { method: "POST" });
    setBusy(false);
    poll();
  }

  // Presentation clicker support. Wireless clickers (Logitech, Kensington,
  // etc.) don't have their own USB/Bluetooth protocol for this — they
  // work by simulating ordinary keyboard key presses, almost universally
  // Right Arrow, Page Down, or Spacebar (the same keys that advance a
  // PowerPoint slide). Listening for those here means a clicker "just
  // works" without any special pairing or setup beyond what it already
  // needs to control PowerPoint — letting the presenter walk around the
  // room with the participants instead of standing at the keyboard.
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (state?.status !== "live" || busy) return;
      // Don't hijack the key if focus is in a text field (e.g. the
      // post-quiz name/store/city search inputs) — only intercept while
      // nothing is actively being typed into.
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        advance();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, busy, sessionId]);

  async function endQuiz() {
    // Only warn about a mid-question cutoff when a question is actually
    // live right now (phase === "question") — if it's already been
    // revealed, or nothing's active yet, nobody's mid-answer, so that
    // warning doesn't apply.
    const midQuestionWarning =
      state?.phase === "question" ? " Participants on the current question will be cut off before they finish it." : "";
    if (!confirm(`End this quiz for everyone now?${midQuestionWarning} Everyone will get their results based on what they've answered so far.`)) return;
    setBusy(true);
    await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
    setBusy(false);
    poll();
  }
  async function deleteSession() {
    if (!confirm("Delete all session data now? This cannot be undone. The quiz template will remain.")) return;
    setBusy(true);
    await fetch(`/api/sessions/${sessionId}/delete`, { method: "POST" });
    router.push("/admin");
  }

  const loadFullLeaderboard = useCallback(async () => {
    const query = new URLSearchParams({ admin: "1" });
    if (storeFilter) query.set("store", storeFilter);
    if (cityFilter) query.set("city", cityFilter);
    const res = await fetch(`/api/sessions/${sessionId}/leaderboard?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setFullLeaderboard(data.leaderboard);
      setFilterOptions(data.filters ?? { stores: [], cities: [] });
    }
  }, [sessionId, storeFilter, cityFilter]);

  useEffect(() => {
    if (state?.status === "finished") loadFullLeaderboard();
  }, [state?.status, loadFullLeaderboard]);

  // Admin already has full access to every row here — the name search is
  // a plain client-side filter over that, no privacy boundary to worry
  // about (unlike the public leaderboard's search, which only ever
  // touches the Top 10 it already fetched).
  const visibleLeaderboard = useMemo(() => {
    if (!fullLeaderboard) return null;
    if (!nameSearch.trim()) return fullLeaderboard;
    const q = nameSearch.trim().toLowerCase();
    return fullLeaderboard.filter((r) => r.name.toLowerCase().includes(q));
  }, [fullLeaderboard, nameSearch]);

  async function generateAnalysis() {
    setAnalysisLoading(true);
    const res = await fetch("/api/ai/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "admin", sessionId })
    });
    setAnalysisLoading(false);
    if (res.ok) setAnalysis((await res.json()).analysis);
  }

  if (!state) return <main className="min-h-screen px-6 py-10 text-parchment/50">Loading session…</main>;

  const phaseLabel =
    state.status === "waiting"
      ? "WAITING TO START"
      : state.status === "finished"
      ? "FINISHED"
      : state.phase === "question"
      ? "QUESTION LIVE"
      : state.phase === "revealed"
      ? "ANSWER REVEALED"
      : "LIVE";

  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push("/admin")} className="text-parchment/50 text-sm mb-6 hover:text-gold">
          ← My Quizzes
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">{phaseLabel}</p>
            <h1 className="font-display italic text-3xl">{state.quizTitle}</h1>
            <p className="text-parchment/40 text-xs mt-2 font-dial">Session {sessionId}</p>
          </div>
          <div className="flex gap-3">
            {state.status === "waiting" && (
              <button onClick={start} disabled={busy || state.counts.joined === 0} className="btn-gold">
                Start quiz
              </button>
            )}
            {state.status === "live" && (
              <button onClick={advance} disabled={busy} className="btn-gold" title="Works with a presentation clicker's next-slide button too">
                {state.phase === "question" ? "Reveal answer" : "Next question"}
              </button>
            )}
            {state.status === "live" && (
              <button onClick={endQuiz} disabled={busy} className="btn-ghost">
                End quiz
              </button>
            )}
            <a href={`/leaderboard/${sessionId}`} target="_blank" rel="noreferrer" className="btn-ghost">
              Show leaderboard
            </a>
            <button onClick={deleteSession} disabled={busy} className="px-4 py-3 text-crimson/80 hover:text-crimson text-sm">
              Delete session
            </button>
          </div>
        </div>

        {state.status === "live" && (
          <p className="text-parchment/30 text-xs -mt-6 mb-8">
            Tip: a presentation clicker's next-slide button (Right Arrow / Page Down / Space) works here too — no
            setup needed.
          </p>
        )}

        {state.status === "waiting" && (
          <section className="case-panel p-10 mb-8 flex flex-col md:flex-row items-center gap-10">
            <div className="bg-ivory p-4 shrink-0">
              <QRCodeSVG value={joinUrl} size={200} bgColor="#F3EDE1" fgColor="#12100D" />
            </div>
            <div>
              <MeridianWordmark size="small" />
              <p className="font-display italic text-2xl mt-4 mb-2">Scan to join</p>
              <p className="text-parchment/50 text-sm break-all mb-1">{joinUrl}</p>
              <p className="text-parchment/40 text-xs">No app, account, or password needed.</p>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Stat label="Joined" value={state.counts.joined} />
          <Stat label="Completed" value={state.counts.completed} />
          {/* Answered/pending are scoped to whichever question is
              currently live — the two large numbers the presenter watches
              fill up in real time while a question is active. */}
          <Stat label="Answered" value={state.counts.answered} highlight={state.status === "live" && state.phase === "question"} />
          <Stat label="Pending" value={state.counts.pending} />
        </div>

        <div className="case-panel p-6 grid grid-cols-2 md:grid-cols-3 gap-6 text-sm mb-6">
          <div>
            <p className="field-label mb-1">Question</p>
            <p className="font-dial text-lg">
              {state.status === "waiting" ? "—" : `${state.questionNumber} of ${state.totalQuestions}`}
            </p>
          </div>
          <div>
            <p className="field-label mb-1">Phase</p>
            <p className="font-dial text-lg capitalize">{state.status === "waiting" ? "Not started" : state.phase}</p>
          </div>
        </div>

        {/* Live question + (once revealed) the correct answer and response
            distribution — presenter-only. Participants only ever see a
            plain correct/incorrect verdict on their own phones; the full
            picture lives here, and again afterward on each participant's
            results/download page. */}
        {state.question && (
          <div className="case-panel p-6 mb-6">
            <p className="text-lg font-medium mb-4">{state.question.questionText}</p>
            {state.question.imageUrl &&
              (state.question.mediaType === "video" ? (
                <video src={state.question.imageUrl} controls className="w-full max-h-72 object-contain bg-black mb-4" />
              ) : (
                <img src={state.question.imageUrl} alt="" className="w-full max-h-72 object-cover mb-4" />
              ))}

            <div className="flex flex-col gap-2">
              {state.question.options.map((opt) => {
                const dist = state.question!.distribution?.find((d) => d.key === opt.key);
                const isCorrect = state.question!.correctOption === opt.key;
                return (
                  <div key={opt.key} className="relative">
                    <div
                      className={`flex items-center justify-between px-4 py-3 border text-sm relative overflow-hidden ${
                        isCorrect ? "border-gold" : "border-hairline"
                      }`}
                    >
                      {dist && (
                        <div
                          className="absolute inset-y-0 left-0 bg-gold/10"
                          style={{ width: `${dist.percent}%` }}
                          aria-hidden
                        />
                      )}
                      <span className="relative z-10">
                        <span className="text-parchment/40 mr-2">{opt.key}</span>
                        {opt.text}
                        {isCorrect && <span className="text-gold ml-2">✓ Correct</span>}
                      </span>
                      {dist && (
                        <span className="relative z-10 font-dial text-xs text-parchment/60 shrink-0 ml-3">
                          {dist.count} · {dist.percent}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {state.question.explanation && (
              <p className="text-sm text-parchment/60 mt-4 border-t border-hairline pt-4">{state.question.explanation}</p>
            )}
          </div>
        )}

        {state.status === "finished" && (
          <>
            <div className="flex items-center justify-between mt-10 mb-4 flex-wrap gap-3">
              <p className="field-label">Full ranking (private — admin only)</p>
              <div className="flex gap-2 flex-wrap">
                <a href={`/api/sessions/${sessionId}/export?type=leaderboard`} className="btn-ghost text-sm px-4 py-2">
                  Download leaderboard (CSV)
                </a>
                <a href={`/api/sessions/${sessionId}/export?type=answers`} className="btn-ghost text-sm px-4 py-2">
                  Download answer sheet (CSV)
                </a>
                <button onClick={generateAnalysis} disabled={analysisLoading} className="btn-gold text-sm px-4 py-2">
                  {analysisLoading ? "Analyzing…" : "Generate AI analysis"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <input
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search by name…"
                className="field-input max-w-[200px] text-sm"
              />
              <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="field-input max-w-[200px] text-sm">
                <option value="">All stores</option>
                {filterOptions.stores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="field-input max-w-[200px] text-sm">
                <option value="">All cities</option>
                {filterOptions.cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {(nameSearch || storeFilter || cityFilter) && (
                <button
                  onClick={() => {
                    setNameSearch("");
                    setStoreFilter("");
                    setCityFilter("");
                  }}
                  className="btn-ghost text-sm px-4"
                >
                  Clear
                </button>
              )}
            </div>

            {analysis && <div className="case-panel p-6 mb-6 text-sm text-parchment/70 leading-relaxed">{analysis}</div>}

            {visibleLeaderboard && (
              <div className="case-panel divide-y divide-hairline">
                <div className="grid grid-cols-7 gap-2 px-5 py-3 text-xs text-parchment/40">
                  <span>Rank</span>
                  <span className="col-span-2">Name</span>
                  <span>Store / City</span>
                  <span>Correct</span>
                  <span>Base / Speed</span>
                  <span className="text-right">Total</span>
                </div>
                {visibleLeaderboard.map((r) => (
                  <div key={r.rank} className="grid grid-cols-7 gap-2 px-5 py-3 text-sm items-center">
                    <span className="font-dial">{r.rank}</span>
                    <span className="col-span-2">{r.name}</span>
                    <span className="text-parchment/50 text-xs">{[r.store, r.city].filter(Boolean).join(" — ") || "—"}</span>
                    <span className="font-dial text-xs">
                      {r.correctCount}/{r.totalQuestions}
                    </span>
                    <span className="text-parchment/50 text-xs">
                      {r.baseScore} / {r.speedBonus}
                    </span>
                    <span className="text-right font-dial text-gold">{r.totalScore}</span>
                  </div>
                ))}
                {visibleLeaderboard.length === 0 && (
                  <p className="px-5 py-8 text-center text-parchment/40 text-sm">No matching participants.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="case-panel p-5">
      <p className="field-label mb-2">{label}</p>
      <p className={`font-dial text-3xl ${highlight ? "text-gold" : ""}`}>{value}</p>
    </div>
  );
}
