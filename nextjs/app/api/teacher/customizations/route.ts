import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAdminLessonCustomization,
  getAdminModuleItem,
  upsertAdminLessonCustomization,
} from "@/lib/directus-admin";
import {
  createTeacherLessonPlanTemplate,
  getAccessibleTeacherResource,
  listSharedTeacherResources,
  listTeacherLessonPlanItems,
  listTeacherLessonPlanTemplates,
  listTeacherStudentAssignments,
  listTeacherResources,
  normalizeTeacherAssignmentDueAt,
  normalizeTeacherAssignmentIsRequired,
  parseTeacherLessonCustomizationData,
  replaceTeacherLessonPlanItems,
  replaceTeacherStudentAssignments,
  serializeTeacherLessonCustomizationData,
  type CreateTeacherLessonPlanTemplateInput,
  type TeacherLessonPlanItemInput,
  type TeacherLessonPlanItemRecord,
  type TeacherLessonAssignmentSettingsMap,
  type TeacherLessonPlanTemplateRecord,
  type TeacherStudentAssignmentInput,
  type TeacherStudentAssignmentRecord,
} from "@/lib/teacher-plan";
import { resolveAssetUrl } from "@/lib/media-url";

export const dynamic = "force-dynamic";

function parseLessonId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isModuleConfig(value: unknown): value is Record<string, number[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (ids) =>
      Array.isArray(ids) && ids.every((id) => Number.isInteger(id) && id > 0),
  );
}

function parseStoredModuleConfig(
  value: string | null | undefined,
): Record<string, number[]> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isModuleConfig(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

type PlanItemPayload = {
  moduleId?: number;
  sourceType: "standard" | "teacher_resource";
  sourceId: number;
  sortOrder?: number;
  isPrimary?: boolean;
};

type StudentAssignmentPayload = {
  id?: number;
  moduleId: number;
  title: string;
  description?: string;
  dueAt?: string | null;
  isRequired?: boolean;
  sortOrder?: number;
};

function isPlanItemPayload(value: unknown): value is PlanItemPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.sourceType === "standard" ||
      candidate.sourceType === "teacher_resource") &&
    Number.isInteger(candidate.sourceId) &&
    Number(candidate.sourceId) > 0 &&
    (candidate.moduleId === undefined ||
      (Number.isInteger(candidate.moduleId) &&
        Number(candidate.moduleId) > 0)) &&
    (candidate.sortOrder === undefined ||
      (Number.isInteger(candidate.sortOrder) &&
        Number(candidate.sortOrder) > 0)) &&
    (candidate.isPrimary === undefined ||
      typeof candidate.isPrimary === "boolean")
  );
}

function isStudentAssignmentPayload(
  value: unknown,
): value is StudentAssignmentPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.id === undefined ||
      (Number.isInteger(candidate.id) && Number(candidate.id) > 0)) &&
    Number.isInteger(candidate.moduleId) &&
    Number(candidate.moduleId) > 0 &&
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0 &&
    (candidate.description === undefined ||
      typeof candidate.description === "string") &&
    (candidate.dueAt === undefined ||
      candidate.dueAt === null ||
      typeof candidate.dueAt === "string") &&
    (candidate.isRequired === undefined ||
      typeof candidate.isRequired === "boolean") &&
    (candidate.sortOrder === undefined ||
      (Number.isInteger(candidate.sortOrder) &&
        Number(candidate.sortOrder) > 0)) &&
    (candidate.isPrimary === undefined ||
      typeof candidate.isPrimary === "boolean")
  );
}

function toClientPlanItem(item: TeacherLessonPlanItemRecord) {
  return {
    ...item,
    sourceId:
      item.source_type === "standard"
        ? item.standard_item_id
        : item.teacher_resource_id,
    lessonId: item.lesson_id,
    moduleId: item.module_id,
    sourceType: item.source_type,
    sourceItemId: item.standard_item_id,
    teacherResourceId: item.teacher_resource_id,
    itemType: item.item_type,
    fileUrl: resolveAssetUrl(item.file_url),
    sortOrder: item.sort_order,
    isPrimary: Boolean(item.is_primary),
  };
}

