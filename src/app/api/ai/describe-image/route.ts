import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { describeQuestionImage } from "@/lib/ai";

// POST /api/ai/describe-image — admin-only. Body: { imageUrl }
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageUrl } = await req.json();
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json({ error: "imageUrl is required." }, { status: 400 });
  }

  try {
    const description = await describeQuestionImage(imageUrl);
    return NextResponse.json({ description });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not analyze that image." }, { status: 500 });
  }
}
