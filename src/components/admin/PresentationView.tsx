"use client";

import PresenterTimer from "@/components/admin/PresenterTimer";
import ResponseDistributionChart from "@/components/admin/ResponseDistributionChart";

interface PresentationQuestion {
  questionText: string;
  imageUrl: string | null;
  mediaType: "image" | "video";
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
  correctOption?: "A" | "B" | "C" | "D";
  explanation?: string;
  distribution?: { key: "A" | "B" | "C" | "D"; count: number; percent: number }[];
}

/**
 * A genuinely separate layout for the moment a question is actually on
 * screen in front of a room — not the admin dashboard scaled up. No
 * stat cards, no search boxes, no delete/session-management controls:
 * just the hierarchy a room needs to read from several meters away —
 * quiz title, question number, the question itself, the options, and a
 * highly visible timer. Typography uses clamp() so it scales sensibly
 * from a 1366×768 laptop panel up to a 4K TV without needing separate
 * breakpoints for each.
 *
 * Presenter controls live here too, in a small unobtrusive corner bar
 * — this app has no separate presenter-only monitor, so the presenter's
 * own screen is the same one the room sees. Leaving it fully controlless
 * would look cleaner but strands the presenter with no way to advance
 * the quiz without leaving presentation mode entirely, which defeats
 * the point.
 */
export default function PresentationView({
  quizTitle,
  questionNumber,
  totalQuestions,
  question,
  phase,
  phaseDeadline,
  sessionId,
  busy,
  onAdvance,
  onEndQuiz,
  onExit
}: {
  quizTitle: string;
  questionNumber: number;
  totalQuestions: number;
  question: PresentationQuestion;
  phase: "question" | "revealed";
  phaseDeadline: string | null;
  sessionId: string;
  busy: boolean;
  onAdvance: () => void;
  onEndQuiz: () => void;
  onExit: () => void;
}) {
  const isLastQuestion = questionNumber >= totalQuestions;
  const advanceLabel = phase === "question" ? "Reveal answer" : isLastQuestion ? "End quiz" : "Next question";

  return (
    <div className="fixed inset-0 bg-presenter-cream text-charcoal flex flex-col items-center px-[4vw] py-[3vh] overflow-hidden">
      {/* Small, deliberately unobtrusive — this is a control bar for the
          presenter, not something the room's attention should go to. */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {phase === "question" || !isLastQuestion ? (
          <button
            onClick={onAdvance}
            disabled={busy}
            className="text-xs px-3 py-1.5 border border-gold-dim/40 text-charcoal/60 hover:text-gold-dim hover:border-gold-dim bg-presenter-cream/60"
          >
            {advanceLabel}
          </button>
        ) : (
          <span className="text-xs px-3 py-1.5 text-charcoal/30">Ending automatically…</span>
        )}
        <button
          onClick={onEndQuiz}
          disabled={busy}
          className="text-xs px-3 py-1.5 border border-gold-dim/40 text-charcoal/40 hover:text-crimson hover:border-crimson bg-presenter-cream/60"
        >
          End quiz
        </button>
        <a
          href={`/leaderboard/${sessionId}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 border border-gold-dim/40 text-charcoal/40 hover:text-gold-dim hover:border-gold-dim bg-presenter-cream/60"
        >
          Leaderboard
        </a>
        <button
          onClick={onExit}
          className="text-xs px-3 py-1.5 border border-gold-dim/40 text-charcoal/40 hover:text-gold-dim hover:border-gold-dim bg-presenter-cream/60"
        >
          Exit
        </button>
      </div>

      <p className="text-gold-dim tracking-[0.3em]" style={{ fontSize: "clamp(0.8rem, 1.2vw, 1.1rem)" }}>
        MERIDIAN
      </p>
      <p className="text-charcoal/60 mt-1 mb-[2vh] text-center" style={{ fontSize: "clamp(1rem, 1.6vw, 1.5rem)" }}>
        {quizTitle}
      </p>

      <p className="font-dial text-charcoal/50 mb-[2vh]" style={{ fontSize: "clamp(1rem, 1.8vw, 1.6rem)" }}>
        QUESTION {String(questionNumber).padStart(2, "0")} / {totalQuestions}
      </p>

      {phase === "question" && <PresenterTimer phaseDeadline={phaseDeadline} theme="cream" />}

      <h1
        className="font-display italic text-center mb-[3vh] max-w-[85vw]"
        style={{ fontSize: "clamp(1.6rem, 3.2vw, 3.2rem)", lineHeight: 1.25 }}
      >
        {question.questionText}
      </h1>

      {question.imageUrl && (
        <div className="mb-[3vh] max-h-[28vh] flex items-center justify-center">
          {question.mediaType === "video" ? (
            <video key={question.imageUrl} src={question.imageUrl} autoPlay playsInline controls className="max-h-[28vh] object-contain bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.imageUrl} alt="" className="max-h-[28vh] object-contain" />
          )}
        </div>
      )}

      {phase === "revealed" ? (
        <div className="w-full max-w-[70vw]">
          <ResponseDistributionChart options={question.options} distribution={question.distribution} correctOption={question.correctOption} theme="cream" />
          {question.explanation && (
            <p
              className="text-charcoal/70 text-center mt-[2vh] max-w-[60vw] mx-auto"
              style={{ fontSize: "clamp(0.85rem, 1.3vw, 1.15rem)", lineHeight: 1.5 }}
            >
              {question.explanation}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[1.5vh] w-full max-w-[70vw]">
          {question.options.map((opt) => (
            <div
              key={opt.key}
              className="border border-gold-dim/30 px-[2vw] py-[1.8vh] text-left"
              style={{ fontSize: "clamp(1rem, 1.6vw, 1.6rem)" }}
            >
              <span className="text-gold-dim mr-3">{opt.key}</span>
              {opt.text}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto pt-[2vh] w-full flex items-center justify-center gap-2">
        {Array.from({ length: totalQuestions }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i < questionNumber ? "bg-gold-dim w-6" : "bg-gold-dim/20 w-3"}`}
          />
        ))}
      </div>
    </div>
  );
}
