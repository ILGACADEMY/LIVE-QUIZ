import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import Anthropic from "@anthropic-ai/sdk";

// GET /api/admin/test-ai — admin-only.
//
// Every AI feature in this app (translation, wrong-answer feedback, both
// analyses) deliberately swallows its own errors and falls back to
// English/a generic message — that's the right behavior for a live quiz
// in front of a room, but it means a real misconfiguration (bad API key,
// no billing set up, an invalid model name) looks IDENTICAL to "AI
// feature not turned on." This route exists purely to break that
// silence: it makes one small, real Anthropic call outside any quiz
// context and reports back exactly what happened — success with the
// actual reply, or the exact error Anthropic returned, not a guess.
export async function GET(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      ok: false,
      stage: "config",
      message: "ANTHROPIC_API_KEY is not set in this deployment's environment variables at all."
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with only the word: OK" }]
    });
    const text = msg.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return NextResponse.json({
      ok: true,
      message: `AI is working correctly. Model replied: "${text}"`
    });
  } catch (err: any) {
    // Surface the real error rather than a generic one — this is the
    // whole point of this route. Anthropic's SDK errors usually carry a
    // status code and a message that says exactly what's wrong (invalid
    // API key, insufficient credits, invalid model, rate limit, etc.).
    return NextResponse.json({
      ok: false,
      stage: "api_call",
      status: err?.status ?? null,
      message: err?.message ?? String(err)
    });
  }
}
