import "server-only";
import { supabaseAdmin } from "./supabase/server";

function normalizeKey(mobile: string | null, email: string | null): string | null {
  if (mobile) return mobile;
  if (email) return email;
  return null;
}

/**
 * Writes one history row per participant who has a mobile or email on
 * file (the only reliable way to recognize the same person on a future
 * attempt, since there are no user accounts). Called once a session
 * finishes — from both the manual "End quiz" route and the automatic
 * end-of-deck finish, so it fires exactly the same way regardless of how
 * the session ended. A quiz with "Require mobile/email on join" off (the
 * default) simply writes nothing here — there's no reliable identity to
 * key a future comparison on, and the results page falls back to
 * comparing against the pass mark instead.
 */
export async function recordAttemptHistory(sessionId: string): Promise<void> {
  const { data: session } = await supabaseAdmin.from("sessions").select("quiz_id, quiz_snapshot").eq("id", sessionId).single();
  if (!session) return;

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id, name, mobile, email, completed_at")
    .eq("session_id", sessionId)
    .not("completed_at", "is", null);
  if (!participants || participants.length === 0) return;

  const { data: answers } = await supabaseAdmin.from("answers").select("participant_id, question_index, is_correct").eq("session_id", sessionId);

  const questions = session.quiz_snapshot.questions as { category: string | null }[];
  const rows = participants
    .map((p) => {
      const key = normalizeKey(p.mobile, p.email);
      if (!key) return null; // no reliable identity to key a future comparison on

      const own = (answers ?? []).filter((a) => a.participant_id === p.id);
      const categoryTally = own.reduce<Record<string, { category: string; correct: number; total: number }>>((acc, a) => {
        const cat = questions[a.question_index]?.category || "General";
        acc[cat] = acc[cat] || { category: cat, correct: 0, total: 0 };
        acc[cat].total += 1;
        if (a.is_correct) acc[cat].correct += 1;
        return acc;
      }, {});
      const totalCorrect = own.filter((a) => a.is_correct).length;
      const scorePercent = own.length > 0 ? Math.round((totalCorrect / own.length) * 100) : 0;

      return {
        key,
        name: p.name,
        totalCorrect,
        row: {
          quiz_id: session.quiz_id,
          quiz_title: session.quiz_snapshot.quiz.title,
          participant_key: key,
          participant_name: p.name,
          category_breakdown: Object.values(categoryTally),
          score_percent: scorePercent,
          // The participant's OWN completed_at, not now() — this is what
          // lets a later "strictly before this attempt" lookup correctly
          // exclude this very row when the results page for THIS attempt
          // queries its own history a moment later.
          completed_at: p.completed_at
        }
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    await supabaseAdmin.from("quiz_attempt_history").insert(rows.map((r) => r.row));
  }

  // Award XP and update each participant's persistent profile — the
  // same participant_key already computed above, so identity stays
  // consistent between the history record and the profile. A simple,
  // transparent formula for a first version: 10 XP per correct answer,
  // plus a flat 20 for finishing at all, rewarding real learning over
  // time rather than in-session speed (which the leaderboard already
  // rewards separately, within just that one session).
  await Promise.all(
    rows.map(async (r) => {
      const { error } = await supabaseAdmin.rpc("upsert_participant_profile", {
        p_key: r.key,
        p_name: r.name,
        p_xp_earned: r.totalCorrect * 10 + 20
      });
      if (error) console.error("upsert_participant_profile failed:", error.message);
    })
  );
}

/**
 * A participant's persistent profile, for showing "you earned X XP,
 * Y total" on their results page. Null if this quiz didn't collect
 * mobile/email (no reliable identity), or genuinely hasn't finished
 * processing yet (a brief race right at session-end — see the caller
 * in the results route for how that's handled).
 */
export async function getParticipantProfile(participantKey: string | null): Promise<{ xpTotal: number; quizzesCompleted: number } | null> {
  if (!participantKey) return null;
  const { data } = await supabaseAdmin
    .from("participant_profiles")
    .select("xp_total, quizzes_completed")
    .eq("participant_key", participantKey)
    .maybeSingle();
  if (!data) return null;
  return { xpTotal: data.xp_total, quizzesCompleted: data.quizzes_completed };
}

/**
 * The most recent attempt of this same quiz, by this same person, that
 * finished strictly before their current one — for "how did I do last
 * time" on the results page. Null if there isn't one (first attempt, or
 * this quiz never collected mobile/email to match on).
 */
export async function getPreviousAttempt(
  quizId: string | null,
  participantKey: string | null,
  beforeCompletedAt: string
): Promise<{ categoryBreakdown: { category: string; correct: number; total: number }[]; scorePercent: number; completedAt: string } | null> {
  if (!quizId || !participantKey) return null;

  const { data } = await supabaseAdmin
    .from("quiz_attempt_history")
    .select("category_breakdown, score_percent, completed_at")
    .eq("quiz_id", quizId)
    .eq("participant_key", participantKey)
    .lt("completed_at", beforeCompletedAt)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    categoryBreakdown: data.category_breakdown as { category: string; correct: number; total: number }[],
    scorePercent: data.score_percent,
    completedAt: data.completed_at
  };
}
