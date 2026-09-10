import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/admin/branding — current logo URL, if any set.
export async function GET(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin.from("app_settings").select("logo_url").limit(1).maybeSingle();
  return NextResponse.json({ logoUrl: data?.logo_url ?? null });
}

/**
 * POST /api/admin/branding
 * Body: { logoUrl: string }
 * Upload the logo file itself to Supabase Storage first (e.g. reuse the
 * quiz-images bucket, or make a dedicated 'branding' bucket), then call
 * this with the resulting public URL. Every page picks it up immediately
 * through the shared header in src/app/layout.tsx — no redeploy needed.
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { logoUrl } = await req.json();
  if (!logoUrl || typeof logoUrl !== "string") {
    return NextResponse.json({ error: "logoUrl is required." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("app_settings").select("id").limit(1).maybeSingle();

  const { error } = existing
    ? await supabaseAdmin
        .from("app_settings")
        .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    : await supabaseAdmin.from("app_settings").insert({ logo_url: logoUrl });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
