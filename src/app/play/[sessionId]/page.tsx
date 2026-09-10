"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OptionKey } from "@/lib/types";
import AnswerGrid from "@/components/participant/AnswerGrid";
import CountdownDial from "@/components/participant/CountdownDial";
import { supabaseBrowser } from "@/lib/supabase/client";

type Phase = "loading" | "waiting" | "countdown" | "question" | "locked" | "revealed" | "finished" | "ended" | "error";

interface QuestionState {
  question: {
    index: number;
    question_text: string;
    image_url: string | null;
    media_type?: "image" | "video";
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
  };
  questionNumber: number;
  totalQuestions: number;
  questionStartedAt: string;
  speedBonusEnabled: boolean;
  speedBonusWindowSeconds: number;
  questionTimerSeconds: number;
  answeredSoFar: number;
  deadline: number | null;
}

interface RevealState {
  questionNumber: number;
  totalQuestions: number;
  isCorrect: boolean | null; // null = they didn't answer in time
}

export default function PlayPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🦉");
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [q, setQ] = useState<QuestionState | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [dialSeconds, setDialSeconds] = useState(0);
  const [answeredSoFar, setAnsweredSoFar] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [waitingInfo, setWaitingInfo] = useState<{
    quizTitle: string;
    totalQuestions: number;
    scoringMode: "standard" | "speed_bonus";
    passMarkPercent: number;
    questionTimerSeconds: number;
  } | null>(null);
  const startsAtRef = useRef<number | null>(null);
  const submittingRef = useRef(false);

  const fetchState = useCallback(async () => {
    if (!participantId) return;
    // Don't let a background refresh overwrite the screen while an answer
    // submission is still in flight — see handleSelect below for why this
    // matters. Without this guard, tapping an answer right as a routine
    // poll fires could revert the screen back to the question (the
    // server hadn't recorded the answer yet when that poll ran), or on
    // the reveal itself, briefly show "Time's up" before flipping to
    // "Correct!" once the answer catches up.
    if (submittingRef.current) return;
    const res = await fetch(`/api/sessions/${params.sessionId}/state?participantId=${participantId}`);
    if (!res.ok) return;
    const data = await res.json();
    // Second check, after the network round trip: a poll that was
    // already in flight when the user tapped an answer (started before
    // submittingRef was set) would pass the earlier check but still
    // resolve with stale data afterward — this catches that case too.
    if (submittingRef.current) return;

    if (data.phase === "ended") {
      setPhase("ended");
      return;
    }
    if (data.phase === "finished") {
      setPhase("finished");
      return;
    }
    if (data.phase === "waiting") {
      setWaitingInfo({
        quizTitle: data.quizTitle,
        totalQuestions: data.totalQuestions,
        scoringMode: data.scoringMode,
        passMarkPercent: data.passMarkPercent,
        questionTimerSeconds: data.questionTimerSeconds
      });
      setPhase((p) => (p === "countdown" ? p : "waiting"));
      return;
    }
    if (data.phase === "locked") {
      setAnsweredSoFar(data.answeredSoFar);
      setPhase("locked");
      return;
    }
    if (data.phase === "question") {
      // Fallback for anyone who catches this via the regular poll instead
      // of the question_advanced broadcast (a missed/delayed broadcast,
      // or a client that just reconnected): if the server says this
      // question hasn't actually started yet, show the same local 3-2-1
      // rather than the question itself — the countdown effect below
      // will re-check and reveal it right on schedule.
      const startsAt = new Date(data.questionStartedAt).getTime();
      if (startsAt > Date.now() + 250) {
        startsAtRef.current = startsAt;
        setPhase("countdown");
        return;
      }
      setQ(data);
      setAnsweredSoFar(data.answeredSoFar);
      setSelected(null);
      setReveal(null);
      setPhase("question");
      return;
    }
    if (data.phase === "revealed") {
      setReveal(data);
      setPhase("revealed");
      return;
    }
  }, [participantId, params.sessionId]);

  // Skip the "Nice work, tap to view results" middle step entirely — go
  // straight to the results page the moment the quiz finishes. That
  // intermediate screen never showed the score itself, which is very
  // likely why "no score on my phone" was reported: it required an extra
  // tap to a link that's easy to miss on a small screen.
  useEffect(() => {
    if (phase === "finished" && participantId) {
      router.replace(`/play/${params.sessionId}/results?participantId=${participantId}`);
    }
  }, [phase, participantId, params.sessionId, router]);

  // Load participant identity from the join step.
  useEffect(() => {
    const raw = sessionStorage.getItem(`ilg-quiz-${params.sessionId}`);
    if (!raw) {
      router.replace(`/join/${params.sessionId}`);
      return;
    }
    const parsed = JSON.parse(raw);
    setParticipantId(parsed.participantId);
    setName(parsed.name);
    if (parsed.avatar) setAvatar(parsed.avatar);
  }, [params.sessionId, router]);

  // Poll as a fallback, and listen for the presenter's broadcasts for
  // instant transitions — question started, revealed, or advanced, plus
  // the live answer count. One question is shared by the whole room, so
  // every one of these broadcasts is relevant to every participant.
  useEffect(() => {
    if (!participantId) return;
    fetchState();
    const poll = setInterval(fetchState, 2500);

    const channel = supabaseBrowser
      .channel(`session:${params.sessionId}`)
      .on("broadcast", { event: "quiz_started" }, (msg) => {
        startsAtRef.current = new Date((msg.payload as { startsAt: string }).startsAt).getTime();
        setPhase("countdown");
      })
      .on("broadcast", { event: "quiz_ended" }, () => fetchState())
      .on("broadcast", { event: "question_revealed" }, () => fetchState())
      .on("broadcast", { event: "question_advanced" }, (msg) => {
        // Same 3-2-1 treatment as the very first question, not just a
        // one-time opener — reuses the exact same countdown effect
        // below, which already calls fetchState() the moment the shared
        // start time arrives, so the actual question reveals itself
        // right on schedule without any extra code here.
        const payload = msg.payload as { startsAt?: string };
        if (payload.startsAt) {
          startsAtRef.current = new Date(payload.startsAt).getTime();
          setPhase("countdown");
        } else {
          fetchState();
        }
      })
      .on("broadcast", { event: "answer_count" }, (msg) => {
        const payload = msg.payload as { questionIndex?: number; answered?: number; type?: string; joined?: number };
        if (payload.type === "joined") {
          // Join-count broadcasts are for the presenter's dashboard and QR
          // panel only — participants don't need to see this, so it's
          // intentionally ignored here.
          return;
        }
        const currentIndex = q?.question.index ?? (reveal ? reveal.questionNumber - 1 : undefined);
        if (currentIndex === payload.questionIndex && typeof payload.answered === "number") {
          setAnsweredSoFar(payload.answered);
        }
      })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabaseBrowser.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, params.sessionId, fetchState]);

  // Countdown ticking, synced to server startsAt.
  useEffect(() => {
    if (phase !== "countdown") return;
    const tick = setInterval(() => {
      if (!startsAtRef.current) return;
      const remaining = Math.ceil((startsAtRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(tick);
        fetchState();
      } else {
        setCountdownSeconds(remaining);
      }
    }, 150);
    return () => clearInterval(tick);
  }, [phase, fetchState]);

  // Visual countdown dial, ticking down locally from the server-reported
  // start time — this now always runs (question_timer_seconds applies to
  // every scoring mode), not only when the speed bonus is enabled.
  useEffect(() => {
    if (phase !== "question" || !q) return;
    const started = new Date(q.questionStartedAt).getTime();
    const windowSeconds = q.questionTimerSeconds ?? q.speedBonusWindowSeconds ?? 20;
    const tick = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      setDialSeconds(Math.max(0, windowSeconds - elapsed));
    }, 100);
    return () => clearInterval(tick);
  }, [phase, q]);

  async function handleSelect(key: OptionKey) {
    if (!q || !participantId) return;
    setSelected(key);
    setPhase("locked");
    setErrorMsg(null);
    submittingRef.current = true;

    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, questionIndex: q.question.index, selectedOption: key })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Could not submit your answer.");
        return;
      }
      // No self-advance here — everyone waits together for the presenter to
      // reveal (or the timer to run out), which arrives via the
      // question_revealed broadcast above.
    } finally {
      submittingRef.current = false;
      // One authoritative re-sync now that the submission has actually
      // settled — covers the case where the question was already revealed
      // (by the timer or by everyone else answering) while this request
      // was in flight, so the reveal shown reflects the real, now-committed
      // answer rather than a moment where it looked unanswered.
      fetchState();
    }
  }

  if (phase === "loading" || phase === "waiting") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-gold text-xs tracking-[0.2em] mb-4">YOU&rsquo;RE IN</p>
        <div className="w-16 h-16 flex items-center justify-center text-3xl border border-hairline mb-4">{avatar}</div>
        <p className="font-display italic text-3xl mb-3">{name || "Welcome"}</p>
        <p className="text-parchment/50 mb-6">Waiting for the instructor to start…</p>

        {waitingInfo && (
          <div className="case-panel p-5 max-w-xs text-left">
            <p className="field-label mb-3 text-center">How scoring works</p>
            <p className="text-sm text-parchment/70 leading-relaxed mb-2">
              {waitingInfo.totalQuestions} question{waitingInfo.totalQuestions !== 1 ? "s" : ""}, {waitingInfo.questionTimerSeconds}s each.{" "}
              {waitingInfo.scoringMode === "speed_bonus"
                ? "Answer correctly AND quickly for bonus points — the faster a correct answer, the more it's worth."
                : "Each correct answer earns points — no rush, just answer before time runs out."}
            </p>
            <p className="text-sm text-parchment/50">Pass mark: {waitingInfo.passMarkPercent}%</p>
          </div>
        )}
      </main>
    );
  }

  if (phase === "countdown") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="font-dial text-8xl text-gold">{Math.max(countdownSeconds, 1)}</p>
      </main>
    );
  }

  if (phase === "ended") {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-parchment/50">This session has ended.</p>
      </main>
    );
  }

  if (phase === "finished") {
    return <main className="min-h-screen flex items-center justify-center text-parchment/50">Loading your results…</main>;
  }

  if (phase === "locked") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-gold font-body font-semibold tracking-wide mb-4">Answer locked</p>
        <p className="text-parchment/50 text-sm">Waiting for the instructor to reveal the answer…</p>
      </main>
    );
  }

  if (phase === "revealed" && reveal) {
    return (
      <main className="min-h-screen px-6 py-10 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg text-center">
          <p className="text-parchment/40 text-xs mb-6">
            Question {reveal.questionNumber} of {reveal.totalQuestions}
          </p>

          {/* Correct/incorrect only — no answer text, no explanation, no
              question content at all. The full breakdown (their answer,
              the correct one, the explanation, and AI feedback if
              enabled) shows up later on the results/download page, not
              here mid-quiz. The presenter's own screen shows the full
              reveal and response distribution live. */}
          {reveal.isCorrect === true && <p className="text-gold font-display italic text-5xl mb-4">Correct!</p>}
          {reveal.isCorrect === false && <p className="text-crimson font-display italic text-5xl mb-4">Not quite</p>}
          {reveal.isCorrect === null && <p className="text-parchment/60 font-display italic text-5xl mb-4">Time's up</p>}

          <p className="text-parchment/40 text-xs mt-6">Waiting for the instructor to continue…</p>
        </div>
      </main>
    );
  }

  if (phase === "question" && q) {
    return (
      <main className="min-h-screen px-6 py-10 flex flex-col items-center">
        <div className="w-full max-w-lg">
          <div className="flex items-center justify-between mb-6 text-sm text-parchment/50">
            <span>
              Question {q.questionNumber} of {q.totalQuestions}
            </span>
          </div>

          <div className="flex items-start gap-4 mb-6">
            <CountdownDial secondsRemaining={dialSeconds} windowSeconds={q.questionTimerSeconds ?? q.speedBonusWindowSeconds} />
            <p className="font-display italic text-2xl leading-snug">{q.question.question_text}</p>
          </div>

          {q.question.image_url && q.question.media_type === "video" ? (
            <video
              src={q.question.image_url}
              controls
              playsInline
              className="w-full max-h-64 object-contain bg-black border border-hairline mb-6"
            />
          ) : (
            q.question.image_url && (
              <img src={q.question.image_url} alt="" className="w-full max-h-64 object-cover border border-hairline mb-6" />
            )
          )}

          <AnswerGrid
            options={{ A: q.question.option_a, B: q.question.option_b, C: q.question.option_c, D: q.question.option_d }}
            selected={selected}
            locked={false}
            onSelect={handleSelect}
          />

          {errorMsg && <p className="text-crimson text-sm mt-6 text-center">{errorMsg}</p>}
        </div>
      </main>
    );
  }

  return <main className="min-h-screen flex items-center justify-center text-parchment/50">Something went wrong.</main>;
}
