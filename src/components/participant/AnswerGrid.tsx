"use client";

import { OptionKey } from "@/lib/types";

const KEYS: OptionKey[] = ["A", "B", "C", "D"];

export default function AnswerGrid({
  options,
  selected,
  locked,
  onSelect
}: {
  options: { A: string; B: string; C: string; D: string };
  selected: OptionKey | null;
  locked: boolean;
  onSelect: (key: OptionKey) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {KEYS.map((key) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            disabled={locked}
            onClick={() => onSelect(key)}
            className={`flex items-center gap-4 text-left px-5 py-4 border transition-colors ${
              isSelected
                ? "border-gold bg-gold/10"
                : "border-hairline hover:border-gold/40"
            } ${locked && !isSelected ? "opacity-30" : ""} disabled:cursor-default`}
          >
            <span
              className={`shrink-0 w-9 h-9 flex items-center justify-center border font-body font-semibold text-sm ${
                isSelected ? "border-gold text-gold" : "border-hairline text-parchment/60"
              }`}
            >
              {key}
            </span>
            <span className="text-ivory">{options[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