function toClientTeacherAssignment(item: TeacherStudentAssignmentRecord) {
  return {
    ...item,
    moduleId: item.module_id,
    lessonId: item.lesson_id,
    dueAt: item.due_at,
    isRequired: item.is_required,
    sortOrder: item.sort_order,
  };
}

function toClientTeacherResource<T extends { file_url?: string | null }>(
  resource: T,
): T & { file_url: string; miniappMount: unknown } {
  return {
    ...resource,
    file_url: resolveAssetUrl(resource.file_url),
    miniappMount:
      "miniAppMount" in resource
        ? ((resource as T & { miniAppMount?: unknown }).miniAppMount ?? null)
        : null,
  };
}

function buildTeacherResourceMountMap(
  teacherResources: Array<{ id: number; miniAppMount?: unknown }>,
): Map<number, unknown> {
  return new Map(
    teacherResources.map((resource) => [
      resource.id,
      resource.miniAppMount ?? null,
    ]),
  );
}

function toClientPlanItemWithMount(
  item: TeacherLessonPlanItemRecord,
  teacherResourceMountById: Map<number, unknown>,
) {
  const miniAppMount =
    item.source_type === "teacher_resource" && item.teacher_resource_id
      ? (teacherResourceMountById.get(item.teacher_resource_id) ?? null)
      : null;

  return {
    ...toClientPlanItem(item),
    miniAppMount,
    miniappMount: miniAppMount,
  };
}

function parseTeacherSelectionsPayload(
  value: unknown,
): Record<string, number[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const candidate =
    raw.teacherSelections &&
    typeof raw.teacherSelections === "object" &&
    !Array.isArray(raw.teacherSelections)
      ? (raw.teacherSelections as Record<string, unknown>)
      : raw;

  const teacherSelections: Record<string, number[]> = {};
  for (const [moduleId, ids] of Object.entries(candidate)) {
    if (!Array.isArray(ids)) {
      continue;
    }

    const normalizedIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (normalizedIds.length > 0) {
      teacherSelections[moduleId] = normalizedIds;
    }
  }

  return teacherSelections;
}

function parseAssignmentSettingsPayload(
  value: unknown,
): TeacherLessonAssignmentSettingsMap {
  if (Array.isArray(value)) {
    const normalized: TeacherLessonAssignmentSettingsMap = {};
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.assignmentKey !== "string" ||
        candidate.assignmentKey.trim().length === 0
      ) {
        continue;
      }

      normalized[candidate.assignmentKey.trim()] = {
        dueAt: normalizeTeacherAssignmentDueAt(
          candidate.dueAt ?? candidate.due_at ?? null,
        ),
        isRequired: normalizeTeacherAssignmentIsRequired(
          candidate.isRequired ?? candidate.is_required ?? true,
        ),
      };
    }

    return normalized;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: TeacherLessonAssignmentSettingsMap = {};
  for (const [assignmentKey, metadata] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      !assignmentKey.startsWith("standard:") &&
      !assignmentKey.startsWith("teacher_custom:")
    ) {
      continue;
    }

    const candidate =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};

    normalized[assignmentKey] = {
      dueAt: normalizeTeacherAssignmentDueAt(
        candidate.dueAt ?? candidate.due_at ?? null,
      ),
      isRequired: normalizeTeacherAssignmentIsRequired(
        candidate.isRequired ?? candidate.is_required ?? true,
      ),
    };
  }

  return normalized;
}

function splitAssignmentSettingsBySource(
  input: TeacherLessonAssignmentSettingsMap,
): {
  standard: TeacherLessonAssignmentSettingsMap;
  teacherCustom: TeacherLessonAssignmentSettingsMap;
} {
  const standard: TeacherLessonAssignmentSettingsMap = {};
  const teacherCustom: TeacherLessonAssignmentSettingsMap = {};

  for (const [assignmentKey, metadata] of Object.entries(input)) {
    if (assignmentKey.startsWith("standard:")) {
      standard[assignmentKey] = metadata;
      continue;
    }

    if (assignmentKey.startsWith("teacher_custom:")) {
      teacherCustom[assignmentKey] = metadata;
    }
  }

  return { standard, teacherCustom };
}

