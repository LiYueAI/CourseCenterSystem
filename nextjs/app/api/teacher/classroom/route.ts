import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCurrentAccessContext } from '@/lib/access-context';
import { getAdminLessonCustomization } from '@/lib/directus-admin';
import { getModules } from '@/lib/directus';
import {
  getTeacherCurrentClassroomRoster,
  getTeacherCurrentClassroomSummary,
  rotateTeacherCurrentClassroomCode,
  setTeacherCurrentClassCode,
  setTeacherCurrentClassroomCodeEnabled,
} from '@/lib/school-classroom';
import { listTeacherAssignmentSubmissions } from '@/lib/student-assignments';
import { listTeacherStudentAssignments, parseTeacherLessonCustomizationData } from '@/lib/teacher-plan';
import {
  listAccessibleReviewTargets,
} from '@/lib/reviewer-access';

export const dynamic = 'force-dynamic';

type TeacherTaskboard = {
  lessonId: number | null;
  source: 'lesson_submissions' | 'classroom_only';
  currentStudentCount: number;
  pendingReviewCount: number;
  pendingReviews: number;
  estimatedMissingSubmissions: number;
  missingSubmissions: number;
  overdueMissingSubmissions: number;
  trackedAssignments: number;
  requiredAssignments: number;
  missingAssignments: number;
  overdueAssignments: number;
  totalSubmissions: number;
  approvedSubmissions: number;
  rejectedSubmissions: number;
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    trackedAssignments: number;
    requiredAssignments: number;
    missingAssignments: number;
    missingSubmissions: number;
    overdueAssignments: number;
    overdueMissingSubmissions: number;
  };
};

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTeacherUserId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildDefaultTaskboard(lessonId: number | null, currentStudentCount: number): TeacherTaskboard {
  const summary = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    trackedAssignments: 0,
    requiredAssignments: 0,
    missingAssignments: 0,
    missingSubmissions: 0,
    overdueAssignments: 0,
    overdueMissingSubmissions: 0,
  };

  return {
    lessonId,
    source: lessonId ? 'lesson_submissions' : 'classroom_only',
    currentStudentCount,
    pendingReviewCount: 0,
    pendingReviews: 0,
    estimatedMissingSubmissions: 0,
    missingSubmissions: 0,
    overdueMissingSubmissions: 0,
    trackedAssignments: 0,
    requiredAssignments: 0,
    missingAssignments: 0,
    overdueAssignments: 0,
    totalSubmissions: 0,
    approvedSubmissions: 0,
    rejectedSubmissions: 0,
    summary,
  };
}

