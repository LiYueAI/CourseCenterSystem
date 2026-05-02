import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createClassroomByAdmin,
  deleteClassroomById,
  listClassroomDirectory,
  rotateClassroomCodeById,
  setClassroomCodeEnabledById,
  updateClassroomById,
} from '@/lib/school-classroom';

export const dynamic = 'force-dynamic';

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(_request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classrooms = await listClassroomDirectory();
    return NextResponse.json({ classrooms });
  } catch (error) {
    console.error('Failed to load classroom directory:', error);
    return NextResponse.json({ error: '获取班级列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          schoolName?: string;
          gradeLevel?: string;
          className?: string;
        }
      | null;

    const schoolName = normalizeRequiredString(body?.schoolName);
    const gradeLevel = normalizeRequiredString(body?.gradeLevel);
    const className = normalizeRequiredString(body?.className);

    if (!schoolName || !gradeLevel || !className) {
      return NextResponse.json({ error: '请完整填写学校、年级和班级' }, { status: 400 });
    }

    const classroom = await createClassroomByAdmin({
      schoolName,
      gradeLevel,
      className,
    });

    return NextResponse.json({ classroom }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Classroom already exists' ? 409 : 500;

    console.error('Failed to create classroom:', error);
    return NextResponse.json(
      { error: status === 409 ? '班级已存在，请勿重复创建' : '创建班级失败' },
      { status }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          classroomId?: number | string;
          schoolName?: string;
          gradeLevel?: string;
          className?: string;
        }
      | null;

    const classroomId = Number(body?.classroomId);
    const schoolName = normalizeRequiredString(body?.schoolName);
    const gradeLevel = normalizeRequiredString(body?.gradeLevel);
    const className = normalizeRequiredString(body?.className);

    if (!Number.isInteger(classroomId) || classroomId <= 0) {
      return NextResponse.json({ error: '无效的班级 ID' }, { status: 400 });
    }

    if (!schoolName || !gradeLevel || !className) {
      return NextResponse.json({ error: '请完整填写学校、年级和班级' }, { status: 400 });
    }

    const classroom = await updateClassroomById(classroomId, {
      schoolName,
      gradeLevel,
      className,
    });

    return NextResponse.json({ classroom });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    let status = 500;
    let responseMessage = '更新班级失败';

    if (message === 'Classroom not found') {
      status = 404;
      responseMessage = '班级不存在';
    } else if (message === 'Classroom already exists') {
      status = 409;
      responseMessage = '已存在同名班级，请先确认是否重复';
    }

    console.error('Failed to update classroom:', error);
    return NextResponse.json({ error: responseMessage }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          classroomId?: number | string;
          action?: string;
        }
      | null;
    const classroomId = Number(body?.classroomId);
    const action = body?.action?.trim();

    if (!Number.isInteger(classroomId) || classroomId <= 0) {
      return NextResponse.json({ error: 'Invalid classroomId' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    let classroom;

    if (action === 'rotateClassCode') {
      classroom = await rotateClassroomCodeById(classroomId);
    } else if (action === 'disableClassCode') {
      classroom = await setClassroomCodeEnabledById(classroomId, false);
    } else if (action === 'enableClassCode') {
      classroom = await setClassroomCodeEnabledById(classroomId, true);
    } else {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    return NextResponse.json({ classroom });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Classroom not found' ? 404 : 500;

    console.error('Failed to update classroom code state:', error);
    return NextResponse.json({ error: status === 404 ? message : '更新班级编码失败' }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          classroomId?: number | string;
        }
      | null;
    const classroomId = Number(body?.classroomId);

    if (!Number.isInteger(classroomId) || classroomId <= 0) {
      return NextResponse.json({ error: '无效的班级 ID' }, { status: 400 });
    }

    await deleteClassroomById(classroomId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    let status = 500;
    let responseMessage = '删除班级失败';

    if (message === 'Classroom not found') {
      status = 404;
      responseMessage = '班级不存在';
    } else if (message === 'Classroom has members') {
      status = 409;
      responseMessage = '班级下还有老师或学生，请先调整成员关系后再删除';
    }

    console.error('Failed to delete classroom:', error);
    return NextResponse.json({ error: responseMessage }, { status });
  }
}