function buildAssignmentSettingsResponse(
  standardAssignmentSettings: TeacherLessonAssignmentSettingsMap,
  teacherAssignments: TeacherStudentAssignmentRecord[],
): TeacherLessonAssignmentSettingsMap {
  const combined: TeacherLessonAssignmentSettingsMap = {
    ...standardAssignmentSettings,
  };

  for (const assignment of teacherAssignments) {
    combined[`teacher_custom:${assignment.id}`] = {
      dueAt: assignment.due_at,
      isRequired: assignment.is_required,
    };
  }

  return combined;
}

function shouldIncludeTemplates(request: NextRequest): boolean {
  const value =
    request.nextUrl.searchParams.get("includeTemplates") ??
    request.nextUrl.searchParams.get("templates");

  return value === "1" || value === "true";
}

function toTemplatePlanItemInput(
  item: TeacherLessonPlanItemRecord,
): TeacherLessonPlanItemInput {
  return {
    module_id: item.module_id,
    source_type: item.source_type,
    standard_item_id: item.standard_item_id,
    teacher_resource_id: item.teacher_resource_id,
    title: item.title,
    item_type: item.item_type,
    file_url: item.file_url || null,
    duration: item.duration || 0,
    sort_order: item.sort_order,
  };
}

function toTemplateStudentAssignmentInput(
  item: TeacherStudentAssignmentRecord,
): TeacherStudentAssignmentInput {
  return {
    module_id: item.module_id,
    title: item.title,
    description: item.description,
    due_at: item.due_at,
    is_required: item.is_required,
    sort_order: item.sort_order,
  };
}

function buildPlanStateFromSavedItems(items: TeacherLessonPlanItemRecord[]): {
  assembledItems: TeacherLessonPlanItemInput[];
  modulesConfig: Record<string, number[]>;
  teacherSelections: Record<string, number[]>;
} {
  const modulesConfig: Record<string, number[]> = {};
  const teacherSelections: Record<string, number[]> = {};

  for (const item of items) {
    if (item.source_type === "standard" && item.standard_item_id) {
      const moduleKey = String(item.module_id);
      if (!modulesConfig[moduleKey]) {
        modulesConfig[moduleKey] = [];
      }
      modulesConfig[moduleKey].push(item.standard_item_id);
    }

    if (item.source_type === "teacher_resource" && item.teacher_resource_id) {
      const moduleKey = String(item.module_id);
      if (!teacherSelections[moduleKey]) {
        teacherSelections[moduleKey] = [];
      }
      teacherSelections[moduleKey].push(item.teacher_resource_id);
    }
  }

  return {
    assembledItems: items.map(toTemplatePlanItemInput),
    modulesConfig,
    teacherSelections,
  };
}

function toClientTemplate(template: TeacherLessonPlanTemplateRecord) {
  const planItems = Array.isArray(template.plan_items)
    ? template.plan_items
    : [];
  const studentAssignments = Array.isArray(template.student_assignments)
    ? template.student_assignments
    : [];
  const assignmentSettings =
    template.assignment_settings &&
    typeof template.assignment_settings === "object"
      ? template.assignment_settings
      : {};

  return {
    id: template.id,
    title: template.title,
    sourceLessonId: template.source_lesson_id,
    planItems,
    studentAssignments,
    assignmentSettings,
    planItemCount: planItems.length,
    studentAssignmentCount: studentAssignments.length,
    createdAt: template.created_at ?? null,
    updatedAt: template.updated_at ?? null,
  };
}

