"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Quiz, Question, OptionKey } from "@/lib/types";
import AnswerGrid from "@/components/participant/AnswerGrid";
import CountdownDial from "@/components/participant/CountdownDial";
import { scoreAnswer } from "@/lib/scoring";

export default function QuizPreview({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [locked, setLocked] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [totalScore, setTotalScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; questionScore: number } | null>(null);

  useEffect(() => {
    fetch(`/api/quizzes/${quizId}`)
      .then((r) => r.json())
      .then((data) => {
        setQuiz(data.quiz);
        setQuestions(data.questions ?? []);
      });
  }, [quizId]);

  useEffect(() => {
    if (!quiz || locked) return;
    setStartedAt(Date.now());
    setSecondsLeft(quiz.speed_bonus_window_seconds);
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 0.1));
    }, 100);
    return () => clearInterval(t);
  }, [index, quiz, locked]);

  if (!quiz) return <main className="min-h-screen px-6 py-10 text-parchment/50">Loading preview…</main>;
  if (questions.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-parchment/50">Add at least one question to preview this quiz.</p>
      </main>
    );
  }

  const q = questions[index];

  function handleSelect(key: OptionKey) {
    setSelected(key);
    setLocked(true);
    const elapsedMs = Date.now() - startedAt;
    const result = scoreAnswer({
      selectedOption: key,
      correctOption: q.correct_option,
      elapsedMs,
      scoringMode: quiz!.scoring_mode,
      speedBonusWindowSeconds: quiz!.speed_bonus_window_seconds
    });
    setLastResult(result);
    setTotalScore((s) => s + result.questionScore);

    const advance = () => {
      if (index + 1 >= questions.length) {
        setFinished(true);
      } else {
        setIndex((i) => i + 1);
        setSelected(null);
        setLocked(false);
        setLastResult(null);
      }
    };
    if (quiz!.after_answer_mode === "auto_advance") setTimeout(advance, 1400);
  }

  if (finished) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-gold text-xs tracking-[0.2em] mb-4">PREVIEW COMPLETE</p>
        <p className="font-display italic text-4xl mb-2">{totalScore} points</p>
        <p className="text-parchment/50 mb-8">This is a local simulation for testing — no data was saved.</p>
        <button onClick={() => router.push(`/admin/quizzes/${quizId}/edit`)} className="btn-gold">
          Back to editor
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <p className="text-parchment/50 text-sm whitespace-nowrap">
              Preview — Question {index + 1} of {questions.length}
            </p>
            <select
              value={index}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setSelected(null);
                setLocked(false);
                setLastResult(null);
              }}
              className="field-input text-sm py-1.5 px-2 w-auto"
              title="Jump to a specific question"
            >
              {questions.map((question, i) => (
                <option key={question.id ?? i} value={i}>
                  Q{i + 1}: {(question.question_text || "(Untitled)").slice(0, 40)}
                  {question.question_text && question.question_text.length > 40 ? "…" : ""}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => router.push(`/admin/quizzes/${quizId}/edit`)} className="text-parchment/50 text-sm hover:text-gold whitespace-nowrap">
            Exit preview
          </button>
        </div>

        <div className="flex items-start gap-4 mb-6">
          {quiz.scoring_mode === "speed_bonus" && !locked && (
            <CountdownDial secondsRemaining={secondsLeft} windowSeconds={quiz.speed_bonus_window_seconds} />
          )}
          <p className="font-display italic text-2xl leading-snug">{q.question_text || "(Untitled question)"}</p>
        </div>

        {q.image_url && <img src={q.image_url} alt="" className="w-full max-h-64 object-cover border border-hairline mb-6" />}

        <AnswerGrid
          options={{ A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }}
          selected={selected}
          locked={locked}
          onSelect={handleSelect}
        />

        {locked && (
          <div className="mt-6 case-panel p-5">
            <p className="text-gold font-body font-semibold text-sm mb-1">Answer locked</p>
            <p className="text-xs text-parchment/50 mb-3">
              Preview reveals scoring so you can verify it — participants never see this during a live quiz.
            </p>
            <p className="text-sm">
              {lastResult?.isCorrect ? "Correct" : "Incorrect"} · +{lastResult?.questionScore ?? 0} points
            </p>
            {q.explanation && <p className="text-sm text-parchment/60 mt-2">{q.explanation}</p>}
            {quiz.after_answer_mode === "next_button" && (
              <button
                onClick={() => {
                  if (index + 1 >= questions.length) setFinished(true);
                  else {
                    setIndex((i) => i + 1);
                    setSelected(null);
                    setLocked(false);
                    setLastResult(null);
                  }
                }}
                className="btn-gold mt-4"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
