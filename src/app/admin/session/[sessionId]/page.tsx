import { requireSessionController } from "@/lib/require-admin";
import AdminSessionDashboard from "@/components/admin/AdminSessionDashboard";

export default function AdminSessionPage({ params }: { params: { sessionId: string } }) {
  requireSessionController();
  return <AdminSessionDashboard sessionId={params.sessionId} />;
}
