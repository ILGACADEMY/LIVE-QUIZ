import { NextRequest, NextResponse } from "next/server";
import { generateWrongAnswerFeedback } from "@/lib/ai";

// POST /api/ai/feedback — called from the results screen, once per wrong
// answer, only when the quiz has ai_feedback_enabled. The trainer's own
// explanation is required context so the model doesn't invent facts.
export async function POST(req: NextRequest) {
  const { questionText, participantAnswerText, correctAnswerText, adminExplanation, brandContext } = await req.json();

  if (!questionText || !participantAnswerText || !correctAnswerText) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const feedback = await generateWrongAnswerFeedback({
      questionText,
      participantAnswerText,
      correctAnswerText,
      adminExplanation: adminExplanation ?? "",
      brandContext
    });
    return NextResponse.json({ feedback });
  } catch (err) {
    console.error("AI feedback error:", err);
    // Fail soft: the trainer's own explanation is always shown regardless,
    // so a missing/broken API key never blocks the results screen.
    return NextResponse.json({ feedback: null, error: "AI feedback unavailable right now." }, { status: 200 });
  }
}
