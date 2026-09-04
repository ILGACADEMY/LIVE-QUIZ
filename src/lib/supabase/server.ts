import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. NEVER import this from a "use client" component —
// the "server-only" import above makes Next.js throw a build error if you
// accidentally try to. This client bypasses RLS entirely, so every route
// that uses it is responsible for its own authorization checks (admin
// password check for /api/quizzes/*, participant ownership checks for
// /api/sessions/*/answer, etc.).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
