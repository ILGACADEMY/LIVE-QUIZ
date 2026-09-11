"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Quiz, ScoringMode, AfterAnswerMode } from "@/lib/types";
import Toggle from "@/components/shared/Toggle";
import QuestionEditor, { EditableQuestion, blankQuestion } from "@/components/admin/QuestionEditor";
import ImportQuestionsModal from "@/components/admin/ImportQuestionsModal";

const SPEED_WINDOWS = [5, 10, 15, 20, 30];
const MAX_QUESTIONS = 50;

type Tab = "settings" | "questions";

export default function QuizEditor({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [tab, setTab] = useState<Tab>("questions");
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [customWindow, setCustomWindow] = useState(false);
  const [customTimer, setCustomTimer] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);

  useEffect(() => {
    fetch(`/api/quizzes/${quizId}`)
      .then((r) => r.json())
      .then((data) => {
        setQuiz(data.quiz);
        setQuestions(data.questions ?? []);
        setCustomWindow(!SPEED_WINDOWS.includes(data.quiz.speed_bonus_window_seconds));
        setCustomTimer(!SPEED_WINDOWS.includes(data.quiz.question_timer_seconds));
      });
  }, [quizId]);

  // Auto-dismiss the toast after a few seconds so it doesn't sit forever.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function setQuizField<K extends keyof Quiz>(key: K, value: Quiz[K]) {
    if (!quiz) return;
    setQuiz({ ...quiz, [key]: value });
  }

  function addQuestion() {
    setQuestions((qs) => {
      const next = [...qs, blankQuestion()];
      setActiveIndex(next.length - 1);
      return next;
    });
  }
  function importParsedQuestions(parsed: EditableQuestion[]) {
    setQuestions((qs) => {
      const room = MAX_QUESTIONS - qs.length;
      const toAdd = parsed.slice(0, Math.max(0, room));
      const next = [...qs, ...toAdd];
      if (toAdd.length > 0) setActiveIndex(qs.length); // jump to the first newly-imported question
      return next;
    });
    setShowImport(false);
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
      setActiveIndex(i + 1);
      return next;
    });
  }
  function deleteQuestion(i: number) {
    setQuestions((qs) => {
      const next = qs.filter((_, idx) => idx !== i);
      setActiveIndex((cur) => Math.max(0, Math.min(cur, next.length - 1)));
      return next;
    });
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      setActiveIndex(j);
      return next;
    });
  }

  async function save(publish?: boolean) {
    if (!quiz) return;
    setSaving(true);
    setToast(null);
    const payload = {
      quiz: { ...quiz, status: publish ? "published" : quiz.status },
      questions
    };
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (publish) setQuiz((q) => (q ? { ...q, status: "published" } : q));
        setToast({ type: "success", text: publish ? "✓ Saved and published" : "✓ Saved" });
      } else {
        setToast({ type: "error", text: data.error ?? "Could not save. Please try again." });
      }
    } catch {
      setToast({ type: "error", text: "Network error — check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  if (!quiz) return <main className="min-h-screen px-6 py-10 text-parchment/50">Loading…</main>;

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 pb-28">
      {/* TOAST — impossible to miss, unlike a small caption */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 border font-body font-semibold text-sm shadow-lg ${
            toast.type === "success" ? "bg-gold text-charcoal border-gold" : "bg-crimson text-ivory border-crimson"
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <button onClick={() => router.push("/admin")} className="text-parchment/50 text-sm mb-4 hover:text-gold">
          ← My Quizzes
        </button>

        <input
          value={quiz.title}
          onChange={(e) => setQuizField("title", e.target.value)}
          className="font-display italic text-3xl bg-transparent border-none outline-none w-full mb-2 px-0 focus:border-none"
          placeholder="Quiz title"
        />

        {/* One toggle affecting both tabs: Simple mode hides everything
            beyond the true essentials — question text, 4 options, a
            correct answer, time limit, pass mark, leaderboard, AI
            feedback — behind sensible defaults (standard scoring, 20s
            timer, English only, no randomization). Nothing is deleted or
            reset when switching modes; flipping this on just reveals the
            same settings underneath, already there. */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setAdvancedMode((v) => !v)}
            className={`text-xs px-3 py-1.5 border transition-colors ${
              advancedMode ? "border-gold text-gold" : "border-hairline text-parchment/50 hover:border-gold/50"
            }`}
          >
            {advancedMode ? "✓ Advanced settings shown" : "Show advanced settings"}
          </button>
          {!advancedMode && (
            <p className="text-parchment/30 text-xs">
              Simple mode — scoring, timers, translation, and randomization are using sensible defaults, hidden for now.
            </p>
          )}
        </div>

        {/* TABS */}
        <div className="flex gap-6 border-b border-hairline mt-6 mb-6">
          {(["questions", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-body font-medium border-b-2 transition-colors ${
                tab === t ? "border-gold text-gold" : "border-transparent text-parchment/50 hover:text-ivory"
              }`}
            >
              {t === "questions" ? `Questions (${questions.length}/${MAX_QUESTIONS})` : "Settings & scoring"}
            </button>
          ))}
        </div>

        {tab === "settings" && (
          <div className="max-w-3xl">
            <textarea
              value={quiz.description}
              onChange={(e) => setQuizField("description", e.target.value)}
              rows={2}
              className="w-full bg-transparent border-none outline-none text-parchment/60 resize-none px-0 mb-6"
              placeholder="Quiz description — shown to trainers browsing the library."
            />

            <section className="case-panel p-6 mb-6">
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
            </section>

            {advancedMode && (
              <section className="case-panel p-6 mb-6">
                <p className="field-label mb-4">Advanced quiz behavior</p>
                <Toggle
                  label="Require mobile/email on join"
                  checked={quiz.require_contact_info}
                  onChange={(v) => setQuizField("require_contact_info", v)}
                />
                {quiz.require_contact_info ? (
                  <p className="text-xs text-parchment/40 -mt-2 mb-4 ml-1">
                    The mobile number field appears on the join screen and is required (email stays optional) — this
                    is what stops the same person joining twice. Turn this on for a real competition; leave it off
                    for a casual quiz where that friction isn't worth it.
                  </p>
                ) : (
                  <p className="text-xs text-parchment/30 -mt-2 mb-4 ml-1">
                    Off by default — mobile/email fields are hidden on the join screen entirely, just Name/Store/City.
                    Turn this on if you need to stop duplicate entries for a bigger competition.
                  </p>
                )}
                <Toggle
                  label="Multi-language translation"
                  checked={quiz.translation_enabled}
                  onChange={(v) => setQuizField("translation_enabled", v)}
                />
                {quiz.translation_enabled && (
                  <p className="text-xs text-parchment/40 -mt-2 mb-2 ml-1">
                    Participants will see a language picker on the join screen. Each question is translated by AI on
                    first use per language — this has a real, ongoing AI cost, unlike the other toggles here.
                  </p>
                )}
                {!quiz.translation_enabled && (
                  <p className="text-xs text-parchment/30 -mt-2 mb-2 ml-1">
                    Off by default to avoid AI translation costs. When off, every participant sees this quiz in
                    English only — the language picker is hidden on the join screen entirely.
                  </p>
                )}
                <Toggle label="Randomize questions" checked={quiz.randomize_questions} onChange={(v) => setQuizField("randomize_questions", v)} />
                <Toggle label="Randomize answers" checked={quiz.randomize_answers} onChange={(v) => setQuizField("randomize_answers", v)} />
                <Toggle label="Allow back navigation" checked={quiz.back_navigation_enabled} onChange={(v) => setQuizField("back_navigation_enabled", v)} />
              </section>
            )}

            {advancedMode && (
              <>
                <section className="case-panel p-6 mb-6">
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
                      {mode === "standard" ? "Correct = 1 point. No speed bonus." : "Correct = 1 point + up to 10 speed points."}
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
                    A correct answer scores 1 point plus up to 10 speed points, dropping to 0 by the {quiz.speed_bonus_window_seconds}s mark. Wrong answers never receive a speed bonus.
                  </p>
                </>
              )}
            </section>

            <section className="case-panel p-6 mb-6">
              <p className="field-label mb-4">Question timer (live sessions)</p>
              <p className="text-xs text-parchment/40 mb-3">
                How long each question stays open in a LIVE session before it auto-reveals. The presenter can also reveal early at any time.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {SPEED_WINDOWS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setCustomTimer(false);
                      setQuizField("question_timer_seconds", s);
                    }}
                    className={`px-4 py-2 text-sm border transition-colors ${
                      !customTimer && quiz.question_timer_seconds === s
                        ? "bg-gold text-charcoal border-gold"
                        : "border-hairline hover:border-gold/50"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
                <button
                  onClick={() => setCustomTimer(true)}
                  className={`px-4 py-2 text-sm border transition-colors ${
                    customTimer ? "bg-gold text-charcoal border-gold" : "border-hairline hover:border-gold/50"
                  }`}
                >
                  Custom
                </button>
              </div>
              {customTimer && (
                <input
                  type="number"
                  min={5}
                  value={quiz.question_timer_seconds}
                  onChange={(e) => setQuizField("question_timer_seconds", Number(e.target.value))}
                  className="field-input max-w-[160px]"
                />
              )}
            </section>

            <section className="case-panel p-6 mb-6">
              <p className="field-label mb-1">After answering</p>
              <p className="text-xs text-parchment/40 mb-3">Used by Preview only — a live session is always presenter-controlled regardless of this setting.</p>
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
              </>
            )}
          </div>
        )}

        {tab === "questions" && (
          <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
            {/* LEFT: compact question list, own scroll, "+ Add" always visible — no more scrolling to the top */}
            <div className="md:sticky md:top-6">
              <button
                onClick={addQuestion}
                disabled={questions.length >= MAX_QUESTIONS}
                className="btn-gold w-full mb-2 text-sm py-2.5"
              >
                + Add question
              </button>
              <button onClick={() => setShowImport(true)} className="btn-ghost w-full mb-4 text-sm py-2.5">
                Import from Word / text
              </button>
              <div className="case-panel max-h-[70vh] overflow-y-auto divide-y divide-hairline">
                {questions.length === 0 && (
                  <p className="p-4 text-parchment/40 text-sm">No questions yet.</p>
                )}
                {questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIndex(i)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      activeIndex === i ? "bg-gold/10 border-l-2 border-gold" : "hover:bg-hairline/20 border-l-2 border-transparent"
                    }`}
                  >
                    <p className="text-xs text-parchment/40 mb-0.5">Q{i + 1}</p>
                    <p className="text-sm truncate">{q.question_text || "(Untitled question)"}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT: the single active question's full editor */}
            <div>
              {questions.length === 0 && (
                <div className="case-panel p-10 text-center text-parchment/50">
                  No questions yet. Click <span className="text-gold">+ Add question</span> on the left to add your first one.
                </div>
              )}
              {questions[activeIndex] && (
                <QuestionEditor
                  index={activeIndex}
                  total={questions.length}
                  question={questions[activeIndex]}
                  onChange={(next) => updateQuestion(activeIndex, next)}
                  onDuplicate={() => duplicateQuestion(activeIndex)}
                  onDelete={() => deleteQuestion(activeIndex)}
                  onMoveUp={() => moveQuestion(activeIndex, -1)}
                  onMoveDown={() => moveQuestion(activeIndex, 1)}
                  advancedMode={advancedMode}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* STICKY SAVE BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-charcoal/95 backdrop-blur border-t border-hairline px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-end gap-3">
          <button onClick={() => save(false)} disabled={saving} className="btn-ghost px-6 py-3">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => save(true)} disabled={saving} className="btn-gold px-6 py-3">
            {saving ? "Saving…" : "Save & publish"}
          </button>
        </div>
      </div>

      {showImport && (
        <ImportQuestionsModal
          remainingSlots={MAX_QUESTIONS - questions.length}
          onImport={importParsedQuestions}
          onClose={() => setShowImport(false)}
        />
      )}
    </main>
  );
}
