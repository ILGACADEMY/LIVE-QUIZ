"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Row {
  rank: number;
  name: string;
  score: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage({ params }: { params: { sessionId: string } }) {
  const [top10, setTop10] = useState<Row[]>([]);
  const [totalCompleted, setTotalCompleted] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${params.sessionId}/leaderboard`);
    if (res.ok) {
      const data = await res.json();
      setTop10(data.top10);
      setTotalCompleted(data.totalCompleted);
    }
  }, [params.sessionId]);

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

  return (
    <main className="min-h-screen px-10 py-14 flex flex-col items-center">
      <p className="text-gold text-sm tracking-[0.3em] mb-3">ILG ACADEMY</p>
      <h1 className="font-display italic text-5xl mb-2">Leaderboard</h1>
      <p className="text-parchment/40 text-sm mb-14">{totalCompleted} finished so far</p>

      <div className="w-full max-w-3xl flex flex-col gap-3">
        {top10.length === 0 && <p className="text-center text-parchment/40 py-20">Waiting for the first finishers…</p>}
        {top10.map((row) => (
          <div
            key={row.rank}
            className={`case-panel flex items-center justify-between px-8 py-5 ${
              row.rank <= 3 ? "border-gold" : ""
            }`}
          >
            <div className="flex items-center gap-6">
              <span className="font-dial text-2xl w-12 text-gold">{MEDALS[row.rank - 1] ?? row.rank}</span>
              <span className="font-display italic text-2xl">{row.name}</span>
            </div>
            <span className="font-dial text-3xl text-gold">{row.score}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
