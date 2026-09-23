"use client";

import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What are my biggest knowledge gaps?",
  "Which questions should I review or replace?",
  "Compare my before-training and after-training sessions"
];

export default function TrainerAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiHistoryRef = useRef<unknown[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: apiHistoryRef.current })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not reach the assistant.");
        return;
      }
      apiHistoryRef.current = data.history ?? apiHistoryRef.current;
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch {
      setError("Network error — the request never reached the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="case-panel p-6 flex flex-col" style={{ minHeight: "60vh" }}>
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 mb-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-10">
            <p className="text-parchment/30 text-sm text-center">Try asking:</p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="btn-ghost text-sm px-4 py-2.5 text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user" ? "bg-gold/15 text-ivory" : "border border-hairline text-parchment/80"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && <p className="text-parchment/40 text-sm">Checking your data…</p>}
        {error && <p className="text-crimson text-sm">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 pt-4 border-t border-hairline"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your quiz data…"
          className="field-input flex-1"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn-gold px-5">
          Ask
        </button>
      </form>
    </div>
  );
}
