import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';
import {
  toSafeOpenMaicCourseDraft,
  upsertOpenMaicCourseDraft,
} from '@/lib/openmaic-course-drafts';

export const dynamic = 'force-dynamic';

function sanitizeOpenMaicResult(data: any) {
  if (!data?.result) {
    return data;
  }

  const result = data.result;
  const scenes = Array.isArray(result.scenes)
    ? result.scenes.map((scene: any) => ({
        ...scene,
        multiAgent: undefined,
      }))
    : result.scenes;
  const stage = result.stage
    ? {
        ...result.stage,
        generatedAgentConfigs: undefined,
      }
    : result.stage;

  return {
    ...data,
    result: {
      ...result,
      stage,
      scenes,
    },
    hiddenFeatures: ['roundtable', 'discussion', 'multiAgent'],
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(jobId)) {
    return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 });
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: `/api/generate-classroom/${encodeURIComponent(jobId)}`,
    method: 'GET',
    timeoutMs: 30000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || '读取 OpenMAIC 任务失败' },
      { status: result.status || 502 }
    );
  }

  const sanitized = sanitizeOpenMaicResult(result.data);
  let draft = null;

  if (sanitized?.done && sanitized?.result && sanitized.status === 'succeeded') {
    try {
      const savedDraft = await upsertOpenMaicCourseDraft({
        authUserId: currentUser.id,
        jobId,
        result: sanitized.result,
      });
      draft = toSafeOpenMaicCourseDraft(savedDraft);
    } catch (error) {
      console.error('Failed to save OpenMAIC course draft:', error);
    }
  }

  return NextResponse.json({ ...sanitized, draft });
}
