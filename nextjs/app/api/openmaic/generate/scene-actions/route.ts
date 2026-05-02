import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function buildFallbackOutline(title: string, description: string) {
  return {
    id: `outline-${randomUUID()}`,
    type: 'slide',
    title,
    description,
    order: 0,
  };
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = normalizeText(body?.title, '课堂讲解').slice(0, 120);
  const description = normalizeText(body?.description ?? body?.prompt, '请生成适合教师课堂使用的讲解词。').slice(0, 3000);
  const outline = body?.outline && typeof body.outline === 'object' ? body.outline : buildFallbackOutline(title, description);
  let content = body?.content && typeof body.content === 'object' ? body.content : null;
  const allOutlines = Array.isArray(body?.allOutlines) && body.allOutlines.length > 0 ? body.allOutlines : [outline];
  const stageId = normalizeText(body?.stageId, `stage-${randomUUID()}`);

  if (!content) {
    const contentResult = await callOpenMaicJson<any>({
      authUserId: currentUser.id,
      path: '/api/generate/scene-content',
      method: 'POST',
      body: {
        outline,
        allOutlines,
        stageInfo: { name: title, description },
        stageId,
        agents: Array.isArray(body?.agents) ? body.agents : undefined,
        languageDirective: normalizeText(body?.languageDirective, '请使用中文，生成适合教师直接授课的课件内容，不要生成课堂圆桌讨论。'),
      },
      timeoutMs: 120000,
    });

    if (!contentResult.ok || !contentResult.data?.success || !contentResult.data.content) {
      return NextResponse.json(
        { error: contentResult.data?.error || contentResult.error || 'OpenMAIC 场景内容生成失败' },
        { status: contentResult.status || 502 },
      );
    }
    content = contentResult.data.content;
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/generate/scene-actions',
    method: 'POST',
    body: {
      outline,
      allOutlines,
      content,
      stageId,
      agents: Array.isArray(body?.agents) ? body.agents : undefined,
      previousSpeeches: Array.isArray(body?.previousSpeeches) ? body.previousSpeeches : [],
      userProfile: normalizeText(body?.userProfile, '教师'),
      languageDirective: normalizeText(body?.languageDirective, '请使用中文，生成适合教师直接授课的讲稿，不要生成课堂圆桌讨论。'),
    },
    timeoutMs: 90000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || 'OpenMAIC 讲稿动作生成失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({
    success: true,
    scene: result.data.scene,
    actions: result.data.scene?.actions || [],
    previousSpeeches: result.data.previousSpeeches || [],
  });
}
