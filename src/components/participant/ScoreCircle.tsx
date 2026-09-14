/** An intentionally imperfect, slightly wobbly circle drawn around a
 *  "correct/total" fraction — the visual reference is a teacher circling
 *  a grade in red pen on a paper test, not a clean geometric badge. The
 *  path below is a hand-plotted loop with uneven curve points (not a
 *  perfect ellipse) specifically so it reads as "drawn," and it overlaps
 *  its own starting point slightly, the way an actual pen stroke would. */
export default function ScoreCircle({ correct, total }: { correct: number; total: number }) {
  return (
    <div className="relative inline-flex items-center justify-center w-32 h-32 md:w-36 md:h-36">
      <svg viewBox="0 0 140 140" className="absolute inset-0 w-full h-full overflow-visible" fill="none">
        <path
          d="M 70 12
             C 95 10, 122 22, 128 48
             C 133 70, 126 96, 104 112
             C 82 128, 48 130, 26 114
             C 8 100, 6 72, 14 50
             C 22 26, 46 14, 68 13
             C 70 13, 72 15, 70 15"
          stroke="#8C3B2E"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-dial text-3xl md:text-4xl text-crimson relative z-10">
        {correct}/{total}
      </span>
    </div>
  );
}
