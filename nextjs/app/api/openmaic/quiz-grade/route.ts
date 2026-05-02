import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

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
  const question = normalizeText(body?.question).slice(0, 2000);
  const userAnswer = normalizeText(body?.userAnswer ?? body?.answer).slice(0, 4000);
  const points = Number(body?.points ?? 10);
  if (!question || !userAnswer) {
    return NextResponse.json({ error: '请填写题目和学生答案' }, { status: 400 });
  }
  if (!Number.isFinite(points) || points <= 0) {
    return NextResponse.json({ error: '分值必须大于 0' }, { status: 400 });
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/quiz-grade',
    method: 'POST',
    body: {
      question,
      userAnswer,
      points,
      commentPrompt: normalizeText(body?.commentPrompt).slice(0, 2000) || undefined,
      language: normalizeText(body?.language, 'zh-CN'),
    },
    timeoutMs: 60000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || 'OpenMAIC 批改失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, score: result.data.score, comment: result.data.comment });
}
