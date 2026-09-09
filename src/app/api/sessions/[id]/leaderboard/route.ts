import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/sessions/:id/leaderboard[?participantId=...][?admin=1][?store=...][?city=...]
// Ranking: highest total_score, then earliest completed_at as the speed
// tie-breaker. Public callers only ever get the Top 10 plus, if
// participantId is supplied, that one participant's own rank — that
// privacy boundary is unchanged by this update. Filtering by store/city
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

  // Distinct, non-empty values only — this is what populates the filter
  // dropdowns, sourced from everyone who joined (not just finishers), so
  // a store/city shows up as a filter option even before anyone from it
  // has finished.
  const stores = Array.from(new Set(allJoined.map((p) => p.store).filter((v): v is string => !!v))).sort();
  const cities = Array.from(new Set(allJoined.map((p) => p.city).filter((v): v is string => !!v))).sort();

  let query = supabaseAdmin
    .from("participants")
    .select("id, name, avatar, store, city, total_score, base_score, speed_score, completed_at, joined_at")
    .eq("session_id", params.id)
    .not("completed_at", "is", null);
  if (storeFilter) query = query.eq("store", storeFilter);
  if (cityFilter) query = query.eq("city", cityFilter);

  const { data: rows, error } = await query.order("total_score", { ascending: false }).order("completed_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));

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
      filters: { stores, cities }
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

  return NextResponse.json({ top10, yourRank, totalCompleted: ranked.length, filters: { stores, cities } });
}
