import { NextRequest, NextResponse } from 'next/server';

import { getCurrentAccessContext } from '@/lib/access-context';
import { getAdminLessonCustomization } from '@/lib/directus-admin';
import { getModules } from '@/lib/directus';
import {
  getTeacherCurrentClassroomRoster,
  getTeacherCurrentClassroomSummary,
} from '@/lib/school-classroom';
import { listTeacherAssignmentSubmissions } from '@/lib/student-assignments';
import {
  listTeacherLessonPlanItems,
  listTeacherResources,
  listTeacherStudentAssignments,
  parseTeacherLessonCustomizationData,
} from '@/lib/teacher-plan';
import {
  hasScopedTeacherCapabilityAccess,
  listAccessibleScopedTeacherTargets,
} from '@/lib/teacher-capability-access';

export const dynamic = 'force-dynamic';

type ResearchPlanMode = 'assembled' | 'legacy' | 'empty';
type ResearchFocusLevel = 'warning' | 'info' | 'success';

type ResearchFocusItem = {
  key: string;
  title: string;
  description: string;
  level: ResearchFocusLevel;
  value: string;
};

type TeacherResearchModuleBoard = {
  moduleId: number;
  moduleIndex: number;
  moduleName: string;
  moduleType: string;
  standardResourceCount: number;
  standardAssignmentCount: number;
  assembledCount: number;
  standardAssembledCount: number;
  teacherAssembledCount: number;
  teacherResourceCount: number;
  teacherAssignmentCount: number;
  requiredAssignmentCount: number;
  pendingReviewCount: number;
  approvedSubmissionCount: number;
  rejectedSubmissionCount: number;
  missingSubmissionCount: number;
  overdueMissingSubmissionCount: number;
  needsAttention: boolean;
  attentionReasons: string[];
};

