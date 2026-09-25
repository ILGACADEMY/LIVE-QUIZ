import { requireAdmin } from "@/lib/require-admin";
import QuizEditor from "@/components/admin/QuizEditor";

export default async function EditQuizPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  await requireAdmin();
  return <QuizEditor quizId={params.id} />;
}
