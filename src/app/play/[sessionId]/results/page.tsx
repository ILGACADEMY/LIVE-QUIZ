"use client";

import { useEffect, useState } from "react";

interface Breakdown {
  questionIndex: number;
  questionText: string;
  category: string;
  isCorrect: boolean;
  selectedText: string;
  correctText: string;
  explanation: string;
  baseScore: number;
  speedBonus: number;
  questionScore: number;
}

interface ResultsData {
  quizTitle: string;
  name: string;
  totalScore: number;
  baseScore: number;
  speedBonus: number;
  percentage: number;
  passed: boolean;
  timeSeconds: number | null;
  aiFeedbackEnabled: boolean;
  breakdown: Breakdown[];
  categoryBreakdown: { category: string; correct: number; total: number }[];
  topicBreakdown: { topic: string; correct: number; total: number }[];
}

interface Profile {
  summary: string;
  strong: string[];
  improve: string[];
  focusTopics: string[];
  recommendation: string;
}

function formatTime(seconds: number | null) {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ResultsPage({
  params,
  searchParams
}: {
  params: { sessionId: string };
  searchParams: { participantId?: string };
}) {
  const participantId = searchParams.participantId;
  const [data, setData] = useState<ResultsData | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!participantId) {
      setError("Missing participant. Please rejoin from the QR code.");
      return;
    }
    fetch(`/api/sessions/${params.sessionId}/results?participantId=${participantId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Could not load results.");
        return r.json();
      })
      .then((d: ResultsData) => setData(d))
      .catch((e) => setError(e.message));

    fetch(`/api/sessions/${params.sessionId}/leaderboard?participantId=${participantId}`)
      .then((r) => r.json())
      .then((d) => setRank(d.yourRank?.rank ?? null))
      .catch(() => {});
  }, [params.sessionId, participantId]);

  useEffect(() => {
    if (!data || !data.aiFeedbackEnabled) return;
    setAiLoading(true);

    const profilePromise = fetch("/api/ai/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", sessionId: params.sessionId, participantId })
    })
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .catch(() => {});

    const feedbackPromises = data.breakdown
      .filter((b) => !b.isCorrect)
      .map((b) =>
        fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: b.questionText,
            participantAnswerText: b.selectedText,
            correctAnswerText: b.correctText,
            adminExplanation: b.explanation
          })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.feedback) setFeedback((prev) => ({ ...prev, [b.questionIndex]: d.feedback }));
          })
          .catch(() => {})
      );

    // Only once every AI call has settled (succeeded or failed) is the
    // page actually done — this is what the download button waits on, so
    // clicking "Download" before this resolves can't produce a PDF
    // that's missing the analysis because it printed too early.
    Promise.allSettled([profilePromise, ...feedbackPromises]).then(() => setAiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-parchment/50">{error}</p>
      </main>
    );
  }
  if (!data) {
    return <main className="min-h-screen flex items-center justify-center text-parchment/50">Loading your results…</main>;
  }

  return (
    <main className="min-h-screen px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <p className="text-gold text-xs tracking-[0.2em] mb-3 text-center">{data.quizTitle.toUpperCase()}</p>
        <p className="font-display italic text-2xl text-center mb-4">Nice work, {data.name}</p>

        <div className="flex flex-col items-center gap-2 mb-8 no-print">
          <button
            onClick={() => window.print()}
            disabled={aiLoading}
            className="btn-ghost text-sm px-5 py-2.5 disabled:opacity-50"
          >
            {aiLoading ? "Preparing your analysis…" : "Download my results (PDF)"}
          </button>
          {aiLoading && <p className="text-xs text-parchment/40">Your AI analysis is still being written — this only takes a few seconds.</p>}
        </div>

        <div className="case-panel p-8 text-center mb-6">
          <p className="font-dial text-5xl text-gold mb-2">{data.totalScore}</p>
          <p className="text-parchment/50 text-sm mb-6">points</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="field-label mb-1">Percentage</p>
              <p className="font-dial text-lg">{data.percentage}%</p>
            </div>
            <div>
              <p className="field-label mb-1">Your rank</p>
              <p className="font-dial text-lg">{rank ? `#${rank}` : "—"}</p>
            </div>
            <div>
              <p className="field-label mb-1">Time</p>
              <p className="font-dial text-lg">{formatTime(data.timeSeconds)}</p>
            </div>
          </div>
          <p className={`mt-6 text-sm font-semibold ${data.passed ? "text-gold" : "text-crimson"}`}>
            {data.passed ? "Passed" : "Below pass mark"}
          </p>
        </div>

        {data.speedBonus > 0 && (
          <div className="case-panel p-5 mb-6 text-sm flex justify-between">
            <span className="text-parchment/50">Base score</span>
            <span>{data.baseScore}</span>
          </div>
        )}
        {data.speedBonus > 0 && (
          <div className="case-panel p-5 mb-6 text-sm flex justify-between -mt-6 border-t-0">
            <span className="text-parchment/50">Speed bonus</span>
            <span>{data.speedBonus}</span>
          </div>
        )}

        {profile && (
          <div className="case-panel p-6 mb-6">
            <p className="field-label mb-4">Your learning profile</p>
            {profile.summary && <p className="text-sm text-parchment/80 leading-relaxed mb-4">{profile.summary}</p>}
            {profile.strong.length > 0 && (
              <p className="text-sm mb-2">
                <span className="text-gold">Strong categories: </span>
                {profile.strong.join(", ")}
              </p>
            )}
            {profile.improve.length > 0 && (
              <p className="text-sm mb-3">
                <span className="text-crimson/80">Categories to improve: </span>
                {profile.improve.join(", ")}
              </p>
            )}
            {profile.focusTopics && profile.focusTopics.length > 0 && (
              <div className="mb-3">
                <p className="text-sm text-gold mb-1">Concentrate on these topics next:</p>
                <ul className="list-disc list-inside text-sm text-parchment/70">
                  {profile.focusTopics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </div>
            )}
            {profile.recommendation && <p className="text-sm text-parchment/60">{profile.recommendation}</p>}
          </div>
        )}

        {/* Visual percentage breakdown — the actual numbers behind the AI
            profile above, not just its summary of them. Sorted weakest
            first so the thing most worth studying is the first thing
            seen. */}
        {data.categoryBreakdown && data.categoryBreakdown.length > 0 && (
          <div className="case-panel p-6 mb-6">
            <p className="field-label mb-4">Knowledge by category</p>
            <div className="flex flex-col gap-3">
              {[...data.categoryBreakdown]
                .sort((a, b) => a.correct / a.total - b.correct / b.total)
                .map((c) => {
                  const pct = Math.round((c.correct / c.total) * 100);
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{c.category}</span>
                        <span className="font-dial text-parchment/60">
                          {c.correct}/{c.total} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-hairline overflow-hidden">
                        <div className={`h-full ${pct >= 70 ? "bg-gold" : pct >= 40 ? "bg-parchment/50" : "bg-crimson"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {data.topicBreakdown && data.topicBreakdown.length > 0 && (
          <div className="case-panel p-6 mb-6">
            <p className="field-label mb-4">Knowledge by topic</p>
            <div className="flex flex-col gap-3">
              {[...data.topicBreakdown]
                .sort((a, b) => a.correct / a.total - b.correct / b.total)
                .map((t) => {
                  const pct = Math.round((t.correct / t.total) * 100);
                  return (
                    <div key={t.topic}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{t.topic}</span>
                        <span className="font-dial text-parchment/60">
                          {t.correct}/{t.total} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-hairline overflow-hidden">
                        <div className={`h-full ${pct >= 70 ? "bg-gold" : pct >= 40 ? "bg-parchment/50" : "bg-crimson"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <p className="field-label mb-4">Question review</p>
        <div className="flex flex-col gap-4">
          {data.breakdown.map((b) => (
            <div key={b.questionIndex} className="case-panel p-5">
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-medium pr-4">{b.questionText}</p>
                <span className={`text-xs shrink-0 font-semibold ${b.isCorrect ? "text-gold" : "text-crimson"}`}>
                  {b.isCorrect ? "Correct" : "Incorrect"}
                </span>
              </div>
              {!b.isCorrect && (
                <p className="text-xs text-parchment/50 mb-1">
                  You answered <span className="text-ivory">{b.selectedText}</span> — correct answer was{" "}
                  <span className="text-gold">{b.correctText}</span>
                </p>
              )}
              {b.explanation && <p className="text-xs text-parchment/40 mb-2">{b.explanation}</p>}
              {!b.isCorrect && feedback[b.questionIndex] && (
                <p className="text-xs text-parchment/70 border-t border-hairline pt-2 mt-2">{feedback[b.questionIndex]}</p>
              )}
              <p className="text-xs text-parchment/30 mt-2">+{b.questionScore} pts</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