async function buildLessonTaskboard(
  teacherUserId: string,
  lessonId: number,
  currentStudentCount: number
): Promise<TeacherTaskboard> {
  const [submissions, modules, teacherAssignments, customization, roster] = await Promise.all([
    listTeacherAssignmentSubmissions(teacherUserId, lessonId),
    getModules(lessonId),
    listTeacherStudentAssignments(teacherUserId, lessonId),
    getAdminLessonCustomization(teacherUserId, lessonId),
    getTeacherCurrentClassroomRoster(teacherUserId),
  ]);

  const assignmentSettings =
    parseTeacherLessonCustomizationData(customization?.custom_resources).assignmentSettings;
  const rosterStudents = roster?.students || [];
  const moduleMap = new Map(
    modules.map((module) => [
      module.id,
      {
        moduleName: module.module_name,
        moduleIndex: module.module_index,
      },
    ])
  );
  const submissionsByAssignment = new Map<string, typeof submissions>();

  for (const submission of submissions) {
    const existing = submissionsByAssignment.get(submission.assignment_key) || [];
    existing.push(submission);
    submissionsByAssignment.set(submission.assignment_key, existing);
  }

  const assignmentSummaries = [
    ...modules.flatMap((module) =>
      (module.items || [])
        .filter((item) => typeof item.student_activity === 'string' && item.student_activity.trim().length > 0)
        .map((item) => {
          const assignmentKey = `standard:${item.id}`;
          const assignmentSubmissions = submissionsByAssignment.get(assignmentKey) || [];
          const submittedStudentIds = new Set(assignmentSubmissions.map((submission) => submission.student_id));
          const assignmentMetadata = assignmentSettings[assignmentKey] || {
            dueAt: null,
            isRequired: true,
          };
          const missingCount = assignmentMetadata.isRequired
            ? rosterStudents.filter((student) => !submittedStudentIds.has(student.userId)).length
            : 0;

          return {
            isRequired: assignmentMetadata.isRequired,
            missingCount,
            isOverdue:
              Boolean(assignmentMetadata.dueAt) &&
              assignmentMetadata.isRequired &&
              missingCount > 0 &&
              new Date(assignmentMetadata.dueAt as string).getTime() < Date.now(),
          };
        })
    ),
    ...teacherAssignments.map((assignment) => {
      const assignmentKey = `teacher_custom:${assignment.id}`;
      const assignmentSubmissions = submissionsByAssignment.get(assignmentKey) || [];
      const submittedStudentIds = new Set(assignmentSubmissions.map((submission) => submission.student_id));
      const missingCount = assignment.is_required
        ? rosterStudents.filter((student) => !submittedStudentIds.has(student.userId)).length
        : 0;
      const moduleInfo = moduleMap.get(assignment.module_id);

      return {
        isRequired: assignment.is_required,
        missingCount,
        isOverdue:
          Boolean(assignment.due_at) &&
          assignment.is_required &&
          missingCount > 0 &&
          new Date(assignment.due_at as string).getTime() < Date.now(),
        moduleIndex: moduleInfo?.moduleIndex || assignment.module_id,
      };
    }),
  ];

  const summary = {
    total: submissions.length,
    pending: submissions.filter((item) => item.review_status === 'pending').length,
    approved: submissions.filter((item) => item.review_status === 'approved').length,
    rejected: submissions.filter((item) => item.review_status === 'rejected').length,
    trackedAssignments: assignmentSummaries.length,
    requiredAssignments: assignmentSummaries.filter((item) => item.isRequired).length,
    missingAssignments: assignmentSummaries.filter((item) => item.missingCount > 0).length,
    missingSubmissions: assignmentSummaries.reduce((sum, item) => sum + item.missingCount, 0),
    overdueAssignments: assignmentSummaries.filter((item) => item.isOverdue).length,
    overdueMissingSubmissions: assignmentSummaries.reduce(
      (sum, item) => sum + (item.isOverdue ? item.missingCount : 0),
      0
    ),
  };

  return {
    lessonId,
    source: 'lesson_submissions',
    currentStudentCount: roster?.studentCount || currentStudentCount,
    pendingReviewCount: summary.pending,
    pendingReviews: summary.pending,
    estimatedMissingSubmissions: summary.missingSubmissions,
    missingSubmissions: summary.missingSubmissions,
    overdueMissingSubmissions: summary.overdueMissingSubmissions,
    trackedAssignments: summary.trackedAssignments,
    requiredAssignments: summary.requiredAssignments,
    missingAssignments: summary.missingAssignments,
    overdueAssignments: summary.overdueAssignments,
    totalSubmissions: summary.total,
    approvedSubmissions: summary.approved,
    rejectedSubmissions: summary.rejected,
    summary,
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await getCurrentAccessContext();
    if (!access || (!access.isTeacher && !access.isAdmin)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    const currentUser = access.user;
    const requestedTeacherUserId = parseTeacherUserId(
      request.nextUrl.searchParams.get('teacherUserId')
    );
    const reviewTargets = await listAccessibleReviewTargets(access);
    const activeTarget =
      (requestedTeacherUserId
        ? reviewTargets.find((target) => target.userId === requestedTeacherUserId)
        : null) ||
      reviewTargets.find((target) => target.userId === currentUser.id) ||
      reviewTargets[0] ||
      null;

    if (!activeTarget) {
      return NextResponse.json({ error: '没有可查看的老师范围' }, { status: 403 });
    }

    const lessonIdParam = request.nextUrl.searchParams.get('lessonId');
    const lessonId = lessonIdParam ? parsePositiveInt(lessonIdParam) : null;

    if (lessonIdParam && !lessonId) {
      return NextResponse.json({ error: '无效的课时 ID' }, { status: 400 });
    }

    const classroom = await getTeacherCurrentClassroomSummary(activeTarget.userId);
    const taskboard =
      lessonId && classroom
        ? await buildLessonTaskboard(activeTarget.userId, lessonId, classroom.studentCount)
        : buildDefaultTaskboard(lessonId, classroom?.studentCount || 0);

    return NextResponse.json({
      classroom,
      taskboard,
      reviewTargets,
      activeTargetTeacherUserId: activeTarget.userId,
      activeTargetTeacher: activeTarget,
    });
  } catch (error) {
    console.error('Failed to load teacher classroom summary:', error);
    return NextResponse.json({ error: '获取当前班级失败' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          action?: string;
          classCode?: string;
        }
      | null;
    const action = body?.action?.trim();

    if (!action) {
      return NextResponse.json({ error: '缺少操作类型' }, { status: 400 });
    }

    let classroom = null;

    if (action === 'setClassCode') {
      const classCode = body?.classCode?.trim() || '';
      if (!classCode) {
        return NextResponse.json({ error: '请填写班级编码' }, { status: 400 });
      }
      classroom = await setTeacherCurrentClassCode(currentUser.id, classCode);
    } else if (action === 'rotateClassCode') {
      classroom = await rotateTeacherCurrentClassroomCode(currentUser.id);
    } else if (action === 'disableClassCode') {
      classroom = await setTeacherCurrentClassroomCodeEnabled(currentUser.id, false);
    } else if (action === 'enableClassCode') {
      classroom = await setTeacherCurrentClassroomCodeEnabled(currentUser.id, true);
    } else {
      return NextResponse.json({ error: '不支持的操作类型' }, { status: 400 });
    }

    if (!classroom) {
      return NextResponse.json({ error: '当前老师未绑定主班级' }, { status: 404 });
    }

    return NextResponse.json({ classroom });
  } catch (error) {
    console.error('Failed to update teacher classroom code state:', error);
    if (error instanceof Error && error.message === 'Invalid classroom code format') {
      return NextResponse.json(
        { error: '班级编码需为 16 位，仅支持大写字母和数字，且不含 0、1、4、I、O' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: '更新班级编码失败' }, { status: 500 });
  }
}
