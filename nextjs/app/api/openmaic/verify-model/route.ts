import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : '';

  if (!model) {
    return NextResponse.json({ error: '请填写模型名称' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: '请填写 API Key' }, { status: 400 });
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/verify-model',
    method: 'POST',
    body: { model, apiKey, baseUrl },
    timeoutMs: 45000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || '模型连通性测试失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, result: result.data });
}
