import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listMiniApps } from '@/lib/miniapps';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const apps = await listMiniApps();
    const catalog = apps
      .filter((app) => app.status === 'published' && app.publishedVersionId)
      .map((app) => ({
        ...app,
        versions: app.versions.filter((version) => version.isPublished),
      }));

    return NextResponse.json({ apps: catalog, catalog });
  } catch (error) {
    console.error('Failed to load mini app catalog:', error);
    return NextResponse.json({ error: '获取小游戏目录失败' }, { status: 500 });
  }
}
