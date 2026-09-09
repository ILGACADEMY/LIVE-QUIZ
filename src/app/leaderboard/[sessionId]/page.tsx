"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import MeridianWordmark from "@/components/shared/MeridianWordmark";

interface Row {
  rank: number;
  name: string;
  avatar?: string;
  store?: string | null;
  city?: string | null;
  score: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage({ params }: { params: { sessionId: string } }) {
  const [top10, setTop10] = useState<Row[]>([]);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [stores, setStores] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (storeFilter) query.set("store", storeFilter);
    if (cityFilter) query.set("city", cityFilter);
    const res = await fetch(`/api/sessions/${params.sessionId}/leaderboard?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setTop10(data.top10);
      setTotalCompleted(data.totalCompleted);
      setStores(data.filters?.stores ?? []);
      setCities(data.filters?.cities ?? []);
    }
  }, [params.sessionId, storeFilter, cityFilter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    const channel = supabaseBrowser
      .channel(`session:${params.sessionId}`)
      .on("broadcast", { event: "answer_count" }, load)
      .on("broadcast", { event: "quiz_ended" }, load)
      .subscribe();
    return () => {
      clearInterval(interval);
      supabaseBrowser.removeChannel(channel);
    };
  }, [params.sessionId, load]);

  // Search only ever highlights within the Top 10 already fetched — it
  // never looks up a name outside that list. Public results are
  // deliberately capped at Top 10 + your own rank; a name search that
  // reached beyond that would quietly break that privacy boundary.
  const visibleTop10 = search.trim()
    ? top10.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : top10;

  return (
    <main className="min-h-screen px-10 py-14 flex flex-col items-center">
      <MeridianWordmark size="small" />
      <h1 className="font-display italic text-5xl mt-6 mb-2">Leaderboard</h1>
      <p className="text-parchment/40 text-sm mb-8">{totalCompleted} finished so far</p>

      <div className="w-full max-w-3xl flex flex-wrap gap-3 justify-center mb-10">
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="field-input max-w-[220px]">
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="field-input max-w-[220px]">
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a name in this list…"
          className="field-input max-w-[220px]"
        />
        {(storeFilter || cityFilter || search) && (
          <button
            onClick={() => {
              setStoreFilter("");
              setCityFilter("");
              setSearch("");
            }}
            className="btn-ghost text-sm px-4"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="w-full max-w-3xl flex flex-col gap-3">
        {visibleTop10.length === 0 && (
          <p className="text-center text-parchment/40 py-20">
            {top10.length === 0 ? "Waiting for the first finishers…" : "No one matching that search is in the current Top 10."}
          </p>
        )}
        {visibleTop10.map((row) => (
          <div
            key={row.rank}
            className={`case-panel flex items-center justify-between px-8 py-5 ${row.rank <= 3 ? "border-gold" : ""}`}
          >
            <div className="flex items-center gap-6">
              <span className="font-dial text-2xl w-12 text-gold">{MEDALS[row.rank - 1] ?? row.rank}</span>
              {row.avatar && <span className="text-2xl">{row.avatar}</span>}
              <div>
                <p className="font-display italic text-2xl leading-tight">{row.name}</p>
                {(row.store || row.city) && (
                  <p className="text-parchment/40 text-xs mt-0.5">{[row.store, row.city].filter(Boolean).join(" — ")}</p>
                )}
              </div>
            </div>
            <span className="font-dial text-3xl text-gold">{row.score}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
