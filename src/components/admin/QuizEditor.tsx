"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Quiz, ScoringMode, AfterAnswerMode } from "@/lib/types";
import Toggle from "@/components/shared/Toggle";
import QuestionEditor, { EditableQuestion, blankQuestion } from "@/components/admin/QuestionEditor";

const SPEED_WINDOWS = [5, 10, 15, 20, 30];
const MAX_QUESTIONS = 50;

export default function QuizEditor({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customWindow, setCustomWindow] = useState(false);

  useEffect(() => {
    fetch(`/api/quizzes/${quizId}`)
      .then((r) => r.json())
      .then((data) => {
        setQuiz(data.quiz);
        setQuestions(data.questions ?? []);
        setCustomWindow(!SPEED_WINDOWS.includes(data.quiz.speed_bonus_window_seconds));
      });
  }, [quizId]);

  function setQuizField<K extends keyof Quiz>(key: K, value: Quiz[K]) {
    if (!quiz) return;
    setQuiz({ ...quiz, [key]: value });
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()]);
  }
  function updateQuestion(i: number, q: EditableQuestion) {
    setQuestions((qs) => qs.map((old, idx) => (idx === i ? q : old)));
  }
  function duplicateQuestion(i: number) {
    setQuestions((qs) => {
      if (qs.length >= MAX_QUESTIONS) return qs;
      const copy = { ...qs[i], id: undefined };
      const next = [...qs];
      next.splice(i + 1, 0, copy);
      return next;
    });
  }
  function deleteQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save(publish?: boolean) {
    if (!quiz) return;
    setSaving(true);
    setError(null);
    const payload = {
      quiz: { ...quiz, status: publish ? "published" : quiz.status },
      questions
    };
    const res = await fetch(`/api/quizzes/${quizId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(Date.now());
      if (publish) setQuiz((q) => (q ? { ...q, status: "published" } : q));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
    }
  }

  if (!quiz) return <main className="min-h-screen px-6 py-10 text-parchment/50">Loading…</main>;

  return (
    <main className="min-h-screen px-6 py-10 md:px-12 pb-32">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push("/admin")} className="text-parchment/50 text-sm mb-6 hover:text-gold">
          ← My Quizzes
        </button>

        <input
          value={quiz.title}
          onChange={(e) => setQuizField("title", e.target.value)}
          className="font-display italic text-3xl bg-transparent border-none outline-none w-full mb-2 px-0 focus:border-none"
          placeholder="Quiz title"
        />
        <textarea
          value={quiz.description}
          onChange={(e) => setQuizField("description", e.target.value)}
          rows={2}
          className="w-full bg-transparent border-none outline-none text-parchment/60 resize-none px-0 mb-8"
          placeholder="Quiz description — shown to trainers browsing the library."
        />

        {/* SETTINGS */}
        <section className="case-panel p-6 mb-8">
          <p className="field-label mb-4">Quiz settings</p>

          <div className="grid md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="field-label block mb-2">Time limit (minutes)</label>
              <input
                type="number"
                min={1}
                value={quiz.time_limit_minutes}
                onChange={(e) => setQuizField("time_limit_minutes", Number(e.target.value))}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label block mb-2">Pass mark (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={quiz.pass_mark_percent}
                onChange={(e) => setQuizField("pass_mark_percent", Number(e.target.value))}
                className="field-input"
              />
            </div>
          </div>

          <Toggle label="Leaderboard" checked={quiz.leaderboard_enabled} onChange={(v) => setQuizField("leaderboard_enabled", v)} />
          <Toggle label="AI feedback" checked={quiz.ai_feedback_enabled} onChange={(v) => setQuizField("ai_feedback_enabled", v)} />
          <Toggle label="Randomize questions" checked={quiz.randomize_questions} onChange={(v) => setQuizField("randomize_questions", v)} />
          <Toggle label="Randomize answers" checked={quiz.randomize_answers} onChange={(v) => setQuizField("randomize_answers", v)} />
          <Toggle label="Allow back navigation" checked={quiz.back_navigation_enabled} onChange={(v) => setQuizField("back_navigation_enabled", v)} />
        </section>

        {/* SCORING */}
        <section className="case-panel p-6 mb-8">
          <p className="field-label mb-4">Scoring mode</p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {(["standard", "speed_bonus"] as ScoringMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setQuizField("scoring_mode", mode)}
                className={`p-4 text-left border transition-colors ${
                  quiz.scoring_mode === mode ? "border-gold bg-gold/10" : "border-hairline hover:border-gold/50"
                }`}
              >
                <p className="font-body font-semibold text-sm mb-1">{mode === "standard" ? "Standard" : "Speed bonus"}</p>
                <p className="text-xs text-parchment/50">
                  {mode === "standard" ? "Correct = 1 point. No speed bonus." : "Correct = 1 point + remaining seconds."}
                </p>
              </button>
            ))}
          </div>

          {quiz.scoring_mode === "speed_bonus" && (
            <>
              <label className="field-label block mb-2">Speed bonus window</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {SPEED_WINDOWS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setCustomWindow(false);
                      setQuizField("speed_bonus_window_seconds", s);
                    }}
                    className={`px-4 py-2 text-sm border transition-colors ${
                      !customWindow && quiz.speed_bonus_window_seconds === s
                        ? "bg-gold text-charcoal border-gold"
                        : "border-hairline hover:border-gold/50"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
                <button
                  onClick={() => setCustomWindow(true)}
                  className={`px-4 py-2 text-sm border transition-colors ${
                    customWindow ? "bg-gold text-charcoal border-gold" : "border-hairline hover:border-gold/50"
                  }`}
                >
                  Custom
                </button>
              </div>
              {customWindow && (
                <input
                  type="number"
                  min={1}
                  value={quiz.speed_bonus_window_seconds}
                  onChange={(e) => setQuizField("speed_bonus_window_seconds", Number(e.target.value))}
                  className="field-input max-w-[160px] mb-2"
                />
              )}
              <p className="text-xs text-parchment/40">
                A correct answer with {quiz.speed_bonus_window_seconds}s remaining scores 1 + {quiz.speed_bonus_window_seconds} points. Wrong answers never receive a speed bonus.
              </p>
            </>
          )}
        </section>

        <section className="case-panel p-6 mb-8">
          <p className="field-label mb-4">After answering</p>
          <div className="grid grid-cols-2 gap-3">
            {(["auto_advance", "next_button"] as AfterAnswerMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setQuizField("after_answer_mode", mode)}
                className={`p-4 text-left border transition-colors ${
                  quiz.after_answer_mode === mode ? "border-gold bg-gold/10" : "border-hairline hover:border-gold/50"
                }`}
              >
                <p className="font-body font-semibold text-sm">
                  {mode === "auto_advance" ? "Auto-advance" : "Show \u201cNext\u201d button"}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* QUESTIONS */}
        <div className="flex items-center justify-between mb-4">
          <p className="field-label">
            Questions ({questions.length}/{MAX_QUESTIONS})
          </p>
          <button onClick={addQuestion} disabled={questions.length >= MAX_QUESTIONS} className="btn-ghost px-4 py-2 text-sm">
            + Add question
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {questions.map((q, i) => (
            <QuestionEditor
              key={i}
              index={i}
              total={questions.length}
              question={q}
              onChange={(next) => updateQuestion(i, next)}
              onDuplicate={() => duplicateQuestion(i)}
              onDelete={() => deleteQuestion(i)}
              onMoveUp={() => moveQuestion(i, -1)}
              onMoveDown={() => moveQuestion(i, 1)}
            />
          ))}
        </div>

        {questions.length === 0 && (
          <div className="case-panel p-10 text-center text-parchment/50">No questions yet. Add your first one above.</div>
        )}
      </div>

      {/* STICKY SAVE BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-charcoal/95 backdrop-blur border-t border-hairline px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="text-xs text-parchment/40">
            {error && <span className="text-crimson">{error}</span>}
            {!error && savedAt && <span>Saved</span>}
          </div>
          <div className="flex gap-3">
            <button onClick={() => save(false)} disabled={saving} className="btn-ghost px-6 py-3">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => save(true)} disabled={saving} className="btn-gold px-6 py-3">
              Save &amp; publish
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
