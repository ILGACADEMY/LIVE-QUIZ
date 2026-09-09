import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// POST /api/upload/sign — { fileName, fileType }
//
// Returns a short-lived signed upload token so the browser can send the
// file BYTES directly to Supabase Storage — never through this server at
// all. This replaces the earlier approach (proxying the file through
// /api/upload), which worked for small images but silently failed for
// anything near or above ~4.5MB: that's Vercel's hard Serverless Function
// request-body limit, enforced by the platform before any of our own
// code runs. From the browser, a request cut off by that limit looks
// exactly like "network error, never reached the server" — because it
// genuinely didn't. Signed upload URLs sidestep the limit entirely by
// never sending the file through a Vercel function in the first place.
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json(
      { error: "Your admin session has expired. Please log back into /admin and try again." },
      { status: 401 }
    );
  }

  const { fileName, fileType } = await req.json();
  const isImage = ALLOWED_IMAGE_TYPES.includes(fileType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(fileType);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WEBP images or MP4, WEBM, MOV videos are supported." },
      { status: 400 }
    );
  }

  const ext = (fileName as string)?.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const folder = isVideo ? "videos" : "images";
  const path = `questions/${folder}/${crypto.randomUUID()}.${ext}`;

  // The token below is itself the one-time authorization for this exact
  // path — it works regardless of the bucket's RLS policies, so no anon
  // policy needs to be added just to support this.
  const { data, error } = await supabaseAdmin.storage.from("quiz-images").createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not prepare the upload." }, { status: 500 });
  }

  const { data: publicData } = supabaseAdmin.storage.from("quiz-images").getPublicUrl(path);

  return NextResponse.json({
    path: data.path,
    token: data.token,
    publicUrl: publicData.publicUrl,
    mediaType: isVideo ? "video" : "image"
  });
}
