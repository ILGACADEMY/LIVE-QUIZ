import "server-only";
import { supabaseAdmin } from "./supabase/server";

/**
 * Pushes an ephemeral event to everyone subscribed to a session's channel
 * (participants' phones + the admin's live dashboard). Nothing here is
 * persisted or replicated from a table, so there's no RLS surface — see
 * the note in supabase/schema.sql. Keep payloads small; this fires on
 * every answer submission at up to ~300 participants.
 */
export async function broadcastSessionEvent(
  sessionId: string,
  event: "answer_count" | "question_advanced" | "countdown" | "quiz_started" | "quiz_ended",
  payload: Record<string, unknown>
) {
  const channel = supabaseAdmin.channel(`session:${sessionId}`);
  await channel.send({ type: "broadcast", event, payload });
  // Detach immediately — this is a fire-and-forget server-side publish,
  // not a persistent subscription.
  await supabaseAdmin.removeChannel(channel);
}
