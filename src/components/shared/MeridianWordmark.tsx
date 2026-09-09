/** The "cover" brand mark — used on the join/scan screen and the
 *  presenter's QR panel, the two places people are looking at before a
 *  quiz starts. Deliberately set in Italiana (see layout.tsx), a
 *  different, more editorial face than the Fraunces italic used for
 *  ordinary headings elsewhere, so it reads as a standalone wordmark. The
 *  thin rule with a center tick is a small literal nod to the name — a
 *  meridian is a line, so the mark gets one. */
export default function MeridianWordmark({ size = "large" }: { size?: "large" | "small" }) {
  return (
    <div className="flex flex-col items-center">
      <h1
        className={`font-wordmark tracking-[0.08em] text-gold ${
          size === "large" ? "text-6xl md:text-7xl" : "text-3xl"
        }`}
      >
        Meridian
      </h1>
      <div className="flex items-center gap-2 mt-3">
        <span className="h-px w-10 bg-gold/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="h-px w-10 bg-gold/40" />
      </div>
    </div>
  );
}
