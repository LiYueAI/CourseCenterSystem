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
  const message = normalizeText(body?.message).slice(0, 2000);
  if (!message) {
    return NextResponse.json({ error: '请填写项目协助问题' }, { status: 400 });
  }

  const agent = body?.agent && typeof body.agent === 'object'
    ? body.agent
    : {
        id: 'course-project-assistant',
        name: '项目协助教师',
        role: 'teacher',
        system_prompt: '你是课程平台中的项目式学习助教，帮助教师把课程目标拆解成项目任务、实操步骤、评价量规和课堂材料。请用中文回答，避免课堂圆桌讨论和多智能体辩论。',
      };

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/pbl/chat',
    method: 'POST',
    body: {
      message,
      agent,
      currentIssue: body?.currentIssue || null,
      recentMessages: Array.isArray(body?.recentMessages) ? body.recentMessages.slice(-5) : [],
      userRole: normalizeText(body?.userRole, currentUser.role),
      agentType: body?.agentType === 'judge' ? 'judge' : 'question',
    },
    timeoutMs: 90000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || 'OpenMAIC 项目协助失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, message: result.data.message, agentName: result.data.agentName });
}
