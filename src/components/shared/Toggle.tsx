"use client";

export default function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-3 border-b border-hairline last:border-b-0"
    >
      <span className="text-ivory text-sm">{label}</span>
      <span
        className={`relative w-10 h-5 transition-colors shrink-0 ${checked ? "bg-gold" : "bg-hairline"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 bg-charcoal transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
