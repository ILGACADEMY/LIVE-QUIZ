"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OptionKey } from "@/lib/types";
import AnswerGrid from "@/components/participant/AnswerGrid";
import CountdownDial from "@/components/participant/CountdownDial";
import { supabaseBrowser } from "@/lib/supabase/client";

type Phase = "loading" | "waiting" | "countdown" | "question" | "locked" | "finished" | "ended" | "error";

interface QuestionState {
  question: { index: number; question_text: string; image_url: string | null; option_a: string; option_b: string; option_c: string; option_d: string };
  questionNumber: number;
  totalQuestions: number;
  questionStartedAt: string;
  speedBonusEnabled: boolean;
  speedBonusWindowSeconds: number;
  afterAnswerMode: "auto_advance" | "next_button";
  answeredSoFar: number;
  deadline: number | null;
}

export default function PlayPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🦉");
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [q, setQ] = useState<QuestionState | null>(null);
  const [selected, setSelected] = useState<OptionKey | null>(null);
  const [dialSeconds, setDialSeconds] = useState(0);
  const [answeredSoFar, setAnsweredSoFar] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startsAtRef = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    if (!participantId) return;
    const res = await fetch(`/api/sessions/${params.sessionId}/state?participantId=${participantId}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === "finished" && data.phase !== "finished") {
      setPhase("ended");
      return;
    }
    if (data.phase === "finished" || data.totalScore !== undefined) {
      setPhase("finished");
      return;
    }
    if (data.phase === "waiting") {
      setPhase((p) => (p === "countdown" ? p : "waiting"));
      return;
    }
    if (data.phase === "question") {
      setQ(data);
      setAnsweredSoFar(data.answeredSoFar);
      setSelected(null);
      setPhase("question");
    }
  }, [participantId, params.sessionId]);

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

  // Waiting room: poll as a fallback, and listen for the synced start broadcast.
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
      .on("broadcast", { event: "quiz_ended" }, () => setPhase("ended"))
      .on("broadcast", { event: "answer_count" }, (msg) => {
        const payload = msg.payload as { questionIndex?: number; answered?: number };
        if (q && payload.questionIndex === q.question.index && typeof payload.answered === "number") {
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

  // Visual speed-bonus dial, ticking down locally from the server-reported start time.
  useEffect(() => {
    if (phase !== "question" || !q?.speedBonusEnabled) return;
    const started = new Date(q.questionStartedAt).getTime();
    const tick = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      setDialSeconds(Math.max(0, q.speedBonusWindowSeconds - elapsed));
    }, 100);
    return () => clearInterval(tick);
  }, [phase, q]);

  async function handleSelect(key: OptionKey) {
    if (!q || !participantId) return;
    setSelected(key);
    setPhase("locked");
    setErrorMsg(null);

    const res = await fetch(`/api/sessions/${params.sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, questionIndex: q.question.index, selectedOption: key })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error ?? "Could not submit your answer.");
      fetchState();
      return;
    }

    const { isLastQuestion } = await res.json();
    if (q.afterAnswerMode === "auto_advance") {
      setTimeout(fetchState, 1000);
    } else if (isLastQuestion) {
      setTimeout(fetchState, 300);
    }
  }

  if (phase === "loading" || phase === "waiting") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-gold text-xs tracking-[0.2em] mb-4">YOU&rsquo;RE IN</p>
        <div className="w-16 h-16 flex items-center justify-center text-3xl border border-hairline mb-4">{avatar}</div>
        <p className="font-display italic text-3xl mb-3">{name || "Welcome"}</p>
        <p className="text-parchment/50">Waiting for the instructor to start…</p>
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
    return <FinishedScreen sessionId={params.sessionId} participantId={participantId!} />;
  }

  if ((phase === "question" || phase === "locked") && q) {
    return (
      <main className="min-h-screen px-6 py-10 flex flex-col items-center">
        <div className="w-full max-w-lg">
          <div className="flex items-center justify-between mb-6 text-sm text-parchment/50">
            <span>
              Question {q.questionNumber} of {q.totalQuestions}
            </span>
            <span className="font-dial">{answeredSoFar} answered</span>
          </div>

          <div className="flex items-start gap-4 mb-6">
            {q.speedBonusEnabled && phase === "question" && (
              <CountdownDial secondsRemaining={dialSeconds} windowSeconds={q.speedBonusWindowSeconds} />
            )}
            <p className="font-display italic text-2xl leading-snug">{q.question.question_text}</p>
          </div>

          {q.question.image_url && (
            <img src={q.question.image_url} alt="" className="w-full max-h-64 object-cover border border-hairline mb-6" />
          )}

          <AnswerGrid
            options={{ A: q.question.option_a, B: q.question.option_b, C: q.question.option_c, D: q.question.option_d }}
            selected={selected}
            locked={phase === "locked"}
            onSelect={handleSelect}
          />

          {phase === "locked" && !errorMsg && (
            <div className="mt-6 text-center">
              <p className="text-gold font-body font-semibold tracking-wide">ANSWER LOCKED</p>
              <p className="text-parchment/40 text-xs mt-1 font-dial">{answeredSoFar} answered</p>
            </div>
          )}
          {errorMsg && <p className="text-crimson text-sm mt-6 text-center">{errorMsg}</p>}
        </div>
      </main>
    );
  }

  return <main className="min-h-screen flex items-center justify-center text-parchment/50">Something went wrong.</main>;
}

function FinishedScreen({ sessionId, participantId }: { sessionId: string; participantId: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-gold text-xs tracking-[0.2em] mb-4">QUIZ COMPLETE</p>
      <p className="font-display italic text-2xl mb-8">Nice work — here are your results.</p>
      <a href={`/play/${sessionId}/results?participantId=${participantId}`} className="btn-gold">
        View my results
      </a>
    </main>
  );
}
