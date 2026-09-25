import { requireAdmin } from "@/lib/require-admin";
import AdminSessionDashboard from "@/components/admin/AdminSessionDashboard";

export default async function AdminSessionPage({ params: paramsPromise }: { params: Promise<{ sessionId: string }> }) {
  const params = await paramsPromise;
  await requireAdmin();
  return <AdminSessionDashboard sessionId={params.sessionId} />;
}
