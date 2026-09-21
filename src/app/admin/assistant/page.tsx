import { requireAdmin } from "@/lib/require-admin";
import TrainerAssistant from "@/components/admin/TrainerAssistant";

export default function AssistantPage() {
  requireAdmin();
  return (
    <main className="min-h-screen px-6 py-10 md:px-12">
      <div className="max-w-3xl mx-auto">
        <a href="/admin" className="text-parchment/50 text-sm mb-6 inline-block hover:text-gold">
          ← My Quizzes
        </a>
        <div className="mb-8">
          <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-2">MERIDIAN</p>
          <h1 className="font-display text-3xl italic mb-2">Trainer Assistant</h1>
          <p className="text-parchment/50 text-sm">
            Ask about your team's actual quiz data — knowledge gaps, question performance, recent sessions.
            Answers are grounded in what's really in your data; if there isn't enough to say something useful, it'll
            tell you that instead of guessing.
          </p>
        </div>
        <TrainerAssistant />
      </div>
    </main>
  );
}
