"use client";

import { useEffect, useState } from "react";

/**
 * Big, ticking countdown for the presenter's own screen while a question
 * is live — separate from the participant's own per-phone dial, this is
 * what the whole room watches on the projector. Plain and steady above
 * 8 seconds remaining; below that, it switches to a large pulsing
 * number (scale + opacity animate each second) to build real urgency
 * as time runs out, then disappears the moment the phase changes away
 * from "question" (reveal — whether from time running out or everyone
 * having already answered — happens on the server's own schedule, this
 * component only ever displays what's already true).
 */
export default function PresenterTimer({ phaseDeadline }: { phaseDeadline: string | null }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!phaseDeadline) {
      setSecondsLeft(null);
      return;
    }
    const deadline = new Date(phaseDeadline).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [phaseDeadline]);

  if (secondsLeft === null) return null;

  const urgent = secondsLeft <= 8;

  return (
    <div className="flex items-center justify-center py-4">
      <span
        key={urgent ? secondsLeft : "normal"} // remount each urgent tick to restart the CSS animation
        className={
          urgent
            ? "font-dial text-8xl md:text-9xl text-crimson animate-[timerPulse_1s_ease-out]"
            : "font-dial text-4xl text-parchment/70"
        }
      >
        {secondsLeft}
      </span>
    </div>
  );
}
