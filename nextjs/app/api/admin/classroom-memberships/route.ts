import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listStudentClassroomMemberships,
  listTeacherClassroomMemberships,
  reassignStudentToClassroom,
  reassignTeacherToClassroom,
} from '@/lib/school-classroom';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [students, teachers] = await Promise.all([
      listStudentClassroomMemberships(),
      listTeacherClassroomMemberships(),
    ]);

    return NextResponse.json({
      students,
      teachers,
    });
  } catch (error) {
    console.error('Failed to load classroom memberships:', error);
    return NextResponse.json({ error: '获取当前关系失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      targetType?: 'student' | 'teacher';
      userId?: string;
      classCode?: string;
    };

    if (
      !body ||
      !['student', 'teacher'].includes(body.targetType || '') ||
      typeof body.userId !== 'string' ||
      body.userId.length === 0 ||
      typeof body.classCode !== 'string' ||
      body.classCode.trim().length === 0
    ) {
      return NextResponse.json({ error: '无效的调整参数' }, { status: 400 });
    }

    if (body.targetType === 'student') {
      const updated = await reassignStudentToClassroom({
        studentUserId: body.userId,
        classCode: body.classCode,
      });

      return NextResponse.json({ success: true, updated });
    }

    const updated = await reassignTeacherToClassroom({
      teacherUserId: body.userId,
      classCode: body.classCode,
    });

    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    if (error.message === 'Classroom code not found') {
      return NextResponse.json({ error: '班级编码不存在' }, { status: 400 });
    }
    if (error.message === 'Student not found' || error.message === 'Teacher not found') {
      return NextResponse.json({ error: '目标账号不存在' }, { status: 404 });
    }

    console.error('Failed to update classroom membership:', error);
    return NextResponse.json({ error: '调整当前关系失败' }, { status: 500 });
  }
}
