import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { checkQuestionSpelling } from "@/lib/ai";

// POST /api/ai/check-spelling — admin-only.
// Body: { questionText, optionA, optionB, optionC, optionD, explanation }
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  try {
    const corrections = await checkQuestionSpelling({
      questionText: body.questionText ?? "",
      optionA: body.optionA ?? "",
      optionB: body.optionB ?? "",
      optionC: body.optionC ?? "",
      optionD: body.optionD ?? "",
      explanation: body.explanation ?? ""
    });
    return NextResponse.json({ corrections });
  } catch (err) {
    console.error("Spell-check error:", err);
    return NextResponse.json({ error: "Could not check spelling right now." }, { status: 500 });
  }
}
