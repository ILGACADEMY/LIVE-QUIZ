import { requireAdmin } from "@/lib/require-admin";
import QuizPreview from "@/components/admin/QuizPreview";

export default async function PreviewPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  await requireAdmin();
  return <QuizPreview quizId={params.id} />;
}
