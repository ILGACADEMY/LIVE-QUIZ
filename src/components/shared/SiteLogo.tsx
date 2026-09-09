import { supabaseAdmin } from "@/lib/supabase/server";

/** Reads the single app_settings row. Renders nothing if no logo is set
 *  yet — no broken-image placeholder. Wired into the root layout, so this
 *  runs once and covers every single route (join, play, leaderboard,
 *  admin) with zero per-page changes. */
export default async function SiteLogo() {
  const { data } = await supabaseAdmin.from("app_settings").select("logo_url").limit(1).maybeSingle();
  if (!data?.logo_url) return null;

  return (
    <div className="w-full flex justify-center py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.logo_url} alt="" className="h-9 w-auto object-contain" />
    </div>
  );
}
