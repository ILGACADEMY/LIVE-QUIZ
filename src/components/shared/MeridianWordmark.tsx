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
 *  The company logo (if one's been uploaded) renders directly next to
 *  this wordmark rather than as a separate tiny strip pinned above every
 *  page. This fetches from the public /api/branding endpoint once on
 *  mount since this is a client component used inside other client pages
 *  (the join screen, the live presenter dashboard) — it can't be an
 *  async server component the way a page-level layout element could be.
 *
 *  align="left" exists specifically for the QR waiting panel: that
 *  panel's "Scan to join" text and URL sit left-aligned in their own
 *  column, and this mark used to center itself independently of that,
 *  producing a visible mismatch — the logo box floated centered while
 *  everything below it started at the column's left edge. align="left"
 *  makes this row start at that same edge instead. */
export default function MeridianWordmark({ size = "large", align = "center" }: { size?: "large" | "small"; align?: "center" | "left" }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then((data) => setLogoUrl(data.logoUrl ?? null))
      .catch(() => {});
  }, []);

  const boxSize = size === "large" ? "w-32 h-32 md:w-36 md:h-36" : "w-14 h-14";

  return (
    <div className={`flex flex-col ${align === "left" ? "items-start" : "items-center"}`}>
      <div className="flex items-center gap-5">
        {logoUrl && (
          <>
            {/* A light chip behind the logo, sized as a defined box (not
                just "however big the image happens to be") so the image
                inside it can be sized to a specific fill ratio — 80% of
                the box, not floating with a lot of empty margin around
                a small logo. The background itself is what gives any
                uploaded logo real contrast against the dark page,
                regardless of the source image's own background. */}
            <div className={`bg-ivory rounded-sm shadow-lg flex items-center justify-center ${boxSize}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="w-[80%] h-[80%] object-contain" />
            </div>
            {/* Divider between logo and wordmark — the visual partition
                reading as [ LOGO ] | [ MERIDIAN ], subtle and matching
                the app's own gold-on-dark language rather than looking
                like a leftover default border. */}
            <span className={size === "large" ? "w-px h-20 md:h-24 bg-gold/30" : "w-px h-10 bg-gold/30"} />
          </>
        )}
        <h1
          className={`font-wordmark tracking-[0.08em] text-gold ${
            size === "large" ? "text-6xl md:text-7xl" : "text-3xl"
          }`}
        >
          Meridian
        </h1>
      </div>
      <div className={`flex items-center gap-2 mt-3 ${align === "left" ? "" : ""}`}>
        <span className="h-px w-10 bg-gold/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="h-px w-10 bg-gold/40" />
      </div>
    </div>
  );
}
