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
  const providerId = normalizeText(body?.providerId, 'unpdf');
  if (providerId === 'unpdf') {
    return NextResponse.json({ success: true, message: '本地 unpdf 可用' });
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/verify-pdf-provider',
    method: 'POST',
    body: {
      providerId,
      apiKey: normalizeText(body?.apiKey) || undefined,
      baseUrl: normalizeText(body?.baseUrl) || undefined,
    },
    timeoutMs: 30000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || 'PDF Provider 测试失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, message: result.data.message || '连接成功', status: result.data.status });
}
