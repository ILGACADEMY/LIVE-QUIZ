import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/branding — public. Returns just the logo URL, nothing
// sensitive, so participant-facing pages (join, leaderboard) can show it
// without needing an admin session. The admin-only /api/admin/branding
// route is for actually setting it.
export async function GET() {
  const { data } = await supabaseAdmin.from("app_settings").select("logo_url").limit(1).maybeSingle();
  return NextResponse.json({ logoUrl: data?.logo_url ?? null });
}
