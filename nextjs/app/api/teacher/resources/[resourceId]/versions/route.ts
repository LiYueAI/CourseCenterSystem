import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getTeacherResource,
  listTeacherResourceVersions,
  restoreTeacherResourceVersion,
} from '@/lib/teacher-plan';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string | number | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { resourceId: string } },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const resourceId = parsePositiveInt(params.resourceId);
  if (!resourceId) {
    return NextResponse.json({ error: '无效的资源 ID' }, { status: 400 });
  }

  const resource = await getTeacherResource(currentUser.id, resourceId);
  if (!resource) {
    return NextResponse.json({ error: '资源不存在' }, { status: 404 });
  }

  const versions = await listTeacherResourceVersions(currentUser.id, resourceId);
  return NextResponse.json({ success: true, resource, versions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { resourceId: string } },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const resourceId = parsePositiveInt(params.resourceId);
  if (!resourceId) {
    return NextResponse.json({ error: '无效的资源 ID' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const versionNumber = parsePositiveInt(body?.versionNumber as number | string | undefined);
  if (!versionNumber) {
    return NextResponse.json({ error: '无效的版本号' }, { status: 400 });
  }

  const resource = await restoreTeacherResourceVersion(currentUser.id, resourceId, versionNumber);
  if (!resource) {
    return NextResponse.json({ error: '版本不存在或资源不存在' }, { status: 404 });
  }

  const versions = await listTeacherResourceVersions(currentUser.id, resourceId);
  return NextResponse.json({ success: true, resource, versions });
}
