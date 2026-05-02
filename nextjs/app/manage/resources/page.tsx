import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  listAdminLessons,
  listAdminModules,
  listAdminUnits,
} from '@/lib/directus-admin';
import { listMiniApps } from '@/lib/miniapps';
import AdminResourceUploadPanel from '@/components/manage/AdminResourceUploadPanel';
import AdminResourceLibraryPanel from '@/components/manage/AdminResourceLibraryPanel';
import AdminMiniAppLibraryPanel from '@/components/manage/AdminMiniAppLibraryPanel';
import AdminPageHeader from '@/components/manage/AdminPageHeader';

export const dynamic = 'force-dynamic';

type ResourceRow = {
  id: number;
  title: string;
  type: string;
  file_url: string;
  status: string;
  publish_count: number;
};

async function getResources(): Promise<ResourceRow[]> {
  return query<ResourceRow>(
    `
      select
        r.id,
        r.title,
        r.type,
        r.file_url,
        r.status,
        (
          select count(*)::int
          from module_items mi
          where mi.file_url = r.file_url
        ) as publish_count
      from resources r
      order by r.id desc
    `
  );
}

type ModuleOption = {
  moduleId: number;
  label: string;
};

async function getModuleOptions(): Promise<ModuleOption[]> {
  const units = await listAdminUnits();

  const lessonGroups = await Promise.all(
    units.map(async (unit) => ({
      unit,
      lessons: await listAdminLessons(unit.id),
    }))
  );

  const moduleGroups = await Promise.all(
    lessonGroups.flatMap(({ unit, lessons }) =>
      lessons.map(async (lesson) => ({
        unit,
        lesson,
        modules: await listAdminModules(lesson.id),
      }))
    )
  );

  return moduleGroups.flatMap(({ unit, lesson, modules }) =>
    modules.map((module) => ({
      moduleId: module.id,
      label: `${unit.title} / ${lesson.title} / ${module.module_name}`,
    }))
  );
}

export default async function ManageResourcesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'admin') {
    redirect('/login/admin');
  }

  const [resources, moduleOptions, miniApps] = await Promise.all([
    getResources(),
    getModuleOptions(),
    listMiniApps(),
  ]);

  return (
    <div className="space-y-8">
      <AdminPageHeader title="资源管理" backHref="/manage" backLabel="返回管理首页" />

      <AdminResourceUploadPanel />
      <AdminMiniAppLibraryPanel miniApps={miniApps} />
      <AdminResourceLibraryPanel resources={resources} moduleOptions={moduleOptions} />
    </div>
  );
}
