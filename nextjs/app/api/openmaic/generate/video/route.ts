import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeDuration(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 2 && parsed <= 12 ? Math.round(parsed) : undefined;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const prompt = normalizeText(body?.prompt).slice(0, 2000);
  if (!prompt) {
    return NextResponse.json({ error: '请填写视频生成提示词' }, { status: 400 });
  }

  const headers = await buildOpenMaicHeaders(currentUser.id);
  headers['x-video-provider'] = normalizeText(body?.providerId, process.env.OPENMAIC_VIDEO_PROVIDER || 'seedance');
  headers['x-api-key'] = normalizeText(body?.apiKey, process.env.OPENMAIC_VIDEO_API_KEY || process.env.OPENMAIC_IMAGE_API_KEY || '');
  headers['x-base-url'] = normalizeText(body?.baseUrl, process.env.OPENMAIC_VIDEO_BASE_URL || 'https://ark.cn-beijing.volces.com');
  const model = normalizeText(body?.model, process.env.OPENMAIC_VIDEO_MODEL || 'doubao-seedance-1-5-pro-251215');
  if (model) headers['x-video-model'] = model;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 330000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}/api/generate/video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        duration: normalizeDuration(body?.duration) || 4,
        aspectRatio: normalizeText(body?.aspectRatio, '16:9'),
        resolution: normalizeText(body?.resolution, '720p'),
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      return NextResponse.json(
        { error: payload?.error || `OpenMAIC 视频生成失败：HTTP ${response.status}` },
        { status: response.status || 502 },
      );
    }
    return NextResponse.json({ success: true, result: payload.result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OpenMAIC 视频生成失败' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
