import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

const DEFAULT_AVATARS = [
  '/avatars/teacher-1.png',
  '/avatars/student-1.png',
  '/avatars/student-2.png',
  '/avatars/assistant-1.png',
];

const DEFAULT_COLORS = ['#8F2017', '#2D5C88', '#4E7A51', '#C58D3E'];

function normalizeBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fallbackAgents(stageName: string, availableAvatars: unknown[]) {
  const avatars = availableAvatars.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return [
    {
      id: 'fallback-teacher',
      name: '主讲教师',
      role: 'teacher',
      persona: `围绕「${stageName}」组织课堂目标、讲解重点和活动节奏，语言亲切清晰，善于用问题引导学生。`,
      avatar: avatars[0] || DEFAULT_AVATARS[0],
      color: DEFAULT_COLORS[0],
      priority: 10,
    },
    {
      id: 'fallback-assistant',
      name: '项目助教',
      role: 'assistant',
      persona: '负责把学习任务拆成可操作步骤，提醒材料准备、分组协作和评价标准。',
      avatar: avatars[1] || DEFAULT_AVATARS[1],
      color: DEFAULT_COLORS[1],
      priority: 7,
    },
    {
      id: 'fallback-student',
      name: '好奇学生',
      role: 'student',
      persona: '代表学生提出真实疑问，帮助教师发现难点，并推动课堂互动。',
      avatar: avatars[2] || DEFAULT_AVATARS[2],
      color: DEFAULT_COLORS[2],
      priority: 5,
    },
  ];
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = normalizeBody(await request.json().catch(() => null));
  const stageInfo = normalizeBody(body.stageInfo);
  const name = typeof stageInfo.name === 'string' && stageInfo.name.trim() ? stageInfo.name.trim() : '课程创作助手';
  const payload = {
    ...body,
    stageInfo: { ...stageInfo, name },
    languageDirective: typeof body.languageDirective === 'string' && body.languageDirective.trim() ? body.languageDirective : '使用简体中文，适合中国课堂教学。',
    availableAvatars: Array.isArray(body.availableAvatars) && body.availableAvatars.length > 0 ? body.availableAvatars : DEFAULT_AVATARS,
  };

  const result = await callOpenMaicJson<{ data?: unknown; agents?: unknown }>({
    authUserId: currentUser.id,
    path: '/api/generate/agent-profiles',
    method: 'POST',
    body: payload,
    timeoutMs: 120000,
  });

  if (!result.ok) {
    return NextResponse.json({
      success: true,
      agents: fallbackAgents(name, payload.availableAvatars as unknown[]),
      warning: result.data && typeof result.data === 'object' && 'message' in result.data ? String((result.data as { message?: unknown }).message) : result.error || 'OpenMAIC 角色生成不可用，已使用本地教学角色模板',
    });
  }

  const data = result.data && typeof result.data === 'object' && 'data' in result.data ? (result.data as { data?: unknown }).data : result.data;
  return NextResponse.json({ success: true, ...(data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : { data }) });
}
