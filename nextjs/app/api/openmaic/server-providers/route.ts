import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { callOpenMaicJson } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const result = await callOpenMaicJson<any>({
    authUserId: currentUser.id,
    path: '/api/server-providers',
    method: 'GET',
    timeoutMs: 30000,
  });

  if (!result.ok || !result.data?.success) {
    return NextResponse.json(
      { error: result.data?.error || result.error || '读取 OpenMAIC Provider 失败' },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ success: true, ...result.data });
}
