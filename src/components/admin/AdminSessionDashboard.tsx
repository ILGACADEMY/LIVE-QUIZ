"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface AdminLeaderboardRow {
  rank: number;
  name: string;
  totalScore: number;
  baseScore: number;
  speedBonus: number;
  completedAt: string;
}

interface StateResponse {
  status: "waiting" | "live" | "finished";
  quizTitle: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  startedAt: string | null;
  counts: { joined: number; started: number; completed: number; answersReceived: number; avgQuestionIndex: number };
}

export default function AdminSessionDashboard({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<StateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [fullLeaderboard, setFullLeaderboard] = useState<AdminLeaderboardRow[] | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/state`);
    if (res.ok) setState(await res.json());
  }, [sessionId]);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${sessionId}`);
    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [poll, sessionId]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`session:${sessionId}`)
      .on("broadcast", { event: "answer_count" }, () => poll())
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
  async function endQuiz() {
    if (!confirm("End this quiz for everyone? Participants mid-question will be cut off.")) return;
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
    const res = await fetch(`/api/sessions/${sessionId}/leaderboard?admin=1`);
    if (res.ok) setFullLeaderboard((await res.json()).leaderboard);
  }, [sessionId]);

  useEffect(() => {
    if (state?.status === "finished") loadFullLeaderboard();
  }, [state?.status, loadFullLeaderboard]);

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

  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push("/admin")} className="text-parchment/50 text-sm mb-6 hover:text-gold">
          ← My Quizzes
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">
              {state.status === "waiting" ? "WAITING TO START" : state.status === "live" ? "LIVE" : "FINISHED"}
            </p>
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

        {state.status === "waiting" && (
          <section className="case-panel p-10 mb-8 flex flex-col md:flex-row items-center gap-10">
            <div className="bg-ivory p-4 shrink-0">
              <QRCodeSVG value={joinUrl} size={200} bgColor="#F3EDE1" fgColor="#12100D" />
            </div>
            <div>
              <p className="font-display italic text-2xl mb-2">Scan to join</p>
              <p className="text-parchment/50 text-sm break-all mb-1">{joinUrl}</p>
              <p className="text-parchment/40 text-xs">No app, account, or password needed.</p>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Stat label="Joined" value={state.counts.joined} />
          <Stat label="In progress" value={state.counts.started} />
          <Stat label="Completed" value={state.counts.completed} />
          <Stat label="Answers received" value={state.counts.answersReceived} />
        </div>

        <div className="case-panel p-6 grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="field-label mb-1">Total questions</p>
            <p className="font-dial text-lg">{state.totalQuestions}</p>
          </div>
          <div>
            <p className="field-label mb-1">Time limit</p>
            <p className="font-dial text-lg">{state.timeLimitMinutes} min</p>
          </div>
          <div>
            <p className="field-label mb-1">Average progress</p>
            <p className="font-dial text-lg">
              Q{Math.min(Math.ceil(state.counts.avgQuestionIndex), state.totalQuestions)} of {state.totalQuestions}
            </p>
          </div>
        </div>

        {state.status === "finished" && (
          <>
            <div className="flex items-center justify-between mt-10 mb-4">
              <p className="field-label">Full ranking (private — admin only)</p>
              <div className="flex gap-2">
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

            {analysis && <div className="case-panel p-6 mb-6 text-sm text-parchment/70 leading-relaxed">{analysis}</div>}

            {fullLeaderboard && (
              <div className="case-panel divide-y divide-hairline">
                <div className="grid grid-cols-5 gap-2 px-5 py-3 text-xs text-parchment/40">
                  <span>Rank</span>
                  <span className="col-span-2">Name</span>
                  <span>Base / Speed</span>
                  <span className="text-right">Total</span>
                </div>
                {fullLeaderboard.map((r) => (
                  <div key={r.rank} className="grid grid-cols-5 gap-2 px-5 py-3 text-sm items-center">
                    <span className="font-dial">{r.rank}</span>
                    <span className="col-span-2">{r.name}</span>
                    <span className="text-parchment/50 text-xs">
                      {r.baseScore} / {r.speedBonus}
                    </span>
                    <span className="text-right font-dial text-gold">{r.totalScore}</span>
                  </div>
                ))}
                {fullLeaderboard.length === 0 && (
                  <p className="px-5 py-8 text-center text-parchment/40 text-sm">No one finished this session.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="case-panel p-5">
      <p className="field-label mb-2">{label}</p>
      <p className="font-dial text-3xl text-gold">{value}</p>
    </div>
  );
}
