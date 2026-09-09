import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isSessionControllerRequestAuthorized } from "@/lib/admin-auth";

// GET /api/sessions/:id/leaderboard[?participantId=...][?admin=1][?view=top10|byCity|byStore]
//
// Three views:
//   - "top10" (default): individual ranking — name, icon, total points, AND
//     a correct-count fraction ("3/4") out of the whole quiz's question
//     count. Ranks EVERY joined participant by current total_score, live —
//     not just people who've finished (see the note further down on why).
//   - "byCity" / "byStore": a TEAM ranking, not individuals — each
//     distinct city/store's total points summed across everyone from
//     there, plus how many people contributed, so you can see which
//     city/store is leading overall. No participant names in this view by
//     design — it's meant to answer "which city/store is winning", not
//     "who is winning".
//
// Public callers only ever get the Top 10 (or the full byCity/byStore
// list, which is inherently small — a handful of cities/stores, never
// hundreds of people) plus, for top10, this participant's own rank if
// supplied. Only an authenticated admin request gets ranks 11+ on the
// individual view and per-participant score breakdown.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const wantsAdmin = req.nextUrl.searchParams.get("admin") === "1";
  const view = req.nextUrl.searchParams.get("view") ?? "top10";
  const storeFilter = req.nextUrl.searchParams.get("store");
  const cityFilter = req.nextUrl.searchParams.get("city");

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("quiz_snapshot")
    .eq("id", params.id)
    .single();
  const totalQuestions = session?.quiz_snapshot?.questions?.length ?? 0;

  const { data: allJoined, error: joinedError } = await supabaseAdmin
    .from("participants")
    .select("store, city")
    .eq("session_id", params.id);
  if (joinedError) return NextResponse.json({ error: joinedError.message }, { status: 500 });

  const stores = Array.from(new Set(allJoined.map((p) => p.store).filter((v): v is string => !!v))).sort();
  const cities = Array.from(new Set(allJoined.map((p) => p.city).filter((v): v is string => !!v))).sort();

  // ---------- Team views: aggregate by city or by store ----------
  if (view === "byCity" || view === "byStore") {
    const groupField = view === "byCity" ? "city" : "store";
    const { data: rows, error } = await supabaseAdmin
      .from("participants")
      .select(`${groupField}, total_score`)
      .eq("session_id", params.id)
      .not(groupField, "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const totals = new Map<string, { totalPoints: number; participantCount: number }>();
    for (const r of rows as unknown as { [key: string]: string | number }[]) {
      const key = r[groupField] as string;
      const existing = totals.get(key) ?? { totalPoints: 0, participantCount: 0 };
      existing.totalPoints += r.total_score as number;
      existing.participantCount += 1;
      totals.set(key, existing);
    }

    const teamRanking = Array.from(totals.entries())
      .map(([name, v]) => ({ name, totalPoints: v.totalPoints, participantCount: v.participantCount }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((r, i) => ({ rank: i + 1, ...r }));

    return NextResponse.json({ view, teamRanking, filters: { stores, cities } });
  }

  // ---------- Individual view (top10 / admin full ranking) ----------
  let query = supabaseAdmin
    .from("participants")
    .select("id, name, avatar, store, city, total_score, base_score, speed_score, completed_at, joined_at")
    .eq("session_id", params.id);
  if (storeFilter) query = query.eq("store", storeFilter);
  if (cityFilter) query = query.eq("city", cityFilter);

  // Highest score first; ties broken by who joined earliest (stable and
  // always present, unlike completed_at which is null for anyone still
  // mid-quiz). Scores are already server-authoritative and locked in per
  // question the moment they're scored, so ranking by total_score works
  // correctly at any point in the quiz, not just after it ends.
  const { data: rows, error } = await query.order("total_score", { ascending: false }).order("joined_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const completedCount = rows.filter((r) => r.completed_at !== null).length;

  // Correct-answer counts, one query for everyone in scope rather than
  // one per participant. Session-scoped, so this is at most a few
  // thousand rows even at 500 participants × dozens of questions.
  const participantIds = ranked.map((r) => r.id);
  const correctCountById = new Map<string, number>();
  if (participantIds.length > 0) {
    const { data: answerRows } = await supabaseAdmin
      .from("answers")
      .select("participant_id, is_correct")
      .eq("session_id", params.id)
      .in("participant_id", participantIds);
    (answerRows ?? []).forEach((a) => {
      if (a.is_correct) correctCountById.set(a.participant_id, (correctCountById.get(a.participant_id) ?? 0) + 1);
    });
  }

  if (wantsAdmin) {
    if (!isSessionControllerRequestAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({
      leaderboard: ranked.map((r) => ({
        rank: r.rank,
        name: r.name,
        avatar: r.avatar,
        store: r.store,
        city: r.city,
        totalScore: r.total_score,
        baseScore: r.base_score,
        speedBonus: r.speed_score,
        correctCount: correctCountById.get(r.id) ?? 0,
        totalQuestions,
        completedAt: r.completed_at
      })),
      filters: { stores, cities },
      completedCount,
      totalJoined: rows.length
    });
  }

  const top10 = ranked.slice(0, 10).map((r) => ({
    rank: r.rank,
    name: r.name,
    avatar: r.avatar,
    store: r.store,
    city: r.city,
    score: r.total_score,
    correctCount: correctCountById.get(r.id) ?? 0,
    totalQuestions
  }));

  let yourRank: { rank: number; score: number } | null = null;
  if (participantId) {
    const mine = ranked.find((r) => r.id === participantId);
    if (mine) yourRank = { rank: mine.rank, score: mine.total_score };
  }

  return NextResponse.json({
    view: "top10",
    top10,
    yourRank,
    completedCount,
    totalJoined: rows.length,
    filters: { stores, cities }
  });
}
