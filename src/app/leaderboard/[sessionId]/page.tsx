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
  correctCount: number;
  totalQuestions: number;
}

interface TeamRow {
  rank: number;
  name: string; // the city or store name
  totalPoints: number;
  participantCount: number;
}

type View = "top10" | "byCity" | "byStore";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage({ params }: { params: { sessionId: string } }) {
  const [view, setView] = useState<View>("top10");
  const [top10, setTop10] = useState<Row[]>([]);
  const [teamRanking, setTeamRanking] = useState<TeamRow[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalJoined, setTotalJoined] = useState(0);
  const [stores, setStores] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams({ view });
    const res = await fetch(`/api/sessions/${params.sessionId}/leaderboard?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.view === "top10") {
        setTop10(data.top10);
        setCompletedCount(data.completedCount);
        setTotalJoined(data.totalJoined);
      } else {
        setTeamRanking(data.teamRanking);
      }
      setStores(data.filters?.stores ?? []);
      setCities(data.filters?.cities ?? []);
    }
  }, [params.sessionId, view]);

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
  // reached beyond that would quietly break that privacy boundary. Only
  // relevant to the individual view — the team views have no names to
  // search by design.
  const visibleTop10 = search.trim()
    ? top10.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : top10;

  return (
    <main className="min-h-screen px-10 py-14 flex flex-col items-center">
      <MeridianWordmark size="small" />
      <h1 className="font-display italic text-5xl mt-6 mb-2">Leaderboard</h1>
      {view === "top10" && (
        <p className="text-parchment/40 text-sm mb-8">
          Live standings — {totalJoined} joined, {completedCount} finished
        </p>
      )}
      {view !== "top10" && <p className="text-parchment/40 text-sm mb-8">Which {view === "byCity" ? "city" : "store"} is leading</p>}

      {/* All three tabs always shown, regardless of how many distinct
          cities/stores exist yet — a single-city session just shows a
          one-row ranking for that tab, which is still correct, and
          having tabs appear/disappear based on data would be more
          confusing than a short list. */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setView("top10")}
          className={`px-5 py-2 text-sm border transition-colors ${view === "top10" ? "bg-gold text-charcoal border-gold" : "border-hairline hover:border-gold/50"}`}
        >
          Top 10 Name
        </button>
        <button
          onClick={() => setView("byCity")}
          className={`px-5 py-2 text-sm border transition-colors ${view === "byCity" ? "bg-gold text-charcoal border-gold" : "border-hairline hover:border-gold/50"}`}
        >
          Top 10 City
        </button>
        <button
          onClick={() => setView("byStore")}
          className={`px-5 py-2 text-sm border transition-colors ${view === "byStore" ? "bg-gold text-charcoal border-gold" : "border-hairline hover:border-gold/50"}`}
        >
          Top 10 Store
        </button>
      </div>

      {view === "top10" && (
        <div className="w-full max-w-3xl flex justify-center mb-8">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a name in this list…"
            className="field-input max-w-[260px]"
          />
        </div>
      )}

      {view === "top10" && (
        <div className="w-full max-w-3xl flex flex-col gap-3">
          {visibleTop10.length === 0 && (
            <p className="text-center text-parchment/40 py-20">
              {top10.length === 0 ? "Waiting for the first participant to join…" : "No one matching that search is in the current Top 10."}
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
                  <p className="text-parchment/40 text-xs mt-0.5">
                    {row.correctCount}/{row.totalQuestions} correct
                    {(row.store || row.city) && <> · {[row.store, row.city].filter(Boolean).join(" — ")}</>}
                  </p>
                </div>
              </div>
              <span className="font-dial text-3xl text-gold">{row.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Team views — city/store totals only, deliberately no participant
          names, so this answers "which city/store is leading" rather than
          "who is winning". */}
      {view !== "top10" && (
        <div className="w-full max-w-2xl flex flex-col gap-3">
          {teamRanking.length === 0 && <p className="text-center text-parchment/40 py-20">Waiting for participants to join…</p>}
          {teamRanking.map((row) => (
            <div
              key={row.name}
              className={`case-panel flex items-center justify-between px-8 py-6 ${row.rank <= 3 ? "border-gold" : ""}`}
            >
              <div className="flex items-center gap-6">
                <span className="font-dial text-2xl w-12 text-gold">{MEDALS[row.rank - 1] ?? row.rank}</span>
                <div>
                  <p className="font-display italic text-2xl leading-tight">{row.name}</p>
                  <p className="text-parchment/40 text-xs mt-0.5">
                    {row.participantCount} participant{row.participantCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <span className="font-dial text-3xl text-gold">{row.totalPoints}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
