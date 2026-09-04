import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { Quiz, Question } from "@/lib/types";

// POST /api/sessions — "LAUNCH LIVE SESSION" (spec §20)
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quiz_id } = await req.json();
  if (!quiz_id) return NextResponse.json({ error: "quiz_id is required" }, { status: 400 });

  const { data: quiz, error: quizError } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("id", quiz_id)
    .single<Quiz>();
  if (quizError || !quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const { data: questions, error: qError } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("quiz_id", quiz_id)
    .order("order_index", { ascending: true })
    .returns<Question[]>();
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "Add at least one question before launching." }, { status: 400 });
  }

  // Freeze the quiz + questions right now. Later edits to the template will
  // never affect this running session (spec §39).
  const quiz_snapshot = { quiz, questions };

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .insert({ quiz_id, quiz_snapshot, status: "waiting" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL}/join/${session.id}`;

  return NextResponse.json({ session, joinUrl }, { status: 201 });
}
