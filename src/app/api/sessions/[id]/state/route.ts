import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { LiveSession, PublicQuestion } from "@/lib/types";
import { translateQuestion } from "@/lib/ai";
import { languageName } from "@/lib/languages";
import { broadcastSessionEvent } from "@/lib/realtime";

function toPublicQuestion(session: LiveSession, index: number): PublicQuestion | null {
  const q = session.quiz_snapshot.questions[index];
  if (!q) return null;
  return {
    index,
    question_text: q.question_text,
    image_url: q.image_url,
    media_type: q.media_type ?? "image",
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    category: q.category,
    difficulty: q.difficulty
  };
}

/** Same caching behavior as before — translated once per (session,
 *  question, language), reused for every participant who picks that
 *  language. Media is never translated (nothing to translate about an
 *  image/video), so media_type/image_url just pass through unchanged. */
async function toLocalizedQuestion(session: LiveSession, index: number, language: string): Promise<PublicQuestion | null> {
  const base = toPublicQuestion(session, index);
  // Hard backstop, independent of the join route's own check: even if a
  // participant row somehow has a non-English language stored (e.g. the
  // quiz's translation setting was switched off after they joined), this
  // is what actually prevents any Claude API call — the real place the
  // cost would be incurred.
  if (!base || language === "en" || !session.quiz_snapshot.quiz.translation_enabled) return base;

  const { data: cached } = await supabaseAdmin
    .from("question_translations")
    .select("*")
    .eq("session_id", session.id)
    .eq("question_index", index)
    .eq("language_code", language)
    .maybeSingle();

  if (cached) {
    return { ...base, question_text: cached.question_text, option_a: cached.option_a, option_b: cached.option_b, option_c: cached.option_c, option_d: cached.option_d };
  }

  try {
    const translated = await translateQuestion({
      languageName: languageName(language),
      questionText: base.question_text,
      optionA: base.option_a,
      optionB: base.option_b,
      optionC: base.option_c,
      optionD: base.option_d
    });
    await supabaseAdmin.from("question_translations").upsert(
      {
        session_id: session.id,
        question_index: index,
        language_code: language,
        question_text: translated.question_text,
        option_a: translated.option_a,
        option_b: translated.option_b,
        option_c: translated.option_c,
        option_d: translated.option_d
      },
      { onConflict: "session_id,question_index,language_code" }
    );
    return { ...base, question_text: translated.question_text, option_a: translated.option_a, option_b: translated.option_b, option_c: translated.option_c, option_d: translated.option_d };
  } catch (err) {
    console.error("Translation error, falling back to English:", err);
    return base;
  }
}

/**
 * Self-healing auto-reveal: Vercel Cron can't tick sub-minute, so instead
 * of depending on a background sweep, whichever request notices the
 * current question is ready to reveal flips it right here. Two triggers,
 * either one is enough:
 *   1. The timer ran out (phase_deadline has passed) — checked first
 *      since it's free (just a timestamp comparison, no DB query).
 *   2. Everyone who joined has already answered — checked only if the
 *      timer hasn't expired yet, since that's the only case where this
 *      extra pair of COUNT queries is actually needed. No need to make
 *      everyone wait out a 20-second timer if all 40 people in the room
 *      answered in the first 6 seconds.
 * With the admin dashboard and every participant polling every 2-2.5s,
 * either condition gets caught within a couple of seconds in practice —
 * no cron needed. Returns the (possibly-updated) session.
 */
