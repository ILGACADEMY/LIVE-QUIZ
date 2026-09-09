import { requireSessionController } from "@/lib/require-admin";
import QuizPreview from "@/components/admin/QuizPreview";

export default function PreviewPage({ params }: { params: { id: string } }) {
  requireSessionController();
  return <QuizPreview quizId={params.id} />;
}
