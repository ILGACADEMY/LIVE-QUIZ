"use client";

import { useState } from "react";

export default function StorageConnectionTest() {
  const [result, setResult] = useState<{ ok: boolean; stage?: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-storage");
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
          <p className="field-label mb-1">File storage</p>
          <p className="text-parchment/40 text-xs">
            Actually uploads and reads back a real test file — the same round trip a question's image/video goes through.
          </p>
        </div>
        <button onClick={runTest} disabled={loading} className="btn-ghost text-sm px-4 py-2 shrink-0">
          {loading ? "Testing…" : "Test file storage"}
        </button>
      </div>
      {result && (
        <p className={`text-sm mt-4 ${result.ok ? "text-gold" : "text-crimson"}`}>
          {result.message}
          {!result.ok && result.stage ? ` (failed at: ${result.stage})` : ""}
        </p>
      )}
    </div>
  );
}