async function buildPlanItemsForSave(
  authUserId: string,
  planItems: PlanItemPayload[],
): Promise<{
  assembledItems: TeacherLessonPlanItemInput[];
  modulesConfig: Record<string, number[]>;
  teacherSelections: Record<string, number[]>;
}> {
  const assembledItems: TeacherLessonPlanItemInput[] = [];
  const modulesConfig: Record<string, number[]> = {};
  const teacherSelections: Record<string, number[]> = {};

  const sortedItems = [...planItems].sort(
    (left, right) => (left.sortOrder || 0) - (right.sortOrder || 0),
  );

  for (let index = 0; index < sortedItems.length; index += 1) {
    const item = sortedItems[index];

    if (item.sourceType === "standard") {
      const standardItem = await getAdminModuleItem(item.sourceId);
      if (!standardItem) {
        throw new Error(`Standard item not found: ${item.sourceId}`);
      }

      const moduleId = item.moduleId || standardItem.module_id;
      if (!moduleId) {
        throw new Error(`Standard item missing module id: ${item.sourceId}`);
      }

      assembledItems.push({
        module_id: moduleId,
        source_type: "standard",
        standard_item_id: standardItem.id,
        title: standardItem.title,
        item_type: standardItem.item_type,
        file_url: standardItem.file_url || null,
        duration: standardItem.duration || 0,
        sort_order: index + 1,
        is_primary: item.isPrimary === true,
      });

      if (!modulesConfig[String(moduleId)]) {
        modulesConfig[String(moduleId)] = [];
      }
      modulesConfig[String(moduleId)].push(standardItem.id);
      continue;
    }

    const teacherResource = await getAccessibleTeacherResource(authUserId, item.sourceId);
    if (!teacherResource) {
      throw new Error(`Teacher resource not found: ${item.sourceId}`);
    }
    if (teacherResource.review_status !== "published") {
      throw new Error(`资源「${teacherResource.title}」尚未发布，请先在备课页标记审校并发布后再保存教案。`);
    }

    assembledItems.push({
      module_id: teacherResource.module_id,
      source_type: "teacher_resource",
      teacher_resource_id: teacherResource.id,
      title: teacherResource.title,
      item_type: teacherResource.item_type,
      file_url: teacherResource.file_url || null,
      duration: teacherResource.duration || 0,
      sort_order: index + 1,
      is_primary: item.isPrimary === true,
    });

    if (!teacherSelections[String(teacherResource.module_id)]) {
      teacherSelections[String(teacherResource.module_id)] = [];
    }
    teacherSelections[String(teacherResource.module_id)].push(
      teacherResource.id,
    );
  }

  return {
    assembledItems,
    modulesConfig,
    teacherSelections,
  };
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !["teacher", "admin"].includes(currentUser.role)) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const includeTemplates = shouldIncludeTemplates(request);
    const lessonId = parseLessonId(
      request.nextUrl.searchParams.get("lessonId"),
    );
    if (!lessonId && includeTemplates) {
      const templates = await listTeacherLessonPlanTemplates(currentUser.id);
      return NextResponse.json({
        templates: templates.map(toClientTemplate),
      });
    }

    if (!lessonId) {
      return NextResponse.json({ error: "无效的课时 ID" }, { status: 400 });
    }

    const [
      customization,
      planItems,
      teacherResources,
      studentAssignments,
      templates,
    ] = await Promise.all([
      getAdminLessonCustomization(currentUser.id, lessonId),
      listTeacherLessonPlanItems(currentUser.id, lessonId),
      Promise.all([
        listTeacherResources(currentUser.id, { lessonId }),
        listSharedTeacherResources(currentUser.id, { lessonId }),
      ]).then(([ownResources, sharedResources]) => [
        ...ownResources,
        ...sharedResources,
      ]),
      listTeacherStudentAssignments(currentUser.id, lessonId),
      includeTemplates
        ? listTeacherLessonPlanTemplates(currentUser.id)
        : Promise.resolve([]),
    ]);
    const customizationData = parseTeacherLessonCustomizationData(
      customization?.custom_resources,
    );
    const teacherResourceMountById =
      buildTeacherResourceMountMap(teacherResources);

    return NextResponse.json({
      customization,
      teacherResources: teacherResources.map(toClientTeacherResource),
      studentAssignments: studentAssignments.map(toClientTeacherAssignment),
      teacherSelections: customizationData.teacherSelections,
      assignmentSettings: buildAssignmentSettingsResponse(
        customizationData.assignmentSettings,
        studentAssignments,
      ),
      assembledItems: planItems.map((item) =>
        toClientPlanItemWithMount(item, teacherResourceMountById),
      ),
      planItems: planItems.map((item) =>
        toClientPlanItemWithMount(item, teacherResourceMountById),
      ),
      templates: templates.map(toClientTemplate),
    });
  } catch (error) {
    console.error("Failed to fetch lesson customization:", error);
    return NextResponse.json({ error: "获取教案失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !["teacher", "admin"].includes(currentUser.role)) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    const lessonId = parseLessonId(String(body?.lessonId ?? ""));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const modulesConfig = body?.modulesConfig;
    const customResources = body?.customResources;
    const hasPlanItemsPayload = Array.isArray(body?.planItems);
    const rawPlanItems = hasPlanItemsPayload ? body.planItems : [];
    const hasStudentAssignmentsPayload = Array.isArray(
      body?.studentAssignments,
    );
    const rawStudentAssignments = hasStudentAssignmentsPayload
      ? body.studentAssignments
      : [];
    const hasAssignmentSettingsPayload = body?.assignmentSettings !== undefined;
    const providedAssignmentSettings = hasAssignmentSettingsPayload
      ? parseAssignmentSettingsPayload(body.assignmentSettings)
      : {};

    if (!lessonId) {
      return NextResponse.json({ error: "无效的课时 ID" }, { status: 400 });
    }

    if (action === "saveTemplate") {
      const [customization, planItems, studentAssignments] = await Promise.all([
        getAdminLessonCustomization(currentUser.id, lessonId),
        listTeacherLessonPlanItems(currentUser.id, lessonId),
        listTeacherStudentAssignments(currentUser.id, lessonId),
      ]);
      const customizationData = parseTeacherLessonCustomizationData(
        customization?.custom_resources,
      );
      const templateInput: CreateTeacherLessonPlanTemplateInput = {
        title: title || `课时 ${lessonId} 教案模板`,
        sourceLessonId: lessonId,
        planItems: planItems.map(toTemplatePlanItemInput),
        studentAssignments: studentAssignments.map(
          toTemplateStudentAssignmentInput,
        ),
        assignmentSettings: customizationData.assignmentSettings,
      };
      const template = await createTeacherLessonPlanTemplate(
        currentUser.id,
        templateInput,
      );

      return NextResponse.json({
        template: toClientTemplate(template),
      });
    }

    if (action === "copyFromLesson") {
      const sourceLessonId = parseLessonId(String(body?.sourceLessonId ?? ""));
      if (!sourceLessonId) {
        return NextResponse.json(
          { error: "无效的来源课时 ID" },
          { status: 400 },
        );
      }

      if (sourceLessonId === lessonId) {
        return NextResponse.json(
          { error: "来源课时不能与目标课时相同" },
          { status: 400 },
        );
      }

      const [
        sourceCustomization,
        sourcePlanItems,
        sourceStudentAssignments,
        targetCustomization,
      ] = await Promise.all([
        getAdminLessonCustomization(currentUser.id, sourceLessonId),
        listTeacherLessonPlanItems(currentUser.id, sourceLessonId),
        listTeacherStudentAssignments(currentUser.id, sourceLessonId),
        getAdminLessonCustomization(currentUser.id, lessonId),
      ]);

      const sourceCustomizationData = parseTeacherLessonCustomizationData(
        sourceCustomization?.custom_resources,
      );
      const copiedPlanState = buildPlanStateFromSavedItems(sourcePlanItems);
      const savedPlanItems = await replaceTeacherLessonPlanItems(
        currentUser.id,
        lessonId,
        copiedPlanState.assembledItems,
      );
      const currentStudentAssignments = await replaceTeacherStudentAssignments(
        currentUser.id,
        lessonId,
        sourceStudentAssignments.map((assignment) => ({
          module_id: assignment.module_id,
          title: assignment.title,
          description: assignment.description,
          due_at: assignment.due_at,
          is_required: assignment.is_required,
          sort_order: assignment.sort_order,
        })),
      );

      const customization = await upsertAdminLessonCustomization({
        auth_user_id: currentUser.id,
        lesson_id: lessonId,
        title:
          title ||
          targetCustomization?.title ||
          sourceCustomization?.title ||
          null,
        modules_config: JSON.stringify(copiedPlanState.modulesConfig),
        custom_resources: serializeTeacherLessonCustomizationData({
          teacherSelections: copiedPlanState.teacherSelections,
          assignmentSettings: sourceCustomizationData.assignmentSettings,
        }),
      });
      const customizationData = parseTeacherLessonCustomizationData(
        customization.custom_resources,
      );
      const [ownTeacherResources, sharedTeacherResources] = await Promise.all([
        listTeacherResources(currentUser.id, { lessonId }),
        listSharedTeacherResources(currentUser.id, { lessonId }),
      ]);
      const teacherResources = [
        ...ownTeacherResources,
        ...sharedTeacherResources,
      ];
      const teacherResourceMountById =
        buildTeacherResourceMountMap(teacherResources);

      return NextResponse.json({
        customization,
        copiedFromLessonId: sourceLessonId,
        studentAssignments: currentStudentAssignments.map(
          toClientTeacherAssignment,
        ),
        teacherSelections: customizationData.teacherSelections,
        assignmentSettings: buildAssignmentSettingsResponse(
          customizationData.assignmentSettings,
          currentStudentAssignments,
        ),
        assembledItems: savedPlanItems.map((item) =>
          toClientPlanItemWithMount(item, teacherResourceMountById),
        ),
        planItems: savedPlanItems.map((item) =>
          toClientPlanItemWithMount(item, teacherResourceMountById),
        ),
      });
    }

    if (hasPlanItemsPayload && !rawPlanItems.every(isPlanItemPayload)) {
      return NextResponse.json({ error: "无效的教案项数据" }, { status: 400 });
    }

    if (
      hasStudentAssignmentsPayload &&
      !rawStudentAssignments.every(isStudentAssignmentPayload)
    ) {
      return NextResponse.json(
        { error: "无效的学生作业数据" },
        { status: 400 },
      );
    }

    if (
      !hasPlanItemsPayload &&
      modulesConfig !== undefined &&
      !isModuleConfig(modulesConfig)
    ) {
      return NextResponse.json({ error: "无效的教案数据" }, { status: 400 });
    }

    const [existingCustomization, existingStudentAssignments] =
      await Promise.all([
        getAdminLessonCustomization(currentUser.id, lessonId),
        listTeacherStudentAssignments(currentUser.id, lessonId),
      ]);
    const existingCustomizationData = parseTeacherLessonCustomizationData(
      existingCustomization?.custom_resources,
    );
    const existingModulesConfig = parseStoredModuleConfig(
      existingCustomization?.modules_config,
    );
    const existingAssignmentsById = new Map(
      existingStudentAssignments.map((item) => [item.id, item]),
    );
    const {
      standard: providedStandardAssignmentSettings,
      teacherCustom: providedTeacherCustomSettings,
    } = splitAssignmentSettingsBySource(providedAssignmentSettings);

    let finalModulesConfig: Record<string, number[]> = isModuleConfig(
      modulesConfig,
    )
      ? modulesConfig
      : existingModulesConfig;
    let finalTeacherSelections = existingCustomizationData.teacherSelections;
    let finalStandardAssignmentSettings: TeacherLessonAssignmentSettingsMap = {
      ...existingCustomizationData.assignmentSettings,
      ...providedStandardAssignmentSettings,
    };
    let savedPlanItems: TeacherLessonPlanItemRecord[] = [];
    let currentStudentAssignments = existingStudentAssignments;

    if (hasPlanItemsPayload) {
      const {
        assembledItems,
        modulesConfig: derivedModulesConfig,
        teacherSelections,
      } = await buildPlanItemsForSave(
        currentUser.id,
        rawPlanItems as PlanItemPayload[],
      );

      savedPlanItems = await replaceTeacherLessonPlanItems(
        currentUser.id,
        lessonId,
        assembledItems,
      );
      finalModulesConfig = derivedModulesConfig;
      finalTeacherSelections = teacherSelections;
    } else if (customResources !== undefined) {
      finalTeacherSelections =
        Array.isArray(customResources) && customResources.length === 0
          ? existingCustomizationData.teacherSelections
          : parseTeacherSelectionsPayload(customResources);
    }

    if (hasStudentAssignmentsPayload) {
      const normalizedAssignments = (
        rawStudentAssignments as StudentAssignmentPayload[]
      )
        .map((item, index) => ({
          id: item.id,
          module_id: item.moduleId,
          title: item.title.trim(),
          description: (item.description || "").trim(),
          due_at:
            item.dueAt !== undefined
              ? normalizeTeacherAssignmentDueAt(item.dueAt)
              : (providedTeacherCustomSettings[
                  item.id ? `teacher_custom:${item.id}` : ""
                ]?.dueAt ??
                (item.id
                  ? existingAssignmentsById.get(item.id)?.due_at
                  : null) ??
                null),
          is_required:
            item.isRequired !== undefined
              ? normalizeTeacherAssignmentIsRequired(item.isRequired)
              : (providedTeacherCustomSettings[
                  item.id ? `teacher_custom:${item.id}` : ""
                ]?.isRequired ??
                (item.id
                  ? existingAssignmentsById.get(item.id)?.is_required
                  : true) ??
                true),
          sort_order: item.sortOrder || index + 1,
        }))
        .filter(
          (item) => item.title.length > 0,
        ) satisfies TeacherStudentAssignmentInput[];

      currentStudentAssignments = await replaceTeacherStudentAssignments(
        currentUser.id,
        lessonId,
        normalizedAssignments,
      );
    } else if (Object.keys(providedTeacherCustomSettings).length > 0) {
      currentStudentAssignments = await replaceTeacherStudentAssignments(
        currentUser.id,
        lessonId,
        existingStudentAssignments.map((assignment) => {
          const metadata =
            providedTeacherCustomSettings[`teacher_custom:${assignment.id}`];
          return {
            id: assignment.id,
            module_id: assignment.module_id,
            title: assignment.title,
            description: assignment.description,
            due_at: metadata?.dueAt ?? assignment.due_at,
            is_required: metadata?.isRequired ?? assignment.is_required,
            sort_order: assignment.sort_order,
          };
        }),
      );
    }

    const customization = await upsertAdminLessonCustomization({
      auth_user_id: currentUser.id,
      lesson_id: lessonId,
      title: title || null,
      modules_config: JSON.stringify(finalModulesConfig),
      custom_resources: serializeTeacherLessonCustomizationData({
        teacherSelections: finalTeacherSelections,
        assignmentSettings: finalStandardAssignmentSettings,
      }),
    });
    const customizationData = parseTeacherLessonCustomizationData(
      customization.custom_resources,
    );
    const [ownTeacherResources, sharedTeacherResources] = await Promise.all([
      listTeacherResources(currentUser.id, { lessonId }),
      listSharedTeacherResources(currentUser.id, { lessonId }),
    ]);
    const teacherResources = [
      ...ownTeacherResources,
      ...sharedTeacherResources,
    ];
    const teacherResourceMountById =
      buildTeacherResourceMountMap(teacherResources);

    return NextResponse.json({
      customization,
      studentAssignments: currentStudentAssignments.map(
        toClientTeacherAssignment,
      ),
      teacherSelections: customizationData.teacherSelections,
      assignmentSettings: buildAssignmentSettingsResponse(
        customizationData.assignmentSettings,
        currentStudentAssignments,
      ),
      assembledItems: savedPlanItems.map((item) =>
        toClientPlanItemWithMount(item, teacherResourceMountById),
      ),
      planItems: savedPlanItems.map((item) =>
        toClientPlanItemWithMount(item, teacherResourceMountById),
      ),
    });
  } catch (error) {
    console.error("Failed to save lesson customization:", error);
    return NextResponse.json({ error: "保存教案失败" }, { status: 500 });
  }
}
