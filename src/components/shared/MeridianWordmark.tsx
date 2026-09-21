"use client";

/** The "cover" brand mark — used on the join/scan screen, the presenter's
 *  QR panel, and the leaderboard, the places people actually look at
 *  before and during a quiz. Deliberately set in Italiana (see
 *  layout.tsx), a different, more editorial face than the Fraunces
 *  italic used for ordinary headings elsewhere, so it reads as a
 *  standalone wordmark. The thin rule with a center tick is a small
 *  literal nod to the name — a meridian is a line, so the mark gets one.
 *
 *  Meridian now stands on its own as the brand — no per-tenant logo
 *  badge next to the wordmark here anymore. A company's own logo can
 *  still be used elsewhere in the product (certificates, branding
 *  settings); this specific mark is the product's own identity, the
 *  same way any SaaS shows its own name first.
 *
 *  align="left" exists specifically for the QR waiting panel: that
 *  panel's "Scan to join" text and URL sit left-aligned in their own
 *  column, and this mark used to center itself independently of that,
 *  producing a visible mismatch — the logo box floated centered while
 *  everything below it started at the column's left edge. align="left"
 *  makes this row start at that same edge instead. */
export default function MeridianWordmark({ size = "large", align = "center" }: { size?: "large" | "small"; align?: "center" | "left" }) {
  return (
    <div className={`flex flex-col ${align === "left" ? "items-start" : "items-center"}`}>
      <h1
        className={`font-wordmark tracking-[0.08em] text-gold ${
          size === "large" ? "text-6xl md:text-7xl" : "text-3xl"
        }`}
      >
        Meridian
      </h1>
      {size === "large" && (
        <p className={`font-body text-parchment/50 text-sm md:text-base mt-2 ${align === "left" ? "text-left" : "text-center"}`}>
          The reference point you measure your own growth from.
        </p>
      )}
      <div className="flex items-center gap-2 mt-3">
        <span className="h-px w-10 bg-gold/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="h-px w-10 bg-gold/40" />
      </div>
    </div>
  );
}
