import 'server-only';

import { createHmac } from 'crypto';
import { getDefaultAiModelConfig } from '@/lib/ai-model-config';

export function getOpenMaicBaseUrl(): string {
  return (process.env.OPENMAIC_BASE_URL || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
}

function createOpenMaicAccessCookie(): string | null {
  const accessCode = process.env.OPENMAIC_ACCESS_CODE || process.env.ACCESS_CODE || '';
  if (!accessCode) {
    return null;
  }

  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', accessCode).update(timestamp).digest('hex');
  return `openmaic_access=${timestamp}.${signature}`;
}

export async function buildOpenMaicHeaders(authUserId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const cookie = createOpenMaicAccessCookie();
  if (cookie) {
    headers.Cookie = cookie;
  }

  const modelConfig = await getDefaultAiModelConfig(authUserId);
  if (modelConfig) {
    headers['x-provider-type'] = 'openai';
    headers['x-model'] = `openai:${modelConfig.model}`;
    headers['x-api-key'] = modelConfig.api_key;
    headers['x-base-url'] = modelConfig.base_url;
  }

  return headers;
}

export async function callOpenMaicJson<T>(input: {
  authUserId: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 120000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}${input.path}`, {
      method: input.method || 'GET',
      headers: await buildOpenMaicHeaders(input.authUserId),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    const textPreview = text.replace(/\s+/g, ' ').trim().slice(0, 300);

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? undefined : (data as { error?: string } | null)?.error || textPreview || `OpenMAIC HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'OpenMAIC 调用失败',
    };
  } finally {
    clearTimeout(timeout);
  }
}
