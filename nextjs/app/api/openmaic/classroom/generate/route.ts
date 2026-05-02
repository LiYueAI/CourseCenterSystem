import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

interface OpenMaicGenerateClassroomResponse {
  success?: boolean;
  jobId?: string;
  status?: string;
  step?: string;
  message?: string;
  pollUrl?: string;
  pollIntervalMs?: number;
  error?: string;
}

function normalizeRequirement(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 5000) : '';
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requirement = normalizeRequirement(body?.requirement);

  if (!requirement) {
    return NextResponse.json({ error: '请填写生成要求' }, { status: 400 });
  }

  let result;
  try {
    result = await callOpenMaicJson<OpenMaicGenerateClassroomResponse>({
      authUserId: currentUser.id,
      path: '/api/generate-classroom',
      method: 'POST',
      timeoutMs: 30000,
      body: {
        requirement,
        enableWebSearch: Boolean(body?.enableWebSearch),
        enableImageGeneration: Boolean(body?.enableImageGeneration),
        enableVideoGeneration: false,
        agentMode: 'default',
      },
    });
  } catch (error) {
    console.error('OpenMAIC classroom generation start crashed:', error);
    return NextResponse.json(
      { error: 'OpenMAIC 课件生成启动异常，请检查服务日志' },
      { status: 502 },
    );
  }

  if (!result.ok || !result.data?.success) {
    console.error('OpenMAIC classroom generation start failed:', {
      status: result.status,
      error: result.error,
      dataError: result.data?.error,
    });
    return NextResponse.json(
      { error: result.data?.error || result.error || 'OpenMAIC 课件生成启动失败' },
      { status: result.status || 502 }
    );
  }

  return NextResponse.json({
    success: true,
    jobId: result.data.jobId,
    status: result.data.status,
    step: result.data.step,
    message: result.data.message,
    pollIntervalMs: result.data.pollIntervalMs || 5000,
  });
}
