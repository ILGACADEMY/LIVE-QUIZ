import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/admin/branding
export async function GET(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("logo_url, certificate_org_name, certificate_org_subtitle, certificate_location, certificate_background_url")
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    logoUrl: data?.logo_url ?? null,
    certificateOrgName: data?.certificate_org_name ?? "ILG ACADEMY",
    certificateOrgSubtitle: data?.certificate_org_subtitle ?? "TRAINING & DEVELOPMENT",
    certificateLocation: data?.certificate_location ?? "",
    certificateBackgroundUrl: data?.certificate_background_url ?? null
  });
}

/**
 * POST /api/admin/branding
 * Body: { logoUrl?, certificateOrgName?, certificateOrgSubtitle?,
 *         certificateLocation?, certificateBackgroundUrl? } — send only
 * the fields you're changing; omitted ones are left as they are. Upload
 * a file to Storage first, then call this with the resulting public
 * URL — same pattern for the logo and the certificate background.
 * certificateBackgroundUrl set to an empty string clears it (falls back
 * to the built-in drawn certificate layout).
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { logoUrl, certificateOrgName, certificateOrgSubtitle, certificateLocation, certificateBackgroundUrl } = await req.json();
  const update: Record<string, unknown> = {};
  if (logoUrl !== undefined) update.logo_url = logoUrl;
  if (certificateOrgName !== undefined) update.certificate_org_name = certificateOrgName || "ILG ACADEMY";
  if (certificateOrgSubtitle !== undefined) update.certificate_org_subtitle = certificateOrgSubtitle || "TRAINING & DEVELOPMENT";
  if (certificateLocation !== undefined) update.certificate_location = certificateLocation || null;
  if (certificateBackgroundUrl !== undefined) update.certificate_background_url = certificateBackgroundUrl || null;

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
