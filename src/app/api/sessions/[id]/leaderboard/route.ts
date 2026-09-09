import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/sessions/:id/leaderboard[?participantId=...][?admin=1][?store=...][?city=...]
//
// Ranks EVERY joined participant by their current total_score, live —
// not just the ones who've finished the whole quiz. This matters in the
// presenter-controlled model: completed_at only ever gets set for
// everyone AT ONCE, at the very last question (see /advance route), so a
// "finished only" filter would make the leaderboard show nothing at all
// for the entire quiz until the last second. Scores are already
// server-authoritative and locked in per-question the moment they're
// scored, so ranking by total_score works correctly at any point — after
// question 1, after question 5, or after the quiz ends, same query, same
// correctness, it just naturally becomes the final result once nobody's
// score can change anymore.
//
// Public callers only ever get the Top 10 plus, if participantId is
// supplied, that one participant's own rank. Filtering by store/city
// works WITHIN that boundary: "Top 10 in Dubai" is still just a top 10,
// never a full list. Only an authenticated admin request gets ranks 11+,
// the score breakdown, and a name search (client-side, over data it
// already has full access to).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const wantsAdmin = req.nextUrl.searchParams.get("admin") === "1";
  const storeFilter = req.nextUrl.searchParams.get("store");
  const cityFilter = req.nextUrl.searchParams.get("city");

  const { data: allJoined, error: joinedError } = await supabaseAdmin
    .from("participants")
    .select("store, city")
    .eq("session_id", params.id);
  if (joinedError) return NextResponse.json({ error: joinedError.message }, { status: 500 });

  const stores = Array.from(new Set(allJoined.map((p) => p.store).filter((v): v is string => !!v))).sort();
  const cities = Array.from(new Set(allJoined.map((p) => p.city).filter((v): v is string => !!v))).sort();

  let query = supabaseAdmin
    .from("participants")
    .select("id, name, avatar, store, city, total_score, base_score, speed_score, completed_at, joined_at")
    .eq("session_id", params.id);
  if (storeFilter) query = query.eq("store", storeFilter);
  if (cityFilter) query = query.eq("city", cityFilter);

  // Highest score first; ties broken by who joined earliest (stable and
  // always present, unlike completed_at which is null for anyone still
  // mid-quiz).
  const { data: rows, error } = await query.order("total_score", { ascending: false }).order("joined_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const completedCount = rows.filter((r) => r.completed_at !== null).length;

  if (wantsAdmin) {
    if (!isAdminRequestAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    score: r.total_score
  }));

  let yourRank: { rank: number; score: number } | null = null;
  if (participantId) {
    const mine = ranked.find((r) => r.id === participantId);
    if (mine) yourRank = { rank: mine.rank, score: mine.total_score };
  }

  return NextResponse.json({
    top10,
    yourRank,
    completedCount,
    totalJoined: rows.length,
    filters: { stores, cities }
  });
}
