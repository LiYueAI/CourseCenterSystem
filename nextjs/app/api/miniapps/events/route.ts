import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { recordMiniAppEvent } from '@/lib/miniapps';
import type { MiniAppMountOwnerKind } from '@/lib/miniapps.types';

export const dynamic = 'force-dynamic';

function parseOwnerKind(value: unknown): MiniAppMountOwnerKind | null {
  if (value === 'standard_module_item' || value === 'teacher_resource') {
    return value;
  }

  return null;
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['admin', 'teacher', 'student'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const miniAppId = parsePositiveInt(body?.miniAppId);
    const eventType = typeof body?.eventType === 'string' ? body.eventType.trim() : '';

    if (!miniAppId || !eventType) {
      return NextResponse.json({ error: '缺少小游戏事件参数' }, { status: 400 });
    }

    await recordMiniAppEvent({
      miniAppId,
      miniAppVersionId: parsePositiveInt(body?.miniAppVersionId),
      ownerKind: parseOwnerKind(body?.ownerKind),
      ownerId: parsePositiveInt(body?.ownerId),
      userId: currentUser.id,
      lessonId: parsePositiveInt(body?.lessonId),
      eventType,
      eventPayload: parseJsonObject(body?.eventPayload),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to record mini app event:', error);
    return NextResponse.json({ error: '记录小游戏事件失败' }, { status: 500 });
  }
}
