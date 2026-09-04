import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/sessions/:id/leaderboard[?participantId=...][?admin=1]
// Ranking: highest total_score, then earliest completed_at as the speed
// tie-breaker (fastest finisher + earliest server timestamp in one field,
// spec §27). Public callers only ever get the Top 10 (spec §26) plus,
// if participantId is supplied, that one participant's own rank (spec §28).
// Only an authenticated admin request gets ranks 11+ and the score
// breakdown (spec §29-30).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const wantsAdmin = req.nextUrl.searchParams.get("admin") === "1";

  const { data: rows, error } = await supabaseAdmin
    .from("participants")
    .select("id, name, avatar, total_score, base_score, speed_score, completed_at, joined_at")
    .eq("session_id", params.id)
    .not("completed_at", "is", null)
    .order("total_score", { ascending: false })
    .order("completed_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));

  if (wantsAdmin) {
    if (!isAdminRequestAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({
      leaderboard: ranked.map((r) => ({
        rank: r.rank,
        name: r.name,
        avatar: r.avatar,
        totalScore: r.total_score,
        baseScore: r.base_score,
        speedBonus: r.speed_score,
        completedAt: r.completed_at
      }))
    });
  }

  const top10 = ranked.slice(0, 10).map((r) => ({
    rank: r.rank,
    name: r.name,
    avatar: r.avatar,
    score: r.total_score
  }));

  let yourRank: { rank: number; score: number } | null = null;
  if (participantId) {
    const mine = ranked.find((r) => r.id === participantId);
    if (mine) yourRank = { rank: mine.rank, score: mine.total_score };
  }

  return NextResponse.json({ top10, yourRank, totalCompleted: ranked.length });
}
