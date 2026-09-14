import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/admin/branding — current logo + certificate org name/subtitle.
export async function GET(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("logo_url, certificate_org_name, certificate_org_subtitle")
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    logoUrl: data?.logo_url ?? null,
    certificateOrgName: data?.certificate_org_name ?? "ILG ACADEMY",
    certificateOrgSubtitle: data?.certificate_org_subtitle ?? "TRAINING & DEVELOPMENT"
  });
}

/**
 * POST /api/admin/branding
 * Body: { logoUrl?, certificateOrgName?, certificateOrgSubtitle? } — send
 * only the fields you're changing; omitted ones are left as they are.
 * Upload the logo file itself to Supabase Storage first, then call this
 * with the resulting public URL. Every page picks it up immediately
 * through the shared header in src/app/layout.tsx — no redeploy needed.
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { logoUrl, certificateOrgName, certificateOrgSubtitle } = await req.json();
  const update: Record<string, unknown> = {};
  if (logoUrl !== undefined) update.logo_url = logoUrl;
  if (certificateOrgName !== undefined) update.certificate_org_name = certificateOrgName || "ILG ACADEMY";
  if (certificateOrgSubtitle !== undefined) update.certificate_org_subtitle = certificateOrgSubtitle || "TRAINING & DEVELOPMENT";

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("app_settings").select("id").limit(1).maybeSingle();

  const { error } = existing
    ? await supabaseAdmin
        .from("app_settings")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    : await supabaseAdmin.from("app_settings").insert(update);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
