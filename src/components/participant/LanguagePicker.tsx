"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SUPPORTED_LANGUAGES, Language } from "@/lib/languages";

/** Type-to-filter language picker, replacing a plain <select> that was
 *  genuinely painful to scroll through with 61 options — especially on
 *  a phone, which is how virtually everyone reaches the join screen.
 *  Matches against both the English name and the native-script name, so
 *  typing "Hindi" or "हिन्दी" both find the same entry. */
export default function LanguagePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = SUPPORTED_LANGUAGES.find((l) => l.code === value);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter((l) => l.label.toLowerCase().includes(q) || l.nativeLabel.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function select(l: Language) {
    onChange(l.code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="field-input flex items-center justify-between text-left"
      >
        <span>{selected?.nativeLabel ?? "Select a language"}</span>
        <span className="text-parchment/40 text-xs ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full case-panel bg-charcoal border border-hairline max-h-64 overflow-hidden flex flex-col">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search languages…"
            className="field-input border-0 border-b border-hairline rounded-none"
          />
          <div className="overflow-y-auto">
            {results.length === 0 && <p className="p-3 text-parchment/40 text-sm">No languages match "{query}".</p>}
            {results.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => select(l)}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-hairline/40 ${l.code === value ? "text-gold" : "text-ivory"}`}
              >
                {l.nativeLabel}
                {l.nativeLabel !== l.label && <span className="text-parchment/40 ml-2">({l.label})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
