import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { classroomId, path } = await context.params;
  if (!/^[a-zA-Z0-9_-]{3,120}$/.test(classroomId) || path.some((segment) => segment.includes('..') || segment.includes('\0'))) {
    return NextResponse.json({ error: '媒体路径无效' }, { status: 400 });
  }

  const mediaPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const response = await fetch(`${getOpenMaicBaseUrl()}/api/classroom-media/${encodeURIComponent(classroomId)}/${mediaPath}`, {
    method: 'GET',
    headers: await buildOpenMaicHeaders(currentUser.id),
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json({ error: `读取课堂媒体失败：HTTP ${response.status}` }, { status: response.status || 502 });
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': response.headers.get('cache-control') || 'private, max-age=3600',
    },
  });
}
