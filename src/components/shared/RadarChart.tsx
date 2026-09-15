/** Hand-drawn SVG radar chart, consistent with this app's other charts
 *  (ScoreCircle, ResponseDistributionChart) rather than pulling in a
 *  charting library for one component. Plots one primary shape (gold,
 *  filled) and an optional second comparison shape (muted, dashed
 *  outline only) across the same set of category axes. */
export default function RadarChart({
  categories,
  comparisonValues,
  comparisonLabel,
  selfLabel = "You"
}: {
  categories: { label: string; value: number }[];
  comparisonValues?: number[]; // same order/length as categories, 0-100 scale
  comparisonLabel?: string;
  selfLabel?: string;
}) {
  const size = 260;
  const center = size / 2;
  const maxRadius = size / 2 - 36; // leaves room for outer labels
  const n = categories.length;
  if (n < 3) {
    // A radar needs at least 3 axes to read as a shape rather than a line.
    return <p className="text-parchment/40 text-sm">Not enough categories yet for a shape chart.</p>;
  }

  function pointFor(index: number, value: number) {
    const angle = (index / n) * 2 * Math.PI - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * maxRadius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  }

  function polygonPoints(values: number[]) {
    return values.map((v, i) => pointFor(i, v)).map((p) => `${p.x},${p.y}`).join(" ");
  }

  const selfPoints = polygonPoints(categories.map((c) => c.value));
  const comparisonPoints = comparisonValues ? polygonPoints(comparisonValues) : null;

  // Faint concentric rings at 25/50/75/100% as a reading guide.
  const rings = [25, 50, 75, 100];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]">
        {rings.map((pct) => (
          <polygon
            key={pct}
            points={polygonPoints(categories.map(() => pct))}
            fill="none"
            stroke="#332E27"
            strokeWidth="1"
          />
        ))}
        {categories.map((c, i) => {
          const p = pointFor(i, 100);
          return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#332E27" strokeWidth="1" />;
        })}
        {comparisonPoints && <polygon points={comparisonPoints} fill="none" stroke="#8A8578" strokeWidth="1.5" strokeDasharray="4 3" />}
        <polygon points={selfPoints} fill="#C9A24B" fillOpacity="0.25" stroke="#C9A24B" strokeWidth="2" />
        {categories.map((c, i) => {
          const labelPoint = pointFor(i, 118);
          const anchor = Math.abs(Math.cos((i / n) * 2 * Math.PI - Math.PI / 2)) < 0.3 ? "middle" : labelPoint.x > center ? "start" : "end";
          return (
            <text key={i} x={labelPoint.x} y={labelPoint.y} textAnchor={anchor} dominantBaseline="middle" fontSize="9" fill="#DCD3BF" opacity="0.7">
              {c.label}
            </text>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs text-parchment/60">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#C9A24B" }} />
          {selfLabel}
        </span>
        {comparisonLabel && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed" style={{ borderColor: "#8A8578" }} />
            {comparisonLabel}
          </span>
        )}
      </div>
    </div>
  );
}
