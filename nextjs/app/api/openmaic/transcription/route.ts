import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const incomingForm = await request.formData().catch(() => null);
  const audio = incomingForm?.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: '请上传音频文件' }, { status: 400 });
  }
  if (audio.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: '音频文件不能超过 30MB' }, { status: 400 });
  }

  const formData = new FormData();
  formData.set('audio', audio, audio.name || 'audio.wav');
  for (const key of ['providerId', 'modelId', 'language', 'apiKey', 'baseUrl']) {
    const value = incomingForm?.get(key);
    if (typeof value === 'string' && value.trim()) {
      formData.set(key, value.trim());
    }
  }

  if (!formData.get('providerId')) {
    formData.set('providerId', process.env.OPENMAIC_ASR_PROVIDER || 'qwen-asr');
  }
  if (!formData.get('modelId') && process.env.OPENMAIC_ASR_MODEL) {
    formData.set('modelId', process.env.OPENMAIC_ASR_MODEL);
  }
  if (!formData.get('apiKey') && process.env.OPENMAIC_ASR_API_KEY) {
    formData.set('apiKey', process.env.OPENMAIC_ASR_API_KEY);
  }
  if (!formData.get('baseUrl') && process.env.OPENMAIC_ASR_BASE_URL) {
    formData.set('baseUrl', process.env.OPENMAIC_ASR_BASE_URL);
  }
  if (!formData.get('language')) {
    formData.set('language', 'auto');
  }

  const headers = await buildOpenMaicHeaders(currentUser.id);
  delete headers['Content-Type'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}/api/transcription`, {
      method: 'POST',
      headers,
      body: formData,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      return NextResponse.json(
        { error: payload?.error || `语音转写失败：HTTP ${response.status}` },
        { status: response.status || 502 },
      );
    }
    return NextResponse.json({ success: true, text: payload.text || payload.data?.text || '' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '语音转写失败' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
