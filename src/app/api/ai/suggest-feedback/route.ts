import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { suggestWrongAnswerFeedback } from "@/lib/ai";

// POST /api/ai/suggest-feedback — admin-only.
// Body: { questionText, correctText, wrongOptionText, explanation? }
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.questionText || !body.correctText || !body.wrongOptionText) {
    return NextResponse.json({ error: "questionText, correctText, and wrongOptionText are required." }, { status: 400 });
  }

  try {
    const suggestion = await suggestWrongAnswerFeedback({
      questionText: body.questionText,
      correctText: body.correctText,
      wrongOptionText: body.wrongOptionText,
      explanation: body.explanation
    });
    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("Feedback suggestion error:", err);
    return NextResponse.json({ error: "Could not generate a suggestion right now." }, { status: 500 });
  }
}
