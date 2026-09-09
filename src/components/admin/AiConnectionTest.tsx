"use client";

import { useState } from "react";

export default function AiConnectionTest() {
  const [result, setResult] = useState<{ ok: boolean; message: string; status?: number | null } | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-ai");
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ ok: false, message: "Network error — the test request never reached the server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="case-panel p-5 mb-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="field-label mb-1">AI connection</p>
          <p className="text-parchment/40 text-xs">
            Checks that translation, feedback, and AI analysis can actually reach Claude — separate from any quiz.
          </p>
        </div>
        <button onClick={runTest} disabled={loading} className="btn-ghost text-sm px-4 py-2 shrink-0">
          {loading ? "Testing…" : "Test AI connection"}
        </button>
      </div>
      {result && (
        <p className={`text-sm mt-4 ${result.ok ? "text-gold" : "text-crimson"}`}>
          {result.message}
          {!result.ok && result.status ? ` (status ${result.status})` : ""}
        </p>
      )}
    </div>
  );
}
