import { requireAdmin } from "@/lib/require-admin";
import AdminSessionDashboard from "@/components/admin/AdminSessionDashboard";

export default function AdminSessionPage({ params }: { params: { sessionId: string } }) {
  requireAdmin();
  return <AdminSessionDashboard sessionId={params.sessionId} />;
}
