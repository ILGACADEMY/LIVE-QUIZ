"use client";

export default function CountdownDial({ secondsRemaining, windowSeconds }: { secondsRemaining: number; windowSeconds: number }) {
  const pct = Math.max(0, Math.min(1, secondsRemaining / windowSeconds));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={radius} fill="none" stroke="#332E27" strokeWidth="3" />
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke={pct < 0.25 ? "#8C3B2E" : "#C9A24B"}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-dial font-bold text-lg">
        {Math.max(0, Math.ceil(secondsRemaining))}
      </div>
    </div>
  );
}
