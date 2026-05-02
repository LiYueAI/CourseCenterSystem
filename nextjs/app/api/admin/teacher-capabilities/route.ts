import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  assignTeacherCapability,
  ensureTeacherCapabilityTables,
  getTeacherCapabilitySnapshot,
  revokeTeacherCapability,
  type TeacherCapabilityScopeLevel,
} from '@/lib/teacher-capabilities';

export const dynamic = 'force-dynamic';

type RequestBody = {
  teacherUserId?: string;
  capabilityKey?: string;
  scopeLevel?: TeacherCapabilityScopeLevel;
  schoolId?: number | null;
  schoolClassroomId?: number | null;
};

function validateTeacherUserId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function validateCapabilityKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
}

function validateScopeLevel(value: unknown): TeacherCapabilityScopeLevel | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value === 'platform' || value === 'school' || value === 'school_classroom') {
    return value;
  }

  return null;
}

function validateOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function unauthorized() {
  return NextResponse.json({ error: '未授权' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return unauthorized();
  }

  try {
    await ensureTeacherCapabilityTables();

    const teacherUserId = validateTeacherUserId(
      request.nextUrl.searchParams.get('teacherUserId')
    );

    if (!teacherUserId) {
      return NextResponse.json({ error: 'teacherUserId 必填' }, { status: 400 });
    }

    const snapshot = await getTeacherCapabilitySnapshot(teacherUserId);
    return NextResponse.json(snapshot);
  } catch (error: any) {
    if (error.message === 'Teacher not found') {
      return NextResponse.json({ error: '教师不存在' }, { status: 404 });
    }

    console.error('Failed to load teacher capabilities:', error);
    return NextResponse.json({ error: '获取老师兼职职能失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return unauthorized();
  }

  try {
    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const teacherUserId = validateTeacherUserId(body?.teacherUserId);
    const capabilityKey = validateCapabilityKey(body?.capabilityKey);
    const scopeLevel = validateScopeLevel(body?.scopeLevel) || 'platform';
    const schoolId = validateOptionalInt(body?.schoolId);
    const schoolClassroomId = validateOptionalInt(body?.schoolClassroomId);

    if (!teacherUserId || !capabilityKey) {
      return NextResponse.json(
        { error: 'teacherUserId 和 capabilityKey 必填' },
        { status: 400 }
      );
    }

    const result = await assignTeacherCapability({
      teacherUserId,
      capabilityKey,
      assignedByUserId: currentUser.id,
      scopeLevel,
      schoolId,
      schoolClassroomId,
    });

    return NextResponse.json(
      {
        success: true,
        created: result.created,
        assignment: result.assignment,
        teacher: result.snapshot.teacher,
        capabilities: result.snapshot.capabilities,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error: any) {
    if (error.message === 'Teacher not found') {
      return NextResponse.json({ error: '教师不存在' }, { status: 404 });
    }
    if (error.message === 'Capability not found') {
      return NextResponse.json({ error: '职能不存在' }, { status: 404 });
    }
    if (error.message === 'School scope requires school') {
      return NextResponse.json({ error: '学校级职能需要学校范围' }, { status: 400 });
    }
    if (error.message === 'Classroom scope requires classroom') {
      return NextResponse.json({ error: '班级级职能需要班级范围' }, { status: 400 });
    }

    console.error('Failed to assign teacher capability:', error);
    return NextResponse.json({ error: '创建老师兼职职能失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return unauthorized();
  }

  try {
    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const teacherUserId = validateTeacherUserId(body?.teacherUserId);
    const capabilityKey = validateCapabilityKey(body?.capabilityKey);

    if (!teacherUserId || !capabilityKey) {
      return NextResponse.json(
        { error: 'teacherUserId 和 capabilityKey 必填' },
        { status: 400 }
      );
    }

    const result = await revokeTeacherCapability({
      teacherUserId,
      capabilityKey,
      revokedByUserId: currentUser.id,
    });

    return NextResponse.json({
      success: true,
      revoked: result.revoked,
      teacher: result.snapshot.teacher,
      capabilities: result.snapshot.capabilities,
    });
  } catch (error: any) {
    if (error.message === 'Teacher not found') {
      return NextResponse.json({ error: '教师不存在' }, { status: 404 });
    }
    if (error.message === 'Capability not found') {
      return NextResponse.json({ error: '职能不存在' }, { status: 404 });
    }

    console.error('Failed to revoke teacher capability:', error);
    return NextResponse.json({ error: '撤销老师兼职职能失败' }, { status: 500 });
  }
}
