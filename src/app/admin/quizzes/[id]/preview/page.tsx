import { requireAdmin } from "@/lib/require-admin";
import QuizPreview from "@/components/admin/QuizPreview";

export default function PreviewPage({ params }: { params: { id: string } }) {
  requireAdmin();
  return <QuizPreview quizId={params.id} />;
}
