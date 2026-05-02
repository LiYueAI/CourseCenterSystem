import { NextRequest, NextResponse } from 'next/server';

import { listMiniAppMounts } from '@/lib/miniapps';
import type { MiniAppMountOwnerKind } from '@/lib/miniapps.types';

export const dynamic = 'force-dynamic';

function parseOwnerKind(value: string | null): MiniAppMountOwnerKind | null {
  if (value === 'standard_module_item' || value === 'teacher_resource') {
    return value;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const ownerKind = parseOwnerKind(request.nextUrl.searchParams.get('ownerKind'));
    if (!ownerKind) {
      return NextResponse.json({ error: '无效的挂载类型' }, { status: 400 });
    }

    const ownerIds = (request.nextUrl.searchParams.get('ownerIds') || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    const mounts = await listMiniAppMounts(ownerKind, ownerIds);
    return NextResponse.json({ mounts });
  } catch (error) {
    console.error('Failed to load mini app mounts:', error);
    return NextResponse.json({ error: '获取小游戏挂载失败' }, { status: 500 });
  }
}
