import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession, AdminSession } from "@/lib/admin-auth";
import { listMyQuizzes, getKnowledgeGaps, getQuestionPerformance, getRecentSessions } from "@/lib/assistant-tools";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

// The tool surface — deliberately the same shape an external MCP tool
// definition takes (a name, a JSON schema, a clear purpose). Building
// the assistant around named, well-scoped tools now — rather than one
// big "fetch everything and summarize" prompt — is what makes the later
// "let an external AI agent call these same tools" version a new
// transport layer around this, not a rewrite.
const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_my_quizzes",
    description: "Lists the quizzes this trainer owns (or legacy quizzes with no specific owner), with their id, title, and status. Use this first if you need a quiz's id and don't already have it.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_knowledge_gaps",
    description:
      "Category-by-category correct-rate for one quiz, aggregated from its full recorded history (this persists long-term, not just the last 24 hours). Use for questions like 'what are the biggest knowledge gaps' or 'what topic is my team weakest in'.",
    input_schema: {
      type: "object",
      properties: { quizId: { type: "string", description: "The quiz's id, from list_my_quizzes." } },
      required: ["quizId"]
    }
  },
  {
    name: "get_question_performance",
    description:
      "Per-question correct-rate and average answer time for one quiz, from its full recorded history, sorted weakest first. Use for questions like 'which questions should I review or replace'.",
    input_schema: {
      type: "object",
      properties: { quizId: { type: "string", description: "The quiz's id, from list_my_quizzes." } },
      required: ["quizId"]
    }
  },
  {
    name: "get_recent_sessions",
    description:
      "Recent launched sessions (of one quiz, or across all of this trainer's quizzes if no quizId given) with participant counts and average scores. Use for questions like 'how did today's session go' or 'how has this quiz been performing lately'.",
    input_schema: {
      type: "object",
      properties: {
        quizId: { type: "string", description: "Optional — limit to one quiz's sessions." },
        limit: { type: "number", description: "Optional — how many recent sessions to return, default 10." }
      }
    }
  }
];

const SYSTEM_PROMPT = `You are the Meridian Trainer Assistant — you help a training manager understand their team's real quiz and learning performance.

Ground every claim in what the tools actually return. Never invent a number, a percentage, a question's performance, or a trend that a tool didn't report — if a tool comes back with a "note" explaining there isn't enough data, say that plainly instead of guessing or filling the gap with a plausible-sounding estimate.

Knowledge gaps and question performance now draw on a permanent record, not just recent activity — treat them as covering the quiz's real history. Recent-sessions data is different: sessions themselves are deleted 24 hours after finishing, so that tool only ever sees what hasn't aged out yet. If it reports no sessions, that could genuinely mean "never launched" OR "happened, but already aged out" — don't assume either way, just say what it told you.

When a sample is small (a tool's own low-confidence warning, or obviously few responses), say so explicitly rather than stating a finding with unearned confidence.

Keep answers concise and concrete — this is a working tool for someone busy, not an essay. When you recommend an action (like reviewing a specific question, or running a refresher on a topic), name the specific thing plainly.`;

async function executeTool(name: string, input: Record<string, unknown>, session: AdminSession) {
  switch (name) {
    case "list_my_quizzes":
      return listMyQuizzes(session);
    case "get_knowledge_gaps":
      return getKnowledgeGaps(session, input.quizId as string);
    case "get_question_performance":
      return getQuestionPerformance(session, input.quizId as string);
    case "get_recent_sessions":
      return getRecentSessions(session, input.quizId as string | undefined, input.limit as number | undefined);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// POST /api/ai/assistant — { message: string, history?: {role, content}[] }
export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, history } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const messages: Anthropic.MessageParam[] = [...(Array.isArray(history) ? history : []), { role: "user", content: message }];

  try {
    // Tool-use loop: keep calling Claude, executing whatever tools it
    // asks for against real data, and feeding the results back — until
    // it produces a final text-only answer. Capped at 5 rounds so a
    // confused loop can't run away with API cost.
    let finalText = "";
    const toolsUsed: string[] = [];
    for (let round = 0; round < 5; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages
      });

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

      if (toolUseBlocks.length === 0) {
        finalText = textBlocks.map((b) => b.text).join("\n");
        break;
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        toolsUsed.push(block.name);
        const result = await executeTool(block.name, block.input as Record<string, unknown>, session);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: toolResults });

      if (round === 4) {
        finalText = "That took more steps than expected — try asking a more specific question (e.g. name the quiz).";
      }
    }

    return NextResponse.json({
      reply: finalText || "I couldn't find an answer to that.",
      toolsUsed,
      history: messages
    });
  } catch (err) {
    console.error("Assistant error:", err);
    return NextResponse.json({ error: "Could not reach the assistant right now." }, { status: 500 });
  }
}