type TeacherResearchSummary = {
  lessonId: number | null;
  currentStudentCount: number;
  moduleCount: number;
  modulesWithAssembledContent: number;
  modulesWithAssignments: number;
  assembledItemCount: number;
  standardAssembledCount: number;
  teacherAssembledCount: number;
  teacherResourceCount: number;
  teacherAssignmentCount: number;
  requiredAssignmentCount: number;
  pendingReviewCount: number;
  approvedSubmissionCount: number;
  rejectedSubmissionCount: number;
  missingSubmissionCount: number;
  overdueMissingSubmissionCount: number;
  legacySelectionCount: number;
  emptyModuleCount: number;
  modulesNeedingAttention: number;
  planMode: ResearchPlanMode;
  usesLegacyFallback: boolean;
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

function parseStoredModuleConfig(value: string | null | undefined): Record<string, number[]> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized: Record<string, number[]> = {};
    for (const [moduleId, itemIds] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(itemIds)) {
        continue;
      }

      const validIds = itemIds
        .map((itemId) => Number(itemId))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0);

      if (validIds.length > 0) {
        normalized[moduleId] = validIds;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

function countSelections(input: Record<string, number[]>): number {
  return Object.values(input).reduce((total, entries) => total + entries.length, 0);
}

function buildDefaultResearchSummary(
  lessonId: number | null,
  currentStudentCount: number
): TeacherResearchSummary {
  return {
    lessonId,
    currentStudentCount,
    moduleCount: 0,
    modulesWithAssembledContent: 0,
    modulesWithAssignments: 0,
    assembledItemCount: 0,
    standardAssembledCount: 0,
    teacherAssembledCount: 0,
    teacherResourceCount: 0,
    teacherAssignmentCount: 0,
    requiredAssignmentCount: 0,
    pendingReviewCount: 0,
    approvedSubmissionCount: 0,
    rejectedSubmissionCount: 0,
    missingSubmissionCount: 0,
    overdueMissingSubmissionCount: 0,
    legacySelectionCount: 0,
    emptyModuleCount: 0,
    modulesNeedingAttention: 0,
    planMode: 'empty',
    usesLegacyFallback: false,
  };
}

function buildDefaultFocusItems(summary: TeacherResearchSummary): ResearchFocusItem[] {
  if (!summary.lessonId) {
    return [
      {
        key: 'select-lesson',
        title: '先选择课时',
        description: '当前还没有选定课时，暂时无法生成这节课的教研任务池。',
        level: 'info',
        value: '未选择',
      },
    ];
  }

  return [
    {
      key: 'empty-state',
      title: '当前课时暂无可分析内容',
      description: '这节课还没有读取到装配内容、作业要求或学生提交，先保留为空态。',
      level: 'info',
      value: `${summary.currentStudentCount} 人`,
    },
  ];
}

function formatModuleName(moduleIndex: number, moduleName: string): string {
  return `模块 ${moduleIndex} · ${moduleName}`;
}

function formatCountLabel(value: number, suffix: string): string {
  return `${value}${suffix}`;
}

async function buildResearchWorkbench(
  teacherUserId: string,
  lessonId: number,
  currentStudentCount: number
): Promise<{
  summary: TeacherResearchSummary;
  focusItems: ResearchFocusItem[];
  modules: TeacherResearchModuleBoard[];
}> {
  const [customization, planItems, teacherResources, teacherAssignments, lessonModules, submissions, roster] =
    await Promise.all([
      getAdminLessonCustomization(teacherUserId, lessonId),
      listTeacherLessonPlanItems(teacherUserId, lessonId),
      listTeacherResources(teacherUserId, { lessonId }),
      listTeacherStudentAssignments(teacherUserId, lessonId),
      getModules(lessonId),
      listTeacherAssignmentSubmissions(teacherUserId, lessonId),
      getTeacherCurrentClassroomRoster(teacherUserId),
    ]);

  const customizationData = parseTeacherLessonCustomizationData(customization?.custom_resources);
  const legacyModulesConfig = parseStoredModuleConfig(customization?.modules_config);
  const legacyTeacherSelections = customizationData.teacherSelections;
  const legacySelectionCount =
    countSelections(legacyModulesConfig) + countSelections(legacyTeacherSelections);
  const planMode: ResearchPlanMode =
    planItems.length > 0 ? 'assembled' : legacySelectionCount > 0 ? 'legacy' : 'empty';
  const rosterStudentIds = new Set((roster?.students || []).map((student) => student.userId));
  const submissionsByAssignment = new Map<string, typeof submissions>();
  const submissionsByModule = new Map<number, typeof submissions>();

  for (const submission of submissions) {
    const assignmentSubmissions = submissionsByAssignment.get(submission.assignment_key) || [];
    assignmentSubmissions.push(submission);
    submissionsByAssignment.set(submission.assignment_key, assignmentSubmissions);

    const moduleSubmissions = submissionsByModule.get(submission.module_id) || [];
    moduleSubmissions.push(submission);
    submissionsByModule.set(submission.module_id, moduleSubmissions);
  }

  const planItemsByModule = new Map<number, typeof planItems>();
  for (const planItem of planItems) {
    const existing = planItemsByModule.get(planItem.module_id) || [];
    existing.push(planItem);
    planItemsByModule.set(planItem.module_id, existing);
  }

  const teacherResourcesByModule = new Map<number, typeof teacherResources>();
  for (const teacherResource of teacherResources) {
    const existing = teacherResourcesByModule.get(teacherResource.module_id) || [];
    existing.push(teacherResource);
    teacherResourcesByModule.set(teacherResource.module_id, existing);
  }

  const teacherAssignmentsByModule = new Map<number, typeof teacherAssignments>();
  for (const teacherAssignment of teacherAssignments) {
    const existing = teacherAssignmentsByModule.get(teacherAssignment.module_id) || [];
    existing.push(teacherAssignment);
    teacherAssignmentsByModule.set(teacherAssignment.module_id, existing);
  }

  const modules = lessonModules.map<TeacherResearchModuleBoard>((module) => {
    const standardAssignments = (module.items || []).filter(
      (item) => typeof item.student_activity === 'string' && item.student_activity.trim().length > 0
    );
    const modulePlanItems = planItemsByModule.get(module.id) || [];
    const effectiveStandardAssembledCount =
      planMode === 'assembled'
        ? modulePlanItems.filter((item) => item.source_type === 'standard').length
        : (legacyModulesConfig[String(module.id)] || []).length;
    const effectiveTeacherAssembledCount =
      planMode === 'assembled'
        ? modulePlanItems.filter((item) => item.source_type === 'teacher_resource').length
        : (legacyTeacherSelections[String(module.id)] || []).length;
    const effectiveAssembledCount =
      effectiveStandardAssembledCount + effectiveTeacherAssembledCount;
    const moduleTeacherAssignments = teacherAssignmentsByModule.get(module.id) || [];
    const moduleTeacherResources = teacherResourcesByModule.get(module.id) || [];
    const moduleSubmissions = submissionsByModule.get(module.id) || [];

    let missingSubmissionCount = 0;
    let overdueMissingSubmissionCount = 0;

    for (const item of standardAssignments) {
      const assignmentKey = `standard:${item.id}`;
      const assignmentMetadata = customizationData.assignmentSettings[assignmentKey] || {
        dueAt: null,
        isRequired: true,
      };
      if (!assignmentMetadata.isRequired) {
        continue;
      }

      const submittedStudentIds = new Set(
        (submissionsByAssignment.get(assignmentKey) || []).map((submission) => submission.student_id)
      );
      const itemMissingCount = Array.from(rosterStudentIds).filter(
        (studentId) => !submittedStudentIds.has(studentId)
      ).length;
      missingSubmissionCount += itemMissingCount;

      if (
        assignmentMetadata.dueAt &&
        itemMissingCount > 0 &&
        new Date(assignmentMetadata.dueAt).getTime() < Date.now()
      ) {
        overdueMissingSubmissionCount += itemMissingCount;
      }
    }

    for (const assignment of moduleTeacherAssignments) {
      if (!assignment.is_required) {
        continue;
      }

      const assignmentKey = `teacher_custom:${assignment.id}`;
      const submittedStudentIds = new Set(
        (submissionsByAssignment.get(assignmentKey) || []).map((submission) => submission.student_id)
      );
      const assignmentMissingCount = Array.from(rosterStudentIds).filter(
        (studentId) => !submittedStudentIds.has(studentId)
      ).length;
      missingSubmissionCount += assignmentMissingCount;

      if (
        assignment.due_at &&
        assignmentMissingCount > 0 &&
        new Date(assignment.due_at).getTime() < Date.now()
      ) {
        overdueMissingSubmissionCount += assignmentMissingCount;
      }
    }

    const pendingReviewCount = moduleSubmissions.filter(
      (submission) => submission.review_status === 'pending'
    ).length;
    const approvedSubmissionCount = moduleSubmissions.filter(
      (submission) => submission.review_status === 'approved'
    ).length;
    const rejectedSubmissionCount = moduleSubmissions.filter(
      (submission) => submission.review_status === 'rejected'
    ).length;
    const requiredAssignmentCount =
      standardAssignments.filter((item) => {
        const metadata = customizationData.assignmentSettings[`standard:${item.id}`] || {
          dueAt: null,
          isRequired: true,
        };
        return metadata.isRequired;
      }).length + moduleTeacherAssignments.filter((assignment) => assignment.is_required).length;

    const attentionReasons: string[] = [];
    if (planMode === 'legacy' && effectiveAssembledCount > 0) {
      attentionReasons.push('当前课时还在走旧兼容配置，建议迁移到装配教案。');
    }
    if (effectiveAssembledCount === 0) {
      attentionReasons.push('当前模块还没有装配课堂内容。');
    }
    if (moduleTeacherResources.length > 0 && effectiveTeacherAssembledCount === 0) {
      attentionReasons.push('老师已上传私有资源，但还没有装进课堂。');
    }
    if (requiredAssignmentCount === 0) {
      attentionReasons.push('当前模块还没有需要跟踪的作业要求。');
    }
    if (overdueMissingSubmissionCount > 0) {
      attentionReasons.push('存在逾期未交，建议优先跟进。');
    }
    if (pendingReviewCount > 0) {
      attentionReasons.push('存在待审核提交，建议联动评审链路处理。');
    }

    return {
      moduleId: module.id,
      moduleIndex: module.module_index,
      moduleName: module.module_name,
      moduleType: module.module_type,
      standardResourceCount: (module.items || []).length,
      standardAssignmentCount: standardAssignments.length,
      assembledCount: effectiveAssembledCount,
      standardAssembledCount: effectiveStandardAssembledCount,
      teacherAssembledCount: effectiveTeacherAssembledCount,
      teacherResourceCount: moduleTeacherResources.length,
      teacherAssignmentCount: moduleTeacherAssignments.length,
      requiredAssignmentCount,
      pendingReviewCount,
      approvedSubmissionCount,
      rejectedSubmissionCount,
      missingSubmissionCount,
      overdueMissingSubmissionCount,
      needsAttention: attentionReasons.length > 0,
      attentionReasons,
    };
  });

  const summary = modules.reduce<TeacherResearchSummary>(
    (accumulator, module) => ({
      ...accumulator,
      moduleCount: accumulator.moduleCount + 1,
      modulesWithAssembledContent:
        accumulator.modulesWithAssembledContent + (module.assembledCount > 0 ? 1 : 0),
      modulesWithAssignments:
        accumulator.modulesWithAssignments + (module.requiredAssignmentCount > 0 ? 1 : 0),
      assembledItemCount: accumulator.assembledItemCount + module.assembledCount,
      standardAssembledCount:
        accumulator.standardAssembledCount + module.standardAssembledCount,
      teacherAssembledCount:
        accumulator.teacherAssembledCount + module.teacherAssembledCount,
      teacherResourceCount:
        accumulator.teacherResourceCount + module.teacherResourceCount,
      teacherAssignmentCount:
        accumulator.teacherAssignmentCount + module.teacherAssignmentCount,
      requiredAssignmentCount:
        accumulator.requiredAssignmentCount + module.requiredAssignmentCount,
      pendingReviewCount:
        accumulator.pendingReviewCount + module.pendingReviewCount,
      approvedSubmissionCount:
        accumulator.approvedSubmissionCount + module.approvedSubmissionCount,
      rejectedSubmissionCount:
        accumulator.rejectedSubmissionCount + module.rejectedSubmissionCount,
      missingSubmissionCount:
        accumulator.missingSubmissionCount + module.missingSubmissionCount,
      overdueMissingSubmissionCount:
        accumulator.overdueMissingSubmissionCount + module.overdueMissingSubmissionCount,
      emptyModuleCount: accumulator.emptyModuleCount + (module.assembledCount === 0 ? 1 : 0),
      modulesNeedingAttention:
        accumulator.modulesNeedingAttention + (module.needsAttention ? 1 : 0),
    }),
    {
      lessonId,
      currentStudentCount: roster?.studentCount || currentStudentCount,
      moduleCount: 0,
      modulesWithAssembledContent: 0,
      modulesWithAssignments: 0,
      assembledItemCount: 0,
      standardAssembledCount: 0,
      teacherAssembledCount: 0,
      teacherResourceCount: 0,
      teacherAssignmentCount: 0,
      requiredAssignmentCount: 0,
      pendingReviewCount: 0,
      approvedSubmissionCount: 0,
      rejectedSubmissionCount: 0,
      missingSubmissionCount: 0,
      overdueMissingSubmissionCount: 0,
      legacySelectionCount,
      emptyModuleCount: 0,
      modulesNeedingAttention: 0,
      planMode,
      usesLegacyFallback: planMode === 'legacy',
    }
  );

  const focusItems: ResearchFocusItem[] = [];

  if (summary.planMode === 'legacy') {
    focusItems.push({
      key: 'legacy-plan',
      title: '兼容层仍在承接课堂内容',
      description: '这节课还没有迁移到新的装配教案结构，后续课堂仍主要依赖旧 modules_config / teacherSelections 回退。',
      level: 'warning',
      value: formatCountLabel(summary.legacySelectionCount, ' 项'),
    });
  }

  if (summary.emptyModuleCount > 0) {
    focusItems.push({
      key: 'empty-modules',
      title: '模块装配还不完整',
      description: '至少有一个模块还没有装进课堂内容，当前模块工作台可以继续补充标准资源或老师私有资源。',
      level: 'warning',
      value: formatCountLabel(summary.emptyModuleCount, ' 个模块'),
    });
  }

  if (summary.overdueMissingSubmissionCount > 0) {
    focusItems.push({
      key: 'overdue-missing',
      title: '逾期未交需要优先跟进',
      description: '已经存在过截止时间仍未提交的作业，建议教研跟进该课时设计与作业难度。',
      level: 'warning',
      value: formatCountLabel(summary.overdueMissingSubmissionCount, ' 人次'),
    });
  }

  if (summary.pendingReviewCount > 0) {
    focusItems.push({
      key: 'pending-review',
      title: '评审链路仍有待处理提交',
      description: '这节课的学生作业里还有待审核结果，教研侧可以联动评审员确认标准是否清晰。',
      level: 'info',
      value: formatCountLabel(summary.pendingReviewCount, ' 份'),
    });
  }

  if (summary.teacherAssembledCount === 0 && summary.teacherResourceCount > 0) {
    focusItems.push({
      key: 'teacher-resources-unused',
      title: '老师私有资源还未进入课堂',
      description: '老师已经上传了私有资源，但这节课实际课堂装配里还没有把它们排进去。',
      level: 'info',
      value: formatCountLabel(summary.teacherResourceCount, ' 条资源'),
    });
  }

  if (focusItems.length === 0) {
    focusItems.push({
      key: 'healthy',
      title: '当前课时结构完整',
      description: '装配内容、作业要求和提交跟踪都已有落点，这节课更适合继续观察课堂效果与资源质量。',
      level: 'success',
      value: `${summary.modulesWithAssembledContent}/${summary.moduleCount || 0} 模块已覆盖`,
    });
  }

  return {
    summary,
    focusItems,
    modules: modules.map((module) => ({
      ...module,
      attentionReasons:
        module.attentionReasons.length > 0
          ? module.attentionReasons
          : [`${formatModuleName(module.moduleIndex, module.moduleName)} 当前状态稳定。`],
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await getCurrentAccessContext();
    if (!access || (!access.isTeacher && !access.isAdmin)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    if (!hasScopedTeacherCapabilityAccess(access, 'teaching-researcher')) {
      return NextResponse.json({ error: '当前账号没有教研工作台权限' }, { status: 403 });
    }

    const requestedTeacherUserId = parseTeacherUserId(
      request.nextUrl.searchParams.get('teacherUserId')
    );
    const lessonIdParam = request.nextUrl.searchParams.get('lessonId');
    const lessonId = lessonIdParam ? parsePositiveInt(lessonIdParam) : null;

    if (lessonIdParam && !lessonId) {
      return NextResponse.json({ error: '无效的课时 ID' }, { status: 400 });
    }

    const researchTargets = await listAccessibleScopedTeacherTargets(
      access,
      'teaching-researcher'
    );
    const activeTarget =
      (requestedTeacherUserId
        ? researchTargets.find((target) => target.userId === requestedTeacherUserId)
        : null) ||
      researchTargets.find((target) => target.userId === access.user.id) ||
      researchTargets[0] ||
      null;

    if (!activeTarget) {
      return NextResponse.json({ error: '没有可查看的教研范围' }, { status: 403 });
    }

    const classroom = await getTeacherCurrentClassroomSummary(activeTarget.userId);
    const workbench =
      lessonId
        ? await buildResearchWorkbench(
            activeTarget.userId,
            lessonId,
            classroom?.studentCount || 0
          )
        : {
            summary: buildDefaultResearchSummary(null, classroom?.studentCount || 0),
            focusItems: buildDefaultFocusItems(
              buildDefaultResearchSummary(null, classroom?.studentCount || 0)
            ),
            modules: [],
          };

    return NextResponse.json({
      classroom,
      researchTargets,
      activeTargetTeacherUserId: activeTarget.userId,
      activeTargetTeacher: activeTarget,
      summary: workbench.summary,
      focusItems: workbench.focusItems,
      modules: workbench.modules,
    });
  } catch (error) {
    console.error('Failed to load research workbench:', error);
    return NextResponse.json({ error: '获取教研工作台失败' }, { status: 500 });
  }
}
