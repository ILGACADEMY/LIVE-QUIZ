import Link from "next/link";
import MeridianWordmark from "@/components/shared/MeridianWordmark";

const STEPS = ["ASSESS", "LEARN", "IMPROVE", "MEASURE"];

/**
 * The new public front door — replaces the old root page, which went
 * straight to "Open Admin" with no other option, effectively exposing
 * the admin area as the only thing anyone projecting Meridian on a
 * screen would see. This page is deliberately public/unauthenticated
 * (safe to project as-is) and leads a trainer to /launch rather than
 * /admin directly. The existing admin screen itself is completely
 * untouched — this is only a new entry point in front of it.
 */
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col px-6 py-10 md:px-16">
      <div className="flex justify-end">
        <Link href="/admin" className="text-parchment/30 text-xs tracking-[0.15em] hover:text-gold transition-colors">
          ADMIN
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
        <MeridianWordmark size="large" />

        <h1 className="font-display italic text-ivory mt-10 mb-5 leading-tight" style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.2rem)" }}>
          Turn knowledge into measurable capability.
        </h1>

        <p className="text-parchment/60 max-w-xl mb-14" style={{ fontSize: "clamp(0.95rem, 1.3vw, 1.15rem)" }}>
          An AI-powered assessment, learning and skill intelligence platform that helps teams assess knowledge,
          identify skill gaps, improve capability, and measure progress.
        </p>

        <div className="flex items-center gap-3 md:gap-5 mb-16 flex-wrap justify-center">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3 md:gap-5">
              <span className="text-gold/80 text-xs md:text-sm tracking-[0.2em] font-body font-medium">{step}</span>
              {i < STEPS.length - 1 && <span className="text-parchment/20">→</span>}
            </div>
          ))}
        </div>

        <Link href="/launch" className="btn-gold text-base md:text-lg px-10 py-4 md:px-12 md:py-5">
          Start a Session
        </Link>
      </div>
    </main>
  );
}
