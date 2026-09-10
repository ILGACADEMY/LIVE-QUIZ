import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

// GET /api/admin/test-storage — admin-only.
//
// Same idea as /api/admin/test-ai: image/video uploads have been
// reported broken multiple times, and every code review of the upload
// path itself has come back clean — so instead of guessing again, this
// actually performs a real signed-upload round trip (create the signed
// URL, upload a tiny real file with it, confirm it's readable, then
// clean up) completely outside the question editor, and reports back
// exactly which step failed and why, if any.
export async function GET(req: NextRequest) {
  if (!isAdminRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const testPath = `questions/diagnostic-test/${crypto.randomUUID()}.txt`;

  // Step 1: does the bucket exist at all?
  const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket("quiz-images");
  if (bucketError || !bucket) {
    return NextResponse.json({
      ok: false,
      stage: "bucket",
      message:
        bucketError?.message ??
        "The 'quiz-images' storage bucket doesn't exist in this Supabase project. Run supabase/schema.sql's storage bucket section, or create a public bucket named exactly 'quiz-images' in the Supabase dashboard under Storage."
    });
  }

  // Step 2: can we create a signed upload URL? (same call the real upload flow uses)
  const { data: signed, error: signError } = await supabaseAdmin.storage.from("quiz-images").createSignedUploadUrl(testPath);
  if (signError || !signed) {
    return NextResponse.json({
      ok: false,
      stage: "sign",
      message: signError?.message ?? "Could not create a signed upload URL."
    });
  }

  // Step 3: actually upload a real, tiny file using that signed URL — this
  // is the step that most closely matches what a participant's browser
  // does, and the one no earlier check has actually exercised.
  const testContent = new Blob(["Meridian storage diagnostic — safe to ignore/delete."], { type: "text/plain" });
  const { error: uploadError } = await supabaseAdmin.storage.from("quiz-images").uploadToSignedUrl(signed.path, signed.token, testContent);
  if (uploadError) {
    return NextResponse.json({
      ok: false,
      stage: "upload",
      message: uploadError.message
    });
  }

  // Step 4: confirm it's actually publicly readable (this is what makes
  // the uploaded image/video actually show up on a question afterward).
  const { data: publicData } = supabaseAdmin.storage.from("quiz-images").getPublicUrl(testPath);
  let readable = false;
  try {
    const readRes = await fetch(publicData.publicUrl);
    readable = readRes.ok;
  } catch {
    readable = false;
  }

  // Clean up the test file either way.
  await supabaseAdmin.storage.from("quiz-images").remove([testPath]);

  if (!readable) {
    return NextResponse.json({
      ok: false,
      stage: "read",
      message:
        "The file uploaded successfully but isn't publicly readable afterward. The 'quiz-images' bucket likely isn't marked Public in Supabase — go to Storage → quiz-images → check its settings."
    });
  }

  return NextResponse.json({
    ok: true,
    message: "File storage is working correctly — bucket exists, signed upload succeeded, and the uploaded file is publicly readable."
  });
}
