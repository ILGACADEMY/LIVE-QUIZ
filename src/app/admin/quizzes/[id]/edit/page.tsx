import { requireAdmin } from "@/lib/require-admin";
import QuizEditor from "@/components/admin/QuizEditor";

export default function EditQuizPage({ params }: { params: { id: string } }) {
  requireAdmin();
  return <QuizEditor quizId={params.id} />;
}