async function selfHealPhase(session: LiveSession): Promise<LiveSession> {
  const totalQuestions = session.quiz_snapshot.questions.length;
  const isLastQuestion = session.current_question_index + 1 >= totalQuestions;

  // On the LAST question specifically, once it's revealed there's nothing
  // left to advance to — so the quiz finishes automatically rather than
  // waiting for a presenter to click a "Next question" that would just
  // end it anyway. Every other question still waits for that manual
  // click, same as before; this only shortcuts the very last one.
  if (session.phase === "revealed" && isLastQuestion) {
    const endedAt = new Date();
    const deleteAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);

    const { data: updated } = await supabaseAdmin
      .from("sessions")
      .update({ status: "finished", phase: "finished", ended_at: endedAt.toISOString(), delete_at: deleteAt.toISOString(), phase_deadline: null })
      .eq("id", session.id)
      .eq("phase", "revealed") // guards against racing with a presenter's manual click
      .select()
      .single<LiveSession>();

    if (updated) {
      await supabaseAdmin
        .from("participants")
        .update({ completed_at: endedAt.toISOString() })
        .eq("session_id", session.id)
        .is("completed_at", null);
      await broadcastSessionEvent(session.id, "quiz_ended", { deleted: false });
      return updated;
    }
    return session;
  }

  if (session.phase !== "question") return session;

  const deadlinePassed = session.phase_deadline ? new Date(session.phase_deadline).getTime() <= Date.now() : false;

  if (!deadlinePassed) {
    const [{ count: joinedCount }, { count: answeredCount }] = await Promise.all([
      supabaseAdmin.from("participants").select("*", { count: "exact", head: true }).eq("session_id", session.id),
      supabaseAdmin
        .from("answers")
        .select("*", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("question_index", session.current_question_index)
    ]);
    const everyoneAnswered = (joinedCount ?? 0) > 0 && (answeredCount ?? 0) >= (joinedCount ?? 0);
    if (!everyoneAnswered) return session;
  }

  const { data: updated } = await supabaseAdmin
    .from("sessions")
    .update({ phase: "revealed", phase_deadline: null })
    .eq("id", session.id)
    .eq("phase", "question") // guards against racing with a presenter's manual reveal click
    .select()
    .single<LiveSession>();

  if (updated) {
    await broadcastSessionEvent(session.id, "question_revealed", { questionIndex: session.current_question_index });
    return updated;
  }
  return session;
}

