"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type SessionEvent = "answer_count" | "question_advanced" | "countdown" | "quiz_started" | "quiz_ended";

/**
 * Subscribes to `session:{sessionId}` broadcast events pushed by the
 * server (see src/lib/realtime.ts). Purely ephemeral — no table data is
 * read through this, so it works regardless of RLS. Falls back gracefully
 * if a message is missed; every page that uses this also polls
 * /api/sessions/:id/state on an interval as the source of truth, so a
 * dropped broadcast just means a slightly later UI update, never wrong data.
 */
export function useSessionChannel(sessionId: string, onEvent: (event: SessionEvent, payload: any) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const channel = supabaseBrowser.channel(`session:${sessionId}`);
    const events: SessionEvent[] = ["answer_count", "question_advanced", "countdown", "quiz_started", "quiz_ended"];
    events.forEach((event) => {
      channel.on("broadcast", { event }, ({ payload }) => handlerRef.current(event, payload));
    });
    channel.subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [sessionId]);
}
