"use client";

import { useEffect, useState } from "react";

/** The "cover" brand mark — used on the join/scan screen, the presenter's
 *  QR panel, and the leaderboard, the places people actually look at
 *  before and during a quiz. Deliberately set in Italiana (see
 *  layout.tsx), a different, more editorial face than the Fraunces
 *  italic used for ordinary headings elsewhere, so it reads as a
 *  standalone wordmark. The thin rule with a center tick is a small
 *  literal nod to the name — a meridian is a line, so the mark gets one.
 *
 *  The company logo (if one's been uploaded) now renders directly next
 *  to this wordmark, not as a separate tiny strip pinned above every
 *  page — that older placement was too small and easy to miss, and ate
 *  vertical space on screens where every inch matters (a 16:9 presenter
 *  view, a phone's join screen). This fetches from the public /api/branding
 *  endpoint once on mount since this is a client component used inside
 *  other client pages (the join screen, the live presenter dashboard) —
 *  it can't be an async server component the way a page-level layout
 *  element could be. */
export default function MeridianWordmark({ size = "large" }: { size?: "large" | "small" }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then((data) => setLogoUrl(data.logoUrl ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-4">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className={size === "large" ? "h-16 md:h-20 w-auto object-contain" : "h-9 w-auto object-contain"}
          />
        )}
        <h1
          className={`font-wordmark tracking-[0.08em] text-gold ${
            size === "large" ? "text-6xl md:text-7xl" : "text-3xl"
          }`}
        >
          Meridian
        </h1>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="h-px w-10 bg-gold/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="h-px w-10 bg-gold/40" />
      </div>
    </div>
  );
}
