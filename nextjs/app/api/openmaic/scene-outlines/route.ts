import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}


function parseSseOutlines(text: string): { outlines: unknown[]; languageDirective?: string } {
  const outlines: unknown[] = [];
  let languageDirective: string | undefined;

  for (const block of text.split(/\n\n+/)) {
    const dataLines = block
      .split(/\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) continue;

    const dataText = dataLines.join('\n');
    try {
      const event = JSON.parse(dataText) as {
        type?: string;
        data?: unknown;
        outlines?: unknown;
        languageDirective?: unknown;
        error?: string;
      };
      if (event.type === 'outline' && event.data) {
        outlines.push(event.data);
      } else if (event.type === 'languageDirective' && typeof event.data === 'string') {
        languageDirective = event.data;
      } else if (event.type === 'done') {
        if (Array.isArray(event.outlines)) {
          return {
            outlines: event.outlines,
            languageDirective: typeof event.languageDirective === 'string' ? event.languageDirective : languageDirective,
          };
        }
      } else if (event.type === 'error' && event.error) {
        throw new Error(event.error);
      }
    } catch (error) {
      if (error instanceof Error && dataText.includes('"type"')) {
        throw error;
      }
    }
  }

  return { outlines, languageDirective };
}

function extractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {}

  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {}
  }

  return null;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requirements = normalizeText(body?.requirements ?? body?.requirement).slice(0, 4000);
  if (!requirements) {
    return NextResponse.json({ error: '请填写课程目标或生成要求' }, { status: 400 });
  }

  const openMaicBody = {
    requirements: {
      requirement: requirements,
      audience: normalizeText(body?.audience, '中小学学生'),
      goals: normalizeText(body?.goals ?? body?.objective, ''),
      interactiveMode: Boolean(body?.interactiveMode ?? true),
      imageGenerationEnabled: Boolean(body?.enableImageGeneration),
      videoGenerationEnabled: Boolean(body?.enableVideoGeneration),
    },
    languageDirective: normalizeText(body?.languageDirective, '请使用中文输出。'),
    agentMode: 'default',
    enableWebSearch: false,
    ...(body?.pdfContent ? { pdfText: body.pdfContent } : {}),
  };

  if (body?.stream === true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${getOpenMaicBaseUrl()}/api/generate/scene-outlines-stream`, {
        method: 'POST',
        headers: await buildOpenMaicHeaders(currentUser.id),
        body: JSON.stringify(openMaicBody),
        cache: 'no-store',
        signal: controller.signal,
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'OpenMAIC 大纲生成失败' },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}/api/generate/scene-outlines-stream`, {
      method: 'POST',
      headers: await buildOpenMaicHeaders(currentUser.id),
      body: JSON.stringify(openMaicBody),
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');

    if (!response.ok) {
      return NextResponse.json(
        { error: text.replace(/\s+/g, ' ').trim().slice(0, 300) || 'OpenMAIC 大纲生成失败' },
        { status: response.status || 502 },
      );
    }

    const parsedSse = parseSseOutlines(text);
    const parsedOutlines = parsedSse.outlines.length > 0 ? parsedSse.outlines : extractJsonArray(text) || [];

    return NextResponse.json({
      success: true,
      outlines: parsedOutlines,
      languageDirective: parsedSse.languageDirective,
      raw: parsedOutlines.length > 0 ? undefined : text.slice(0, 2000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OpenMAIC 大纲生成失败' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
