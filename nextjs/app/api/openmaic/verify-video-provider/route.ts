import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const headers = await buildOpenMaicHeaders(currentUser.id);
  headers['x-video-provider'] = normalizeText(body?.providerId, process.env.OPENMAIC_VIDEO_PROVIDER || 'seedance');
  headers['x-api-key'] = normalizeText(body?.apiKey, process.env.OPENMAIC_VIDEO_API_KEY || process.env.OPENMAIC_IMAGE_API_KEY || '');
  headers['x-base-url'] = normalizeText(body?.baseUrl, process.env.OPENMAIC_VIDEO_BASE_URL || 'https://ark.cn-beijing.volces.com');
  const model = normalizeText(body?.model, process.env.OPENMAIC_VIDEO_MODEL || 'doubao-seedance-1-5-pro-251215');
  if (model) headers['x-video-model'] = model;

  const response = await fetch(`${getOpenMaicBaseUrl()}/api/verify-video-provider`, {
    method: 'POST',
    headers,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    return NextResponse.json(
      { error: payload?.error || `视频 Provider 测试失败：HTTP ${response.status}` },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({ success: true, message: payload.message || payload.data?.message || '连接成功' });
}
