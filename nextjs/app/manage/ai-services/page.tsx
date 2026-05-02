import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AdminPageHeader from '@/components/manage/AdminPageHeader';
import AiServiceConfigPanel from '@/components/manage/AiServiceConfigPanel';

export const dynamic = 'force-dynamic';

export default async function AiServicesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'admin') {
    redirect('/login/admin');
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="AI 管理" backHref="/manage" backLabel="返回管理首页" />

      <AiServiceConfigPanel />
    </div>
  );
}
