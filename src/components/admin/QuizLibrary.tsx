"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Quiz } from "@/lib/types";

type QuizRow = Quiz & { question_count: number };

export default function QuizLibrary() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/quizzes");
    if (res.ok) {
      const data = await res.json();
      setQuizzes(data.quizzes);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createQuiz() {
    setBusyId("new");
    const res = await fetch("/api/quizzes", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setBusyId(null);
    if (res.ok) {
      const { quiz } = await res.json();
      router.push(`/admin/quizzes/${quiz.id}/edit`);
    }
  }

  async function duplicateQuiz(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/quizzes/${id}/duplicate`, { method: "POST" });
    setBusyId(null);
    if (res.ok) load();
    else setError("Could not duplicate this quiz.");
  }

  async function deleteQuiz(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) load();
    else setError("Could not delete this quiz.");
  }

  async function launchQuiz(id: string) {
    setBusyId(id);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: id })
    });
    setBusyId(null);
    if (res.ok) {
      const { session } = await res.json();
      router.push(`/admin/session/${session.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not launch this quiz.");
    }
  }

  if (!quizzes) return <p className="text-parchment/50">Loading your quizzes…</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-parchment/50 text-sm">{quizzes.length} quiz template{quizzes.length !== 1 ? "s" : ""}</p>
        <button onClick={createQuiz} disabled={busyId === "new"} className="btn-gold">
          + Create new quiz
        </button>
      </div>

      {error && <p className="text-crimson text-sm mb-4">{error}</p>}

      {quizzes.length === 0 ? (
        <div className="case-panel p-12 text-center">
          <p className="font-display italic text-xl mb-2">No quizzes yet</p>
          <p className="text-parchment/50 text-sm">Create your first quiz template to get started.</p>
        </div>
      ) : (
        <div className="case-panel divide-y divide-hairline">
          {quizzes.map((q) => (
            <div key={q.id} className="p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg truncate">{q.title}</p>
                <p className="text-parchment/50 text-xs mt-1">
                  {q.question_count} question{q.question_count !== 1 ? "s" : ""} · {q.time_limit_minutes} min ·{" "}
                  {q.pass_mark_percent}% pass · {q.scoring_mode === "speed_bonus" ? "Speed bonus" : "Standard"} scoring ·{" "}
                  {q.status === "draft" ? "Draft" : "Published"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <a href={`/admin/quizzes/${q.id}/edit`} className="btn-ghost px-4 py-2">
                  Edit
                </a>
                <a href={`/admin/quizzes/${q.id}/preview`} className="btn-ghost px-4 py-2">
                  Preview
                </a>
                <button onClick={() => duplicateQuiz(q.id)} disabled={busyId === q.id} className="btn-ghost px-4 py-2">
                  Duplicate
                </button>
                <button
                  onClick={() => launchQuiz(q.id)}
                  disabled={busyId === q.id || q.question_count === 0}
                  className="btn-gold px-4 py-2"
                  title={q.question_count === 0 ? "Add at least one question first" : undefined}
                >
                  Launch
                </button>
                <button
                  onClick={() => deleteQuiz(q.id, q.title)}
                  disabled={busyId === q.id}
                  className="px-4 py-2 text-crimson/80 hover:text-crimson transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
