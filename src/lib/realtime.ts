import "server-only";
import { supabaseAdmin } from "./supabase/server";

/**
 * Pushes an ephemeral event to everyone subscribed to a session's channel
 * (participants' phones + the admin's live dashboard). Nothing here is
 * persisted or replicated from a table, so there's no RLS surface — see
 * the note in supabase/schema.sql. Keep payloads small; this fires on
 * every answer submission at up to ~300 participants.
 *
 * "question_revealed" and "question_advanced" are new (migration 002,
 * presenter-controlled session mechanics): fired when the presenter's
 * Next-Question control reveals the current question's answer, and when
 * it moves everyone on to the next question, respectively. Both let
 * every participant transition instantly instead of waiting for their
 * next 2.5s poll.
 */
export async function broadcastSessionEvent(
  sessionId: string,
  event: "answer_count" | "question_advanced" | "question_revealed" | "countdown" | "quiz_started" | "quiz_ended",
  payload: Record<string, unknown>
) {
  const channel = supabaseAdmin.channel(`session:${sessionId}`);
  await channel.send({ type: "broadcast", event, payload });
  // Detach immediately — this is a fire-and-forget server-side publish,
  // not a persistent subscription.
  await supabaseAdmin.removeChannel(channel);
}
