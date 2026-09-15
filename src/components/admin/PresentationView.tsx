"use client";

import PresenterTimer from "@/components/admin/PresenterTimer";
import ResponseDistributionChart from "@/components/admin/ResponseDistributionChart";

interface PresentationQuestion {
  questionText: string;
  imageUrl: string | null;
  mediaType: "image" | "video";
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
  correctOption?: "A" | "B" | "C" | "D";
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
 */
export default function PresentationView({
  quizTitle,
  questionNumber,
  totalQuestions,
  question,
  phase,
  phaseDeadline
}: {
  quizTitle: string;
  questionNumber: number;
  totalQuestions: number;
  question: PresentationQuestion;
  phase: "question" | "revealed";
  phaseDeadline: string | null;
}) {
  return (
    <div className="fixed inset-0 bg-charcoal flex flex-col items-center px-[4vw] py-[3vh] overflow-hidden">
      <p className="text-gold tracking-[0.3em]" style={{ fontSize: "clamp(0.8rem, 1.2vw, 1.1rem)" }}>
        ILG&nbsp;|&nbsp;ACADEMY
      </p>
      <p className="text-parchment/60 mt-1 mb-[2vh] text-center" style={{ fontSize: "clamp(1rem, 1.6vw, 1.5rem)" }}>
        {quizTitle}
      </p>

      <p className="font-dial text-parchment/50 mb-[2vh]" style={{ fontSize: "clamp(1rem, 1.8vw, 1.6rem)" }}>
        QUESTION {String(questionNumber).padStart(2, "0")} / {totalQuestions}
      </p>

      {phase === "question" && <PresenterTimer phaseDeadline={phaseDeadline} />}

      <h1
        className="font-display italic text-center mb-[3vh] max-w-[85vw]"
        style={{ fontSize: "clamp(1.6rem, 3.2vw, 3.2rem)", lineHeight: 1.25 }}
      >
        {question.questionText}
      </h1>

      {question.imageUrl && (
        <div className="mb-[3vh] max-h-[28vh] flex items-center justify-center">
          {question.mediaType === "video" ? (
            <video src={question.imageUrl} controls className="max-h-[28vh] object-contain bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.imageUrl} alt="" className="max-h-[28vh] object-contain" />
          )}
        </div>
      )}

      {phase === "revealed" ? (
        <div className="w-full max-w-[70vw]">
          <ResponseDistributionChart options={question.options} distribution={question.distribution} correctOption={question.correctOption} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[1.5vh] w-full max-w-[70vw]">
          {question.options.map((opt) => (
            <div
              key={opt.key}
              className="border border-hairline px-[2vw] py-[1.8vh] text-left"
              style={{ fontSize: "clamp(1rem, 1.6vw, 1.6rem)" }}
            >
              <span className="text-gold mr-3">{opt.key}</span>
              {opt.text}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto pt-[2vh] w-full flex items-center justify-center gap-2">
        {Array.from({ length: totalQuestions }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i < questionNumber ? "bg-gold w-6" : "bg-hairline w-3"}`}
          />
        ))}
      </div>
    </div>
  );
}
