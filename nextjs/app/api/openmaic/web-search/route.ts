import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return NextResponse.json({ error: '请填写检索关键词' }, { status: 400 });
  }

  const result = await callOpenMaicJson<Record<string, unknown>>({
    authUserId: currentUser.id,
    path: '/api/web-search',
    method: 'POST',
    body: { ...body, query },
    timeoutMs: 120000,
  });

  if (!result.ok) {
    const message = result.data && typeof result.data === 'object' && 'message' in result.data ? String(result.data.message) : result.error || '联网检索失败';
    return NextResponse.json({ error: message }, { status: result.status || 502 });
  }

  return NextResponse.json({ success: true, ...(result.data || {}) });
}
