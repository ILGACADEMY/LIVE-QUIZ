import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { LiveSession } from "@/lib/types";

const OPTION_FIELD = { A: "option_a", B: "option_b", C: "option_c", D: "option_d" } as const;

function toCsv(rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    // Quote any field containing a comma, quote, or newline — standard CSV escaping.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Leading BOM so Excel opens UTF-8 (accented names, etc.) correctly.
  return "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

// GET /api/sessions/:id/export?type=leaderboard | answers
// Admin-only. Opens straight in Excel/Google Sheets — no extra library needed.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "leaderboard";

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .single<LiveSession>();
  if (sessionError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const quiz = session.quiz_snapshot.quiz;
  const safeTitle = quiz.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const { data: participants, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("session_id", params.id)
    .not("completed_at", "is", null)
    .order("total_score", { ascending: false })
    .order("completed_at", { ascending: true });
  if (pError) return NextResponse.json({ error: pError.message }, { status: 500 });

  if (type === "leaderboard") {
    const totalQuestions = session.quiz_snapshot.questions.length;
    const rows: (string | number)[][] = [
      ["Rank", "Name", "Total score", "Base score", "Speed bonus", "Percentage", "Pass/Fail", "Time"]
    ];
    participants.forEach((p, i) => {
      const percentage = Math.round((p.base_score / totalQuestions) * 100);
      const timeSeconds =
        p.completed_at && session.started_at
          ? Math.round((new Date(p.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000)
          : "";
      rows.push([
        i + 1,
        p.name,
        p.total_score,
        p.base_score,
        p.speed_score,
        `${percentage}%`,
        percentage >= quiz.pass_mark_percent ? "Pass" : "Fail",
        timeSeconds === "" ? "" : `${Math.floor(Number(timeSeconds) / 60)}:${String(Number(timeSeconds) % 60).padStart(2, "0")}`
      ]);
    });
    return csvResponse(toCsv(rows), `${safeTitle}-leaderboard.csv`);
  }

  if (type === "answers") {
    const { data: answers, error: aError } = await supabaseAdmin
      .from("answers")
      .select("*")
      .eq("session_id", params.id)
      .order("participant_id", { ascending: true })
      .order("question_index", { ascending: true });
    if (aError) return NextResponse.json({ error: aError.message }, { status: 500 });

    const nameById = new Map(participants.map((p) => [p.id, p.name]));
    const rows: (string | number)[][] = [
      ["Name", "Q#", "Question", "Category", "Their answer", "Correct answer", "Result", "Points"]
    ];
    answers.forEach((a) => {
      const name = nameById.get(a.participant_id);
      if (!name) return; // skip anyone who never completed
      const q = session.quiz_snapshot.questions[a.question_index];
      rows.push([
        name,
        a.question_index + 1,
        q.question_text,
        q.category,
        q[OPTION_FIELD[a.selected_option as keyof typeof OPTION_FIELD]],
        q[OPTION_FIELD[q.correct_option]],
        a.is_correct ? "Correct" : "Incorrect",
        a.question_score
      ]);
    });
    return csvResponse(toCsv(rows), `${safeTitle}-answer-sheet.csv`);
  }

  return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
}
