import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/sessions/cleanup
// Purges sessions past their delete_at (spec §35). Prefer pg_cron inside
// Supabase (see supabase/schema.sql) — this route exists as a fallback for
// Supabase plans without pg_cron, to be hit by an external scheduler
// (Vercel Cron, GitHub Actions cron, cron-job.org, ...) roughly hourly.
// Protect it with a shared secret so it can't be triggered by anyone else.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cleanup-secret");
  if (!secret || secret !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.rpc("cleanup_expired_sessions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
