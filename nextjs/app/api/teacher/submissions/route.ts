import { NextRequest, NextResponse } from 'next/server';
import {
  getCurrentAccessContext,
  type AccessContext,
} from '@/lib/access-context';
import { getAdminLessonCustomization } from '@/lib/directus-admin';
import { getModules } from '@/lib/directus';
import {
  getTeacherCurrentClassroomRoster,
  getTeacherCurrentClassroomSummary,
} from '@/lib/school-classroom';
import {
  listTeacherAssignmentSubmissions,
  reviewStudentAssignmentSubmissions,
  reviewStudentAssignmentSubmission,
} from '@/lib/student-assignments';
import {
  toStudentAssignmentReviewPhase,
  type StudentAssignmentReviewStatus,
} from '@/lib/student-assignment-review';
import { listTeacherStudentAssignments, parseTeacherLessonCustomizationData } from '@/lib/teacher-plan';
import {
  getAccessibleReviewTarget,
  listAccessibleReviewTargets,
} from '@/lib/reviewer-access';

type TeacherAssignmentSummaryRecord = {
  assignmentKey: string;
  assignmentSource: 'standard' | 'teacher_custom';
  moduleId: number;
  moduleName: string;
  moduleIndex: number;
  title: string;
  content: string;
  standardItemId: number | null;
  teacherAssignmentId: number | null;
  dueAt: string | null;
  isRequired: boolean;
  expectedStudentCount: number;
  submittedCount: number;
  missingCount: number;
  missingStudents: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
  }>;
  pendingCount: number;
  gradedCount: number;
  isOverdue: boolean;
};

type TeacherSubmissionSummary = {
  total: number;
  pending: number;
  graded: number;
  trackedAssignments: number;
  requiredAssignments: number;
  missingAssignments: number;
  missingSubmissions: number;
  overdueAssignments: number;
  overdueMissingSubmissions: number;
};

