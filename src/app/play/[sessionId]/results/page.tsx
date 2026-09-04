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
}

interface Profile {
  strong: string[];
  improve: string[];
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
    fetch("/api/ai/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", sessionId: params.sessionId, participantId })
    })
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .catch(() => {});

    data.breakdown
      .filter((b) => !b.isCorrect)
      .forEach((b) => {
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
          .catch(() => {});
      });
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

        <div className="flex justify-center mb-8 no-print">
          <button onClick={() => window.print()} className="btn-ghost text-sm px-5 py-2.5">
            Download my results (PDF)
          </button>
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
            {profile.strong.length > 0 && (
              <p className="text-sm mb-2">
                <span className="text-gold">Strong: </span>
                {profile.strong.join(", ")}
              </p>
            )}
            {profile.improve.length > 0 && (
              <p className="text-sm mb-3">
                <span className="text-crimson/80">Improve: </span>
                {profile.improve.join(", ")}
              </p>
            )}
            {profile.recommendation && <p className="text-sm text-parchment/60">{profile.recommendation}</p>}
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
