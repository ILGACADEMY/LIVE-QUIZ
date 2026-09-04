import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// POST /api/quizzes/:id/duplicate — independent copy of quiz + all questions.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: original, error: origError } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("id", params.id)
    .single();
  if (origError) return NextResponse.json({ error: origError.message }, { status: 404 });

  const { id: _id, created_at, updated_at, ...quizFields } = original;
  const { data: copy, error: copyError } = await supabaseAdmin
    .from("quizzes")
    .insert({ ...quizFields, title: `${original.title} (Copy)`, status: "draft" })
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
    const rows = originalQuestions.map(({ id, quiz_id, ...rest }) => ({ ...rest, quiz_id: copy.id }));
    const { error: insError } = await supabaseAdmin.from("questions").insert(rows);
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
  }

  return NextResponse.json({ quiz: copy }, { status: 201 });
}
