import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isSessionControllerRequestAuthorized } from "@/lib/admin-auth";
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
//
// IMPORTANT: this does NOT filter by completed_at. In the presenter-
// controlled model, completed_at only gets set for everyone AT ONCE when
// the quiz naturally reaches its last question — and not at all if the
// presenter used "End quiz" to stop it early. A completed_at filter here
// used to mean the export came back completely empty in either of those
// completely normal situations. Every participant who joined is included
// now, exactly like the on-screen "Full ranking" table.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSessionControllerRequestAuthorized(req)) {
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
  const totalQuestions = session.quiz_snapshot.questions.length;
  const safeTitle = quiz.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const { data: participants, error: pError } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("session_id", params.id)
    .order("total_score", { ascending: false })
    .order("joined_at", { ascending: true }); // stable tie-break that's always present, unlike completed_at
  if (pError) return NextResponse.json({ error: pError.message }, { status: 500 });

  // Correct-answer counts, one query for everyone rather than one per
  // participant — same approach as the on-screen leaderboard.
  const { data: allAnswers, error: aError } = await supabaseAdmin
    .from("answers")
    .select("participant_id, is_correct")
    .eq("session_id", params.id);
  if (aError) return NextResponse.json({ error: aError.message }, { status: 500 });
  const correctCountById = new Map<string, number>();
  (allAnswers ?? []).forEach((a) => {
    if (a.is_correct) correctCountById.set(a.participant_id, (correctCountById.get(a.participant_id) ?? 0) + 1);
  });

  if (type === "leaderboard") {
    const rows: (string | number)[][] = [
      [
        "Rank",
        "Name",
        "Store",
        "City",
        "Mobile",
        "Email",
        "Correct",
        "Total score",
        "Base score",
        "Speed bonus",
        "Percentage",
        "Pass/Fail",
        "Time",
        "Completed"
      ]
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
        p.store ?? "",
        p.city ?? "",
        p.mobile ?? "",
        p.email ?? "",
        `${correctCountById.get(p.id) ?? 0}/${totalQuestions}`,
        p.total_score,
        p.base_score,
        p.speed_score,
        `${percentage}%`,
        percentage >= quiz.pass_mark_percent ? "Pass" : "Fail",
        timeSeconds === "" ? "" : `${Math.floor(Number(timeSeconds) / 60)}:${String(Number(timeSeconds) % 60).padStart(2, "0")}`,
        p.completed_at ? "Yes" : "No"
      ]);
    });
    return csvResponse(toCsv(rows), `${safeTitle}-leaderboard.csv`);
  }

  if (type === "answers") {
    const { data: answers, error: aError2 } = await supabaseAdmin
      .from("answers")
      .select("*")
      .eq("session_id", params.id)
      .order("participant_id", { ascending: true })
      .order("question_index", { ascending: true });
    if (aError2) return NextResponse.json({ error: aError2.message }, { status: 500 });

    // Every participant who joined is eligible to appear here now — not
    // just ones with completed_at set (see the note above). Anyone who
    // never answered anything simply contributes zero rows, which is
    // correct, not an error.
    const nameById = new Map(participants.map((p) => [p.id, p.name]));
    const rows: (string | number)[][] = [
      ["Name", "Q#", "Question", "Category", "Their answer", "Correct answer", "Result", "Points"]
    ];
    answers.forEach((a) => {
      const name = nameById.get(a.participant_id);
      if (!name) return; // participant record genuinely gone (e.g. deleted) — not a completion check anymore
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
