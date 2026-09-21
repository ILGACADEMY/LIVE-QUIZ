import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { AdminSession } from "./admin-auth";
import { countScoredQuestions } from "./types";

/**
 * The actual data functions behind the AI Trainer Assistant. Deliberately
 * built as standalone, well-scoped functions rather than inline query
 * logic in the chat route — this is the exact shape an external MCP tool
 * definition would eventually take (a named function, a clear input, a
 * grounded output), so building the assistant this way now means the
 * later "let an external AI agent call these" version is mostly a new
 * transport layer around the same functions, not a rewrite.
 *
 * Every function here is scoped to the calling user's own quizzes (or
 * legacy, ownerless ones — same rule used everywhere else in the app) —
 * never another user's data, regardless of what's asked. A super admin
 * sees everything, same as elsewhere.
 *
 * IMPORTANT: sessions (and their answers) are auto-deleted 24 hours
 * after they finish. Every function here only sees what still exists —
 * it does not and cannot see older history than that, and says so in
 * its own returned data rather than silently going quiet. The one
 * exception is quiz_attempt_history, which deliberately survives that
 * cleanup, but only for quizzes that collect mobile/email.
 */

function ownedQuizFilter(session: AdminSession) {
  return session.role === "super_admin" ? null : session.userId;
}

export async function listMyQuizzes(session: AdminSession) {
  let query = supabaseAdmin.from("quizzes").select("id, title, status, created_at").order("created_at", { ascending: false });
  const ownerId = ownedQuizFilter(session);
  if (ownerId !== null) query = query.or(`owner_id.eq.${ownerId},owner_id.is.null`);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return { quizzes: data };
}

async function assertOwnsQuiz(session: AdminSession, quizId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("quizzes").select("owner_id").eq("id", quizId).maybeSingle();
  if (!data) return false;
  return session.role === "super_admin" || data.owner_id === null || data.owner_id === session.userId;
}

/**
 * Knowledge gaps for one quiz, aggregated from the durable answer_events
 * log — genuinely covers this quiz's full history, not just whatever
 * hasn't been auto-deleted in the last 24 hours. Still genuinely says
 * when there's too little data to conclude anything, rather than
 * presenting a thin sample as a confident finding.
 */
export async function getKnowledgeGaps(session: AdminSession, quizId: string) {
  if (!(await assertOwnsQuiz(session, quizId))) return { error: "That quiz wasn't found, or isn't yours." };

  const { data: events, error } = await supabaseAdmin
    .from("answer_events")
    .select("category, is_correct, answered_at")
    .eq("quiz_id", quizId);
  if (error) return { error: error.message };
  if (!events || events.length === 0) {
    return { note: "No recorded answers for this quiz yet — it may never have been launched, or nobody's answered a question in it." };
  }

  const tally: Record<string, { category: string; correct: number; total: number }> = {};
  for (const e of events) {
    const category = e.category || "General";
    tally[category] = tally[category] || { category, correct: 0, total: 0 };
    tally[category].total += 1;
    if (e.is_correct) tally[category].correct += 1;
  }

  const breakdown = Object.values(tally)
    .map((c) => ({ ...c, percentCorrect: Math.round((c.correct / c.total) * 100) }))
    .sort((a, b) => a.percentCorrect - b.percentCorrect);

  const earliest = events.reduce((min, e) => (e.answered_at < min ? e.answered_at : min), events[0].answered_at);

  return {
    totalAnswers: events.length,
    dataSince: earliest,
    categoryBreakdown: breakdown,
    lowConfidenceWarning:
      events.length < 20 ? "Fewer than 20 total answers recorded so far — treat any pattern here as a hint, not a firm conclusion." : null
  };
}

/**
 * Per-question performance for one quiz, from the durable answer_events
 * log — sorted weakest first. Uses each event's OWN snapshotted question
 * text (captured at answer time), not a live lookup against the current
 * question list, so this stays correct even if a question was later
 * edited, reordered, or replaced.
 */
export async function getQuestionPerformance(session: AdminSession, quizId: string) {
  if (!(await assertOwnsQuiz(session, quizId))) return { error: "That quiz wasn't found, or isn't yours." };

  const { data: quiz } = await supabaseAdmin.from("quizzes").select("title").eq("id", quizId).single();
  const { data: events, error } = await supabaseAdmin
    .from("answer_events")
    .select("question_index, question_text, is_correct, elapsed_ms")
    .eq("quiz_id", quizId);
  if (error) return { error: error.message };
  if (!events || events.length === 0) {
    return { note: "No recorded answers for this quiz yet." };
  }

  const perQuestion: Record<number, { questionText: string; correct: number; total: number; totalMs: number }> = {};
  for (const e of events) {
    const key = e.question_index;
    perQuestion[key] = perQuestion[key] || { questionText: e.question_text ?? `Question ${key + 1}`, correct: 0, total: 0, totalMs: 0 };
    perQuestion[key].total += 1;
    perQuestion[key].totalMs += e.elapsed_ms;
    if (e.is_correct) perQuestion[key].correct += 1;
  }

  const results = Object.entries(perQuestion)
    .map(([idx, q]) => ({
      questionNumber: Number(idx) + 1,
      questionText: q.questionText,
      percentCorrect: Math.round((q.correct / q.total) * 100),
      averageSeconds: Math.round(q.totalMs / q.total / 100) / 10,
      responseCount: q.total
    }))
    .sort((a, b) => a.percentCorrect - b.percentCorrect);

  return { quizTitle: quiz?.title, questions: results };
}

/**
 * Recent sessions of a quiz (or every quiz the user owns, if no quizId
 * is given) with basic completion/score stats — for "how did today's
 * session go" or "how has this quiz been performing lately" questions.
 */
export async function getRecentSessions(session: AdminSession, quizId?: string, limit = 10) {
  let query = supabaseAdmin
    .from("sessions")
    .select("id, quiz_id, status, started_at, ended_at, questions_presented, quiz_snapshot")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (quizId) {
    if (!(await assertOwnsQuiz(session, quizId))) return { error: "That quiz wasn't found, or isn't yours." };
    query = query.eq("quiz_id", quizId);
  } else {
    const ownerId = ownedQuizFilter(session);
    if (ownerId !== null) {
      const { data: myQuizzes } = await supabaseAdmin.from("quizzes").select("id").or(`owner_id.eq.${ownerId},owner_id.is.null`);
      const ids = (myQuizzes ?? []).map((q) => q.id);
      if (ids.length === 0) return { sessions: [] };
      query = query.in("quiz_id", ids);
    }
  }

  const { data: sessions, error } = await query;
  if (error) return { error: error.message };
  if (!sessions || sessions.length === 0) {
    return { sessions: [], note: "No sessions found — either none have been launched, or they've already been auto-deleted 24 hours after finishing." };
  }

  const results = [];
  for (const s of sessions) {
    const { data: participants } = await supabaseAdmin.from("participants").select("base_score").eq("session_id", s.id);
    const total = s.questions_presented ?? (s.quiz_snapshot?.questions ? countScoredQuestions(s.quiz_snapshot.questions) : 0);
    const avgPercent =
      participants && participants.length > 0 && total > 0
        ? Math.round((participants.reduce((sum, p) => sum + p.base_score, 0) / participants.length / total) * 100)
        : null;
    results.push({
      sessionId: s.id,
      quizTitle: s.quiz_snapshot?.quiz?.title,
      status: s.status,
      startedAt: s.started_at,
      participantCount: participants?.length ?? 0,
      averageScorePercent: avgPercent
    });
  }

  return { sessions: results };
}
