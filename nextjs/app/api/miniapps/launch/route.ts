import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

import { getCurrentUser } from '@/lib/auth';
import { getMiniAppMount } from '@/lib/miniapps';
import type { MiniAppMountOwnerKind } from '@/lib/miniapps.types';

export const dynamic = 'force-dynamic';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'course-platform-jwt-secret-2026-change-in-production'
);

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

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  if (!host) {
    return process.env.NEXTAUTH_URL || 'http://localhost';
  }

  return `${proto}://${host}`;
}

function toLaunchUrl(entryUrl: string, baseUrl: string): URL {
  try {
    return new URL(entryUrl);
  } catch {
    return new URL(entryUrl, baseUrl);
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['admin', 'teacher', 'student'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const ownerKind = parseOwnerKind(body?.ownerKind);
    const ownerId = parsePositiveInt(body?.ownerId);
    const lessonId = parsePositiveInt(body?.lessonId);

    if (!ownerKind || !ownerId) {
      return NextResponse.json({ error: '无效的小游戏启动参数' }, { status: 400 });
    }

    const mount = await getMiniAppMount(ownerKind, ownerId);
    if (!mount || mount.mountStatus !== 'active' || !mount.version) {
      return NextResponse.json({ error: '小游戏挂载不存在或未启用' }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const token = await new SignJWT({
      sub: `${ownerKind}:${ownerId}`,
      miniAppId: mount.miniAppId,
      miniAppVersionId: mount.miniAppVersionId,
      lessonId,
      userId: currentUser.id,
      role: currentUser.role,
      params: mount.params,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('course-platform')
      .setAudience('miniapp')
      .setExpirationTime('15m')
      .sign(JWT_SECRET);

    const baseUrl = getBaseUrl(request);
    const launchUrl = toLaunchUrl(mount.version.entryUrl, baseUrl);
    launchUrl.searchParams.set('miniappToken', token);
    launchUrl.searchParams.set('hostOrigin', baseUrl);
    launchUrl.searchParams.set('miniAppKey', mount.miniApp.appKey);
    launchUrl.searchParams.set('classroomTheme', 'light');
    if (lessonId) {
      launchUrl.searchParams.set('lessonId', String(lessonId));
    }

    return NextResponse.json({
      mount,
      entryUrl: mount.version.entryUrl,
      launchUrl: launchUrl.toString(),
      token,
      expiresAt: expiresAt.toISOString(),
      origin: baseUrl,
    });
  } catch (error) {
    console.error('Failed to launch mini app:', error);
    return NextResponse.json({ error: '小游戏启动失败' }, { status: 500 });
  }
}
