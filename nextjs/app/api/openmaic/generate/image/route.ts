import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePositiveInt(value: unknown, fallback?: number): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const prompt = normalizeText(body?.prompt).slice(0, 2000);
  if (!prompt) {
    return NextResponse.json({ error: '请填写图片生成提示词' }, { status: 400 });
  }

  const headers = await buildOpenMaicHeaders(currentUser.id);
  const provider = normalizeText(body?.providerId ?? body?.provider, process.env.OPENMAIC_IMAGE_PROVIDER || 'seedream');
  const apiKey = normalizeText(body?.apiKey, process.env.OPENMAIC_IMAGE_API_KEY || '');
  const baseUrl = normalizeText(body?.baseUrl, process.env.OPENMAIC_IMAGE_BASE_URL || '');
  const model = normalizeText(body?.model, process.env.OPENMAIC_IMAGE_MODEL || '');

  headers['x-image-provider'] = provider;
  if (apiKey) headers['x-api-key'] = apiKey;
  if (baseUrl) headers['x-base-url'] = baseUrl;
  if (model) headers['x-image-model'] = model;

  const payload = {
    prompt,
    negativePrompt: normalizeText(body?.negativePrompt).slice(0, 1000) || undefined,
    width: normalizePositiveInt(body?.width),
    height: normalizePositiveInt(body?.height),
    aspectRatio: normalizeText(body?.aspectRatio, '16:9'),
    style: normalizeText(body?.style).slice(0, 120) || undefined,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}/api/generate/image`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      return NextResponse.json(
        { error: data?.error || `OpenMAIC 生图失败：HTTP ${response.status}` },
        { status: response.status || 502 },
      );
    }
    return NextResponse.json({ success: true, result: data.result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OpenMAIC 生图失败' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
