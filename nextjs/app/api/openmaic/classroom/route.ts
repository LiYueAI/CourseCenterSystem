import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

function sanitizeClassroom(payload: any) {
  const classroom = payload?.classroom;
  if (!classroom) return payload;
  const scenes = Array.isArray(classroom.scenes)
    ? classroom.scenes.map((scene: any) => ({ ...scene, multiAgent: undefined }))
    : classroom.scenes;
  const stage = classroom.stage ? { ...classroom.stage, generatedAgentConfigs: undefined } : classroom.stage;
  return { ...payload, classroom: { ...classroom, stage, scenes }, hiddenFeatures: ['roundtable', 'discussion', 'multiAgent'] };
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id') || '';
  if (!/^[a-zA-Z0-9_-]{3,120}$/.test(id)) {
    return NextResponse.json({ error: '课堂 ID 无效' }, { status: 400 });
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: `/api/classroom?id=${encodeURIComponent(id)}`,
    method: 'GET',
    timeoutMs: 30000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || '读取 OpenMAIC 原生课堂失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, ...sanitizeClassroom(result.data) });
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.stage || !Array.isArray(body?.scenes)) {
    return NextResponse.json({ error: '请提供 stage 和 scenes' }, { status: 400 });
  }

  const scenes = body.scenes.map((scene: any) => ({ ...scene, multiAgent: undefined }));
  const stage = body.stage && typeof body.stage === 'object' ? { ...(body.stage as object), generatedAgentConfigs: undefined } : body.stage;

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/classroom',
    method: 'POST',
    body: { stage, scenes },
    timeoutMs: 60000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || '保存 OpenMAIC 原生课堂失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, id: result.data.id, url: result.data.url });
}
