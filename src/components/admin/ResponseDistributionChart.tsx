"use client";

// Full literal class names, not built with string concatenation — Tailwind's
// build-time scanner only picks up classes it can see written out exactly
// like this in the source; a dynamically-constructed `bg-${variable}` string
// would silently fail to generate the actual CSS and render unstyled.
const BAR_COLOR_CLASSES = ["bg-bronze", "bg-crimson", "bg-sapphire", "bg-verdigris"];

interface Option {
  key: "A" | "B" | "C" | "D";
  text: string;
}
interface DistributionEntry {
  key: "A" | "B" | "C" | "D";
  count: number;
  percent: number;
}

/**
 * Vertical bar chart, animated, for the presenter's own screen. Runs in
 * two modes off the same component:
 *   - Live (correctOption undefined): shown DURING a question, bars
 *     fill in as answers arrive, all in the same neutral jewel-tone
 *     rotation — nothing hints at which one is right yet.
 *   - Revealed (correctOption set): the correct bar's color switches to
 *     gold with a checkmark badge — a genuine "reveal" moment (the color
 *     change animates, same as the height does), rather than just
 *     appending a static label the way a plain list would.
 */
export default function ResponseDistributionChart({ options, distribution, correctOption }: { options: Option[]; distribution?: DistributionEntry[]; correctOption?: "A" | "B" | "C" | "D" }) {
  const counts = options.map((opt) => distribution?.find((d) => d.key === opt.key)?.count ?? 0);
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="flex items-end justify-center gap-6 md:gap-10 h-64 md:h-72 mb-4 px-2">
      {options.map((opt, i) => {
        const dist = distribution?.find((d) => d.key === opt.key);
        const count = dist?.count ?? 0;
        const percent = dist?.percent ?? 0;
        const isCorrect = correctOption === opt.key;
        // A sliver is still shown at 0 votes so every bar (and its label)
        // stays visible and comparable, rather than collapsing to nothing.
        const heightPercent = count > 0 ? Math.max(10, (count / maxCount) * 100) : 4;
        const colorClass = isCorrect ? "bg-gold" : BAR_COLOR_CLASSES[i % BAR_COLOR_CLASSES.length];

        return (
          <div key={opt.key} className="flex flex-col items-center justify-end h-full flex-1 max-w-[220px]">
            <div className="flex items-center gap-2 mb-2">
              <span className={`font-dial text-5xl transition-colors duration-500 ${isCorrect ? "text-gold" : "text-ivory"}`}>{count}</span>
              {isCorrect && (
                <span className="w-8 h-8 rounded-full bg-gold text-charcoal flex items-center justify-center text-lg font-bold shrink-0">
                  ✓
                </span>
              )}
            </div>
            {distribution && <span className="text-parchment/50 text-base mb-2">{percent}%</span>}
            <div className="w-full flex items-end justify-center" style={{ height: "100%" }}>
              <div
                className={`w-full rounded-t-sm transition-all duration-700 ease-out ${colorClass}`}
                style={{ height: `${heightPercent}%` }}
              />
            </div>
            <p className="text-base text-center mt-3 text-parchment/80 leading-snug">
              <span className="text-parchment/50 mr-1.5 font-medium">{opt.key}</span>
              {opt.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