function buildTeacherSubmissionSummary(
  submissions: Array<{
    review_status: StudentAssignmentReviewStatus;
  }>,
  assignmentSummaries: TeacherAssignmentSummaryRecord[]
): TeacherSubmissionSummary {
  return {
    total: submissions.length,
    pending: submissions.filter((item) => item.review_status === 'pending').length,
    graded: submissions.filter((item) => item.review_status !== 'pending').length,
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
}

function buildTeacherTaskboard(
  lessonId: number,
  currentStudentCount: number,
  summary: TeacherSubmissionSummary
) {
  return {
    lessonId,
    source: 'lesson_submissions' as const,
    currentStudentCount,
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
    gradedSubmissions: summary.graded,
    approvedSubmissions: summary.graded,
    rejectedSubmissions: 0,
    summary,
  };
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export const dynamic = 'force-dynamic';

function parseTeacherUserId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildAccessPayload(access: AccessContext) {
  return {
    primaryRole: access.primaryRole,
    capabilityKeys: access.capabilityKeys,
    teacherProfile: access.teacherProfile,
    teacherCapabilities: access.teacherCapabilities,
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
      return NextResponse.json({ error: '没有可审核的老师范围' }, { status: 403 });
    }

    const lessonId = parsePositiveInt(request.nextUrl.searchParams.get('lessonId'));
    const moduleId = parsePositiveInt(request.nextUrl.searchParams.get('moduleId'));
    const reviewStatus = request.nextUrl.searchParams.get('reviewStatus');

    if (!lessonId) {
      return NextResponse.json({ error: '无效的课时 ID' }, { status: 400 });
    }

    const [submissions, modules, teacherAssignments, customization, roster] = await Promise.all([
      listTeacherAssignmentSubmissions(activeTarget.userId, lessonId),
      getModules(lessonId),
      listTeacherStudentAssignments(activeTarget.userId, lessonId),
      getAdminLessonCustomization(activeTarget.userId, lessonId),
      getTeacherCurrentClassroomRoster(activeTarget.userId),
    ]);
    const assignmentSettings =
      parseTeacherLessonCustomizationData(customization?.custom_resources).assignmentSettings;
    const teacherAssignmentMap = new Map(teacherAssignments.map((item) => [item.id, item]));
    const filtered = submissions.filter((submission) => {
      if (moduleId && submission.module_id !== moduleId) {
        return false;
      }

      if (reviewStatus && reviewStatus !== 'all' && reviewStatus !== 'missing') {
        if (reviewStatus === 'graded') {
          if (submission.review_status === 'pending') {
            return false;
          }
        } else if (submission.review_status !== reviewStatus) {
          return false;
        }
      }

      return true;
    });
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

    const allAssignmentSummaries: TeacherAssignmentSummaryRecord[] = [
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
            const missingStudents = assignmentMetadata.isRequired
              ? rosterStudents
                  .filter((student) => !submittedStudentIds.has(student.userId))
                  .map((student) => ({
                    studentId: student.userId,
                    studentName: student.name,
                    studentEmail: student.email || '',
                  }))
              : [];

            return {
              assignmentKey,
              assignmentSource: 'standard' as const,
              moduleId: module.id,
              moduleName: module.module_name,
              moduleIndex: module.module_index,
              title: item.title,
              content: item.student_activity?.trim() || '',
              standardItemId: item.id,
              teacherAssignmentId: null,
              dueAt: assignmentMetadata.dueAt,
              isRequired: assignmentMetadata.isRequired,
              expectedStudentCount: assignmentMetadata.isRequired ? rosterStudents.length : 0,
              submittedCount: submittedStudentIds.size,
              missingCount: missingStudents.length,
              missingStudents,
              pendingCount: assignmentSubmissions.filter((submission) => submission.review_status === 'pending').length,
              gradedCount: assignmentSubmissions.filter((submission) => submission.review_status !== 'pending').length,
              isOverdue:
                Boolean(assignmentMetadata.dueAt) &&
                assignmentMetadata.isRequired &&
                missingStudents.length > 0 &&
                new Date(assignmentMetadata.dueAt as string).getTime() < Date.now(),
            };
          })
      ),
      ...teacherAssignments.map((assignment) => {
        const assignmentKey = `teacher_custom:${assignment.id}`;
        const assignmentSubmissions = submissionsByAssignment.get(assignmentKey) || [];
        const submittedStudentIds = new Set(assignmentSubmissions.map((submission) => submission.student_id));
        const missingStudents = assignment.is_required
          ? rosterStudents
              .filter((student) => !submittedStudentIds.has(student.userId))
              .map((student) => ({
                studentId: student.userId,
                studentName: student.name,
                studentEmail: student.email || '',
              }))
          : [];
        const moduleInfo = moduleMap.get(assignment.module_id);

        return {
          assignmentKey,
          assignmentSource: 'teacher_custom' as const,
          moduleId: assignment.module_id,
          moduleName: moduleInfo?.moduleName || `模块 ${assignment.module_id}`,
          moduleIndex: moduleInfo?.moduleIndex || assignment.module_id,
          title: assignment.title,
          content: assignment.description,
          standardItemId: null,
          teacherAssignmentId: assignment.id,
          dueAt: assignment.due_at,
          isRequired: assignment.is_required,
          expectedStudentCount: assignment.is_required ? rosterStudents.length : 0,
          submittedCount: submittedStudentIds.size,
          missingCount: missingStudents.length,
          missingStudents,
          pendingCount: assignmentSubmissions.filter((submission) => submission.review_status === 'pending').length,
          gradedCount: assignmentSubmissions.filter((submission) => submission.review_status !== 'pending').length,
          isOverdue:
            Boolean(assignment.due_at) &&
            assignment.is_required &&
            missingStudents.length > 0 &&
            new Date(assignment.due_at as string).getTime() < Date.now(),
        };
      }),
    ]
      .sort((left, right) => {
        if (left.moduleIndex !== right.moduleIndex) {
          return left.moduleIndex - right.moduleIndex;
        }

        return left.title.localeCompare(right.title, 'zh-Hans-CN');
      });

    const assignmentSummaries = allAssignmentSummaries
      .filter((assignment) => !moduleId || assignment.moduleId === moduleId)
      .filter((assignment) => (reviewStatus === 'missing' ? assignment.missingCount > 0 : true))
      .sort((left, right) => {
        if (left.moduleIndex !== right.moduleIndex) {
          return left.moduleIndex - right.moduleIndex;
        }

        return left.title.localeCompare(right.title, 'zh-Hans-CN');
      });

    const summary = buildTeacherSubmissionSummary(filtered, assignmentSummaries);
    const lessonWideSummary = buildTeacherSubmissionSummary(submissions, allAssignmentSummaries);
    const taskboard = buildTeacherTaskboard(lessonId, roster?.studentCount || rosterStudents.length, lessonWideSummary);
    const classroom = await getTeacherCurrentClassroomSummary(activeTarget.userId);

    return NextResponse.json({
      submissions: filtered.map((submission) => ({
        id: submission.id,
        studentId: submission.student_id,
        studentName: submission.studentName,
        studentEmail: submission.studentEmail,
        lessonId: submission.lesson_id,
        moduleId: submission.module_id,
        moduleName: submission.moduleName,
        moduleIndex: submission.moduleIndex,
        assignmentKey: submission.assignment_key,
        assignmentSource: submission.assignment_source,
        assignmentTitle: submission.assignmentTitle,
        assignmentContent: submission.assignmentContent,
        dueAt:
          submission.assignment_source === 'standard'
            ? assignmentSettings[submission.assignment_key]?.dueAt || null
            : teacherAssignmentMap.get(submission.teacher_assignment_id || 0)?.due_at || null,
        isRequired:
          submission.assignment_source === 'standard'
            ? assignmentSettings[submission.assignment_key]?.isRequired ?? true
            : teacherAssignmentMap.get(submission.teacher_assignment_id || 0)?.is_required ?? true,
        responseText: submission.response_text,
        isCompleted: submission.is_completed,
        completedAt: submission.completed_at,
        reviewStatus: toStudentAssignmentReviewPhase(submission.review_status),
        teacherReviewNote: submission.teacher_review_note,
        teacherScore: submission.teacher_score,
        reviewedAt: submission.reviewed_at,
        attachments: submission.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.file_name,
          fileUrl: attachment.file_url,
          mimeType: attachment.mime_type,
          itemType: attachment.item_type,
          size: attachment.file_size,
        })),
      })),
      summary,
      assignmentSummaries,
      taskboard,
      classroom,
      reviewTargets,
      activeTargetTeacherUserId: activeTarget.userId,
      activeTargetTeacher: activeTarget,
      access: buildAccessPayload(access),
    });
  } catch (error) {
    console.error('Failed to load teacher assignment submissions:', error);
    return NextResponse.json({ error: '获取学生作业失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await getCurrentAccessContext();
    if (!access || (!access.isTeacher && !access.isAdmin)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    const currentUser = access.user;

    const body = (await request.json()) as {
      submissionId?: string;
      submissionIds?: string[];
      teacherUserId?: string;
      teacherScore?: number;
      teacherReviewNote?: string;
    };
    const requestedTargetTeacherUserId =
      parseTeacherUserId(body.teacherUserId ?? null) || currentUser.id;
    let activeTarget = await getAccessibleReviewTarget(
      access,
      requestedTargetTeacherUserId
    );

    if (!activeTarget) {
      const reviewTargets = await listAccessibleReviewTargets(access);
      activeTarget = reviewTargets[0] || null;
    }

    if (!activeTarget) {
      return NextResponse.json({ error: '没有该老师的审核权限' }, { status: 403 });
    }

    const submissionIds = Array.from(
      new Set(
        [
          ...(Array.isArray(body.submissionIds) ? body.submissionIds : []),
          ...(typeof body.submissionId === 'string' ? [body.submissionId] : []),
        ]
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );

    const normalizedTeacherScore =
      typeof body.teacherScore === 'number' && Number.isInteger(body.teacherScore)
        ? body.teacherScore
        : Number.NaN;
    const normalizedTeacherReviewNote = (body.teacherReviewNote || '').trim();

    if (
      submissionIds.length === 0 ||
      !Number.isInteger(normalizedTeacherScore) ||
      normalizedTeacherScore < 0 ||
      normalizedTeacherScore > 100 ||
      normalizedTeacherReviewNote.length === 0
    ) {
      return NextResponse.json({ error: '无效的评分参数' }, { status: 400 });
    }

    if (submissionIds.length === 1 && !Array.isArray(body.submissionIds)) {
      const submission = await reviewStudentAssignmentSubmission({
        ownerTeacherAuthUserId: activeTarget.userId,
        reviewerAuthUserId: currentUser.id,
        submissionId: submissionIds[0],
        teacherScore: normalizedTeacherScore,
        teacherReviewNote: normalizedTeacherReviewNote,
      });

      return NextResponse.json({
        submission: {
          id: submission.id,
          reviewStatus: toStudentAssignmentReviewPhase(submission.review_status),
          teacherReviewNote: submission.teacher_review_note,
          teacherScore: submission.teacher_score,
          reviewedAt: submission.reviewed_at,
        },
        access: buildAccessPayload(access),
      });
    }

    const submissions = await reviewStudentAssignmentSubmissions({
      ownerTeacherAuthUserId: activeTarget.userId,
      reviewerAuthUserId: currentUser.id,
      submissionIds,
      teacherScore: normalizedTeacherScore,
      teacherReviewNote: normalizedTeacherReviewNote,
    });

    return NextResponse.json({
      submissions: submissions.map((submission) => ({
        id: submission.id,
        reviewStatus: toStudentAssignmentReviewPhase(submission.review_status),
        teacherReviewNote: submission.teacher_review_note,
        teacherScore: submission.teacher_score,
        reviewedAt: submission.reviewed_at,
      })),
      updatedCount: submissions.length,
      requestedCount: submissionIds.length,
      access: buildAccessPayload(access),
    });
  } catch (error) {
    console.error('Failed to grade student assignment submission:', error);
    if (error instanceof Error) {
      if (error.message === 'No submission IDs provided') {
        return NextResponse.json({ error: '无效的评分参数' }, { status: 400 });
      }

      if (
        error.message === 'Submission not found' ||
        error.message === 'Some submissions were not found'
      ) {
        return NextResponse.json(
          { error: '提交记录不存在，或不属于当前老师' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ error: '保存学生作业评分失败' }, { status: 500 });
  }
}
