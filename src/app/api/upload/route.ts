import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — keeps things fast on participant phones
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB — generous for a short explainer clip, still Vercel-upload-friendly

// POST /api/upload — multipart/form-data with a "file" field.
// Returns { url, mediaType: 'image' | 'video' }.
export async function POST(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    // NOTE: this is almost certainly why uploads have been silently
    // failing — your admin session cookie lasts 12 hours (see
    // src/lib/admin-auth.ts) and this route has always required it. The
    // fix on this end is the response below; the fix on the frontend end
    // is that QuestionEditor.tsx now actually surfaces this message
    // instead of swallowing it. If you still see this after logging back
    // into /admin, something else is wrong and this message will say so.
    return NextResponse.json(
      { error: "Your admin session has expired. Please log back into /admin and try again." },
      { status: 401 }
    );
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WEBP images or MP4, WEBM, MOV videos are supported." },
      { status: 400 }
    );
  }

  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `${isVideo ? "Video" : "Image"} must be under ${maxBytes / (1024 * 1024)}MB.` },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const folder = isVideo ? "videos" : "images";
  const path = `questions/${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Same bucket as before — Supabase Storage doesn't care about file type
  // at the bucket level, only our own ALLOWED_*_TYPES checks above do.
  const { error } = await supabaseAdmin.storage.from("quiz-images").upload(path, buffer, {
    contentType: file.type,
    upsert: false
  });
  if (error) {
    return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from("quiz-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, mediaType: isVideo ? "video" : "image" });
}
