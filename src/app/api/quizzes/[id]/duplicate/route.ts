import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin-auth";
import { toQuestionRow } from "@/lib/question-fields";

// POST /api/quizzes/:id/duplicate — independent copy of quiz + all questions.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: original, error: origError } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("id", params.id)
    .single();
  if (origError) return NextResponse.json({ error: origError.message }, { status: 404 });
  if (session.role !== "super_admin" && original.owner_id !== null && original.owner_id !== session.userId) {
    return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  }

  // The quiz-limit check applies here too — otherwise it's a way around
  // the cap by duplicating instead of creating fresh.
  if (session.role !== "super_admin" && session.userId) {
    const { data: user } = await supabaseAdmin.from("admin_users").select("quiz_limit").eq("id", session.userId).maybeSingle();
    const limit = user?.quiz_limit ?? 5;
    const { count } = await supabaseAdmin.from("quizzes").select("id", { count: "exact", head: true }).eq("owner_id", session.userId);
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: `You've reached your limit of ${limit} quizzes. Delete one first, or ask your admin to raise your limit.` },
        { status: 403 }
      );
    }
  }

  const { id: _id, created_at, updated_at, owner_id: _originalOwnerId, ...quizFields } = original;
  const { data: copy, error: copyError } = await supabaseAdmin
    .from("quizzes")
    // The copy belongs to whoever duplicated it, never the original
    // owner — otherwise duplicating someone else's (legacy, ownerless)
    // quiz would silently create ANOTHER ownerless one instead of
    // actually landing in the duplicating user's own space.
    .insert({ ...quizFields, owner_id: session.userId, title: `${original.title} (Copy)`, status: "draft" })
    .select()
    .single();
  if (copyError) return NextResponse.json({ error: copyError.message }, { status: 500 });

  const { data: originalQuestions, error: qError } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("quiz_id", params.id)
    .order("order_index", { ascending: true });
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  if (originalQuestions && originalQuestions.length > 0) {
    const rows = originalQuestions.map((q, i) => toQuestionRow(q, copy.id, i));
    const { error: insError } = await supabaseAdmin.from("questions").insert(rows);
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
  }

  return NextResponse.json({ quiz: copy }, { status: 201 });
}
