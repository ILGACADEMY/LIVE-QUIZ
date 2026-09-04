"use client";

export default function CountdownDial({ secondsRemaining, windowSeconds }: { secondsRemaining: number; windowSeconds: number }) {
  const pct = Math.max(0, Math.min(1, secondsRemaining / windowSeconds));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const critical = secondsRemaining <= 5;

  return (
    <div className={`relative w-20 h-20 shrink-0 ${critical ? "animate-ilg-blink" : ""}`}>
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={radius} fill="none" stroke="#332E27" strokeWidth="3" />
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          stroke={critical ? "#8C3B2E" : "#C9A24B"}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s" }}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-dial font-bold text-lg ${critical ? "text-crimson" : ""}`}>
        {Math.max(0, Math.ceil(secondsRemaining))}
      </div>
    </div>
  );
}
