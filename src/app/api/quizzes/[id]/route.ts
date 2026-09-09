import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized, isSessionControllerRequestAuthorized } from "@/lib/admin-auth";
import { toQuestionRow } from "@/lib/question-fields";

// GET /api/quizzes/:id — quiz + full question list, for the editor/preview.
// Trainers can reach this too (needed for the read-only Preview screen) —
// PUT and DELETE below, which actually change content, stay admin-only.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSessionControllerRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: quiz, error: quizError } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("id", params.id)
    .single();
  if (quizError) return NextResponse.json({ error: quizError.message }, { status: 404 });

  const { data: questions, error: qError } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("quiz_id", params.id)
    .order("order_index", { ascending: true });
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  return NextResponse.json({ quiz, questions });
}

// PUT /api/quizzes/:id — save quiz settings + full question set in one call.
// The Question Builder always sends the complete question array (max 50,
// spec §6); we replace-in-place by order_index rather than diffing, which
// keeps "no coding, no JSON editing" simple for the admin UI to implement.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { quiz, questions } = body as {
    quiz: Record<string, unknown>;
    questions: Array<Record<string, unknown>>;
  };

  if (questions && questions.length > 50) {
    return NextResponse.json({ error: "A quiz can have at most 50 questions." }, { status: 400 });
  }

  if (quiz) {
    const { error } = await supabaseAdmin
      .from("quizzes")
      .update({ ...quiz, updated_at: new Date().toISOString() })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (questions) {
    // Replace the whole question set transactionally-ish: delete then insert.
    // Fine at this scale (<=50 rows) and avoids partial order_index clashes.
    const { error: delError } = await supabaseAdmin.from("questions").delete().eq("quiz_id", params.id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    if (questions.length > 0) {
      const rows = questions.map((q, i) => toQuestionRow(q, params.id, i));
      const { error: insError } = await supabaseAdmin.from("questions").insert(rows);
      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/quizzes/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabaseAdmin.from("quizzes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
