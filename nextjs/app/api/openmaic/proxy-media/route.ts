import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: '请填写媒体 URL' }, { status: 400 });
  }

  const response = await fetch(`${getOpenMaicBaseUrl()}/api/proxy-media`, {
    method: 'POST',
    headers: await buildOpenMaicHeaders(currentUser.id),
    body: JSON.stringify({ url }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return NextResponse.json(
      { error: payload?.error || `媒体代理失败：HTTP ${response.status}` },
      { status: response.status || 502 },
    );
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
