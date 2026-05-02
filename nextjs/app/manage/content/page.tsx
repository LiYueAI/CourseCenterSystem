import { redirect } from 'next/navigation';
import ContentManagementConsole from '@/components/content/ContentManagementConsole';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultPlaceholderCourses } from '@/lib/directus-admin';

export const dynamic = 'force-dynamic';

export default async function ManageContentPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'admin') {
    redirect('/login/admin');
  }

  await ensureDefaultPlaceholderCourses();

  return (
    <ContentManagementConsole
      basePath="/manage/content"
      backHref="/manage"
      backLabel="返回管理首页"
      searchParams={searchParams}
    />
  );
}
