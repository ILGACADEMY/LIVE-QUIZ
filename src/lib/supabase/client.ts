"use client";

import { createClient } from "@supabase/supabase-js";

// Anon-key client for the browser. It has no table access (see
// supabase/schema.sql — no anon RLS policies are defined on purpose).
// Its only job is subscribing to Realtime *broadcast* channels that the
// server pushes to, e.g. live "X / 300 answered" counters and the
// 3-2-1 start countdown. All data reads/writes go through /api/* routes.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 10 } } }
);
