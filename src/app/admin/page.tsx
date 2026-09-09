import { requireSessionController } from "@/lib/require-admin";
import QuizLibrary from "@/components/admin/QuizLibrary";

export default function AdminHome() {
  const role = requireSessionController();
  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">ILG ACADEMY</p>
            <h1 className="font-display text-3xl italic">My Quizzes</h1>
          </div>
        </div>
        <QuizLibrary role={role} />
      </div>
    </main>
  );
}