// GET /api/sessions/:id/state?participantId=...
// Without participantId → aggregate counters for the admin dashboard and
// the public leaderboard screen (includes answered/pending for whichever
// question is currently live).
// With participantId → that one shared question (or the reveal, or
// waiting/finished), same for everyone, plus this participant's own
// answered/not-yet-answered status for it.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");

  const { data: rawSession, error } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (error || !rawSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const session = await selfHealPhase(rawSession);
  const totalQuestions = session.quiz_snapshot.questions.length;

  if (!participantId) {
    const [{ count: joined }, { count: completed }, { count: answeredForCurrent }] = await Promise.all([
      supabaseAdmin.from("participants").select("*", { count: "exact", head: true }).eq("session_id", params.id),
      supabaseAdmin.from("participants").select("*", { count: "exact", head: true }).eq("session_id", params.id).not("completed_at", "is", null),
      supabaseAdmin
        .from("answers")
        .select("*", { count: "exact", head: true })
        .eq("session_id", params.id)
        .eq("question_index", session.current_question_index)
    ]);

    const joinedCount = joined ?? 0;
    const answered = answeredForCurrent ?? 0;

    // The presenter's own screen — never translated (admin always sees
    // the source content), and unlike the participant response below,
    // this is allowed to include the correct answer and a live response
    // distribution once revealed. Participants only ever get a plain
    // correct/incorrect verdict (see the participant branch further
    // down) — the full answer and explanation live here and on the
    // final results/download page, not on a participant's phone mid-quiz.
    let presenterQuestion: {
      questionText: string;
      imageUrl: string | null;
      mediaType: "image" | "video";
      options: { key: "A" | "B" | "C" | "D"; text: string }[];
      correctOption?: "A" | "B" | "C" | "D";
      explanation?: string;
      distribution?: { key: "A" | "B" | "C" | "D"; count: number; percent: number }[];
    } | null = null;

    const rawQuestion = session.quiz_snapshot.questions[session.current_question_index];
    if (rawQuestion && (session.phase === "question" || session.phase === "revealed")) {
      presenterQuestion = {
        questionText: rawQuestion.question_text,
        imageUrl: rawQuestion.image_url,
        mediaType: rawQuestion.media_type ?? "image",
        options: [
          { key: "A", text: rawQuestion.option_a },
          { key: "B", text: rawQuestion.option_b },
          { key: "C", text: rawQuestion.option_c },
          { key: "D", text: rawQuestion.option_d }
        ]
      };

      if (session.phase === "revealed") {
        const { data: answerRows } = await supabaseAdmin
          .from("answers")
          .select("selected_option")
          .eq("session_id", params.id)
          .eq("question_index", session.current_question_index);

        const tally: Record<"A" | "B" | "C" | "D", number> = { A: 0, B: 0, C: 0, D: 0 };
        (answerRows ?? []).forEach((a) => {
          const key = a.selected_option as "A" | "B" | "C" | "D";
          if (key in tally) tally[key]++;
        });
        const totalAnswers = answerRows?.length ?? 0;

        presenterQuestion.correctOption = rawQuestion.correct_option;
        presenterQuestion.explanation = rawQuestion.explanation;
        presenterQuestion.distribution = (["A", "B", "C", "D"] as const).map((key) => ({
          key,
          count: tally[key],
          percent: totalAnswers > 0 ? Math.round((tally[key] / totalAnswers) * 100) : 0
        }));
      }
    }

    return NextResponse.json({
      status: session.status,
      phase: session.phase,
      quizTitle: session.quiz_snapshot.quiz.title,
      shortCode: session.short_code,
      translationEnabled: session.quiz_snapshot.quiz.translation_enabled,
      questionNumber: session.current_question_index + 1,
      totalQuestions,
      startedAt: session.started_at,
      phaseDeadline: session.phase_deadline,
      question: presenterQuestion,
      counts: {
        joined: joinedCount,
        completed: completed ?? 0,
        // Answered/pending for the CURRENT question specifically — this is
        // what shows as two large numbers on the presenter's live view.
        answered,
        pending: Math.max(0, joinedCount - answered)
      }
    });
  }

  const { data: participant, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", params.id)
    .single();
  if (pError || !participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  // Once a session is finished — whether it reached its last question
  // naturally or the presenter used "End quiz" to stop it early — every
  // participant gets routed to their real results, not a dead end.
  // /end (and /advance on natural completion) both set completed_at for
  // everyone, so this is always meaningful: it reflects whatever they
  // actually answered, even if the quiz didn't run its full length.
  if (session.status === "finished") {
    return NextResponse.json({
      status: "finished",
      phase: "finished",
      totalScore: participant.total_score,
      totalQuestions
    });
  }

  if (session.status !== "live") {
    return NextResponse.json({ status: session.status, phase: "waiting" });
  }

  if (session.phase === "finished") {
    return NextResponse.json({
      status: "live",
      phase: "finished",
      totalScore: participant.total_score,
      totalQuestions
    });
  }

  const index = session.current_question_index;
  const language = participant.language ?? "en";

  const { count: answeredForCurrent } = await supabaseAdmin
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("session_id", params.id)
    .eq("question_index", index);
  const answeredSoFar = answeredForCurrent ?? 0;

  if (session.phase === "question") {
    const { data: ownAnswer } = await supabaseAdmin
      .from("answers")
      .select("id")
      .eq("session_id", params.id)
      .eq("participant_id", participantId)
      .eq("question_index", index)
      .maybeSingle();

    if (ownAnswer) {
      // Already answered this one — waiting for the presenter (or the
      // timer) to reveal, same as everyone else who's answered.
      return NextResponse.json({
        status: "live",
        phase: "locked",
        questionNumber: index + 1,
        totalQuestions,
        answeredSoFar
      });
    }

    const question = await toLocalizedQuestion(session, index, language);
    return NextResponse.json({
      status: "live",
      phase: "question",
      question,
      questionNumber: index + 1,
      totalQuestions,
      questionStartedAt: session.current_question_started_at,
      speedBonusEnabled: session.quiz_snapshot.quiz.scoring_mode === "speed_bonus",
      speedBonusWindowSeconds: session.quiz_snapshot.quiz.speed_bonus_window_seconds,
      questionTimerSeconds: session.quiz_snapshot.quiz.question_timer_seconds ?? 20,
      answeredSoFar,
      deadline: session.phase_deadline ? new Date(session.phase_deadline).getTime() : null
    });
  }

  // phase === 'revealed'
  // Participants get ONLY a correct/incorrect verdict here — no correct
  // answer text, no explanation, no question content at all. The full
  // breakdown (their answer, the correct one, the admin's explanation,
  // and AI feedback if enabled) is available afterward on the results/
  // download page (GET /api/sessions/:id/results), never mid-quiz on a
  // phone. This is also why the question/explanation fields aren't
  // fetched or localized here anymore — nothing to translate if nothing
  // is sent.
  const { data: ownAnswer } = await supabaseAdmin
    .from("answers")
    .select("is_correct")
    .eq("session_id", params.id)
    .eq("participant_id", participantId)
    .eq("question_index", index)
    .maybeSingle();

  return NextResponse.json({
    status: "live",
    phase: "revealed",
    questionNumber: index + 1,
    totalQuestions,
    isCorrect: ownAnswer?.is_correct ?? null, // null = they didn't answer in time
    answeredSoFar
  });
}
