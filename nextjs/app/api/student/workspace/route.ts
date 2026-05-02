import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureDefaultPlaceholderCourses,
  getAdminLessonCustomization,
} from "@/lib/directus-admin";
import {
  getCourses,
  getLesson,
  getLessons,
  getModules,
  type Course,
  type Lesson,
  type ModuleItem,
} from "@/lib/directus";
import {
  listStudentAssignmentSubmissions,
  resolveDefaultLessonId,
  resolveTeacherContextForLesson,
} from "@/lib/student-assignments";
import { toStudentAssignmentReviewPhase } from "@/lib/student-assignment-review";
import { listMiniAppMounts } from "@/lib/miniapps";
import {
  listTeacherLessonPlanItems,
  listTeacherStudentAssignments,
  parseTeacherLessonCustomizationData,
} from "@/lib/teacher-plan";
import { resolveAssetUrl } from "@/lib/media-url";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requireUnitIndex(input: {
  id: number;
  unit?: { unit_index: number };
}): number {
  const unitIndex = input.unit?.unit_index;
  if (!unitIndex || unitIndex <= 0) {
    throw new Error(`Lesson ${input.id} is missing a valid unit_index`);
  }

  return unitIndex;
}

function toCoursePayload(course?: Course | null) {
  if (!course) {
    return null;
  }

  return {
    id: course.id,
    title: course.title,
    description: course.description || "",
    courseIndex: course.course_index,
  };
}

function toLessonPayload(lesson: Lesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    lessonIndex: lesson.lesson_index,
    unitId: lesson.unit_id,
    unitIndex: requireUnitIndex(lesson),
    unitTitle: lesson.unit?.title || "",
    courseId: lesson.unit?.course_id || null,
    courseTitle: lesson.unit?.course?.title || "",
    courseIndex: lesson.unit?.course?.course_index || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !["student", "admin"].includes(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureDefaultPlaceholderCourses();

    const requestedLessonId = parsePositiveInt(
      request.nextUrl.searchParams.get("lessonId"),
    );
    const requestedTeacherId = request.nextUrl.searchParams.get("teacherId");

    const fallbackLessonId =
      requestedLessonId || (await resolveDefaultLessonId(currentUser.id));
    const [courses, lessons] = await Promise.all([getCourses(), getLessons()]);

    if (lessons.length === 0) {
      return NextResponse.json({ error: "暂无可用课时" }, { status: 404 });
    }

    const lessonId =
      (fallbackLessonId &&
        lessons.some((lesson) => lesson.id === fallbackLessonId) &&
        fallbackLessonId) ||
      lessons[0].id;

    const resolvedTeacherId = await resolveTeacherContextForLesson(
      currentUser.id,
      lessonId,
      requestedTeacherId,
    );

    const [
      lesson,
      modules,
      submissions,
      teacherAssignments,
      teacherPlanItems,
      customization,
    ] = await Promise.all([
      getLesson(lessonId),
      getModules(lessonId),
      listStudentAssignmentSubmissions(currentUser.id, lessonId),
      resolvedTeacherId
        ? listTeacherStudentAssignments(resolvedTeacherId, lessonId)
        : Promise.resolve([]),
      resolvedTeacherId
        ? listTeacherLessonPlanItems(resolvedTeacherId, lessonId)
        : Promise.resolve([]),
      resolvedTeacherId
        ? getAdminLessonCustomization(resolvedTeacherId, lessonId)
        : Promise.resolve(null),
    ]);
    const assignmentSettings = parseTeacherLessonCustomizationData(
      customization?.custom_resources,
    ).assignmentSettings;

    const submissionMap = new Map(
      submissions.map((item) => [item.assignment_key, item]),
    );
    const standardItemMap = new Map<number, ModuleItem>();

    for (const module of modules) {
      for (const item of module.items || []) {
        standardItemMap.set(item.id, item);
      }
    }
    const standardItemMounts = await listMiniAppMounts(
      "standard_module_item",
      Array.from(standardItemMap.keys()),
    );
    const standardItemMountById = new Map(
      standardItemMounts.map((mount) => [mount.ownerId, mount]),
    );

    const modulePayload = modules.map((module) => {
      const modulePlanItems = teacherPlanItems.filter(
        (item) => item.module_id === module.id,
      );
      const hasTeacherPlan = modulePlanItems.length > 0;

      const standardReviewItems = hasTeacherPlan
        ? modulePlanItems
            .filter(
              (item) =>
                item.source_type === "standard" &&
                Boolean(item.standard_item_id),
            )
            .map((item) => {
              const standardItem = item.standard_item_id
                ? standardItemMap.get(item.standard_item_id)
                : undefined;

              return {
                id: item.id,
                reviewKey: `standard_plan:${item.id}`,
                reviewSource: "standard" as const,
                moduleId: module.id,
                standardItemId: item.standard_item_id || undefined,
                title: item.title || standardItem?.title || "未命名标准内容",
                itemType:
                  item.item_type || standardItem?.item_type || "interactive",
                fileUrl: resolveAssetUrl(
                  item.file_url || standardItem?.file_url,
                ),
                duration: item.duration ?? standardItem?.duration ?? 0,
                sortOrder: item.sort_order,
                miniAppMount: item.standard_item_id
                  ? standardItemMountById.get(item.standard_item_id) || null
                  : null,
                teacherActivity: standardItem?.teacher_activity || "",
                studentActivity: standardItem?.student_activity || "",
                designIntent: standardItem?.design_intent || "",
                curriculumStandards: standardItem?.curriculum_standards || "",
                plan: standardItem?.plan || "",
                durationMinutes: standardItem?.duration_minutes || null,
              };
            })
        : (module.items || []).map((item) => ({
            id: item.id,
            reviewKey: `standard:${item.id}`,
            reviewSource: "standard" as const,
            moduleId: module.id,
            standardItemId: item.id,
            title: item.title,
            itemType: item.item_type,
            fileUrl: item.file_url,
            duration: item.duration,
            sortOrder: item.sort_order,
            miniAppMount: standardItemMountById.get(item.id) || null,
            teacherActivity: item.teacher_activity || "",
            studentActivity: item.student_activity || "",
            designIntent: item.design_intent || "",
            curriculumStandards: item.curriculum_standards || "",
            plan: item.plan || "",
            durationMinutes: item.duration_minutes || null,
          }));

      const teacherReviewItems = modulePlanItems
        .filter((item) => item.source_type === "teacher_resource")
        .map((item) => ({
          id: item.id,
          reviewKey: `teacher_resource:${item.id}`,
          reviewSource: "teacher_resource" as const,
          moduleId: module.id,
          teacherPlanItemId: item.id,
          teacherResourceId: item.teacher_resource_id,
          title: item.title,
          itemType: item.item_type,
          fileUrl: resolveAssetUrl(item.file_url),
          duration: item.duration,
          sortOrder: item.sort_order,
          miniAppMount: null,
          teacherActivity: "",
          studentActivity: "",
          designIntent: "",
          curriculumStandards: "",
          plan: "",
          durationMinutes: null,
        }));

      const standardAssignments = (module.items || [])
        .filter(
          (item) =>
            typeof item.student_activity === "string" &&
            item.student_activity.trim().length > 0,
        )
        .map((item) => {
          const assignmentKey = `standard:${item.id}`;
          const submission = submissionMap.get(assignmentKey);
          const assignmentMetadata = assignmentSettings[assignmentKey] || {
            dueAt: null,
            isRequired: true,
          };

          return {
            assignmentKey,
            assignmentSource: "standard" as const,
            moduleId: module.id,
            standardItemId: item.id,
            title: item.title,
            content: item.student_activity?.trim() || "",
            itemType: item.item_type,
            dueAt: assignmentMetadata.dueAt,
            isRequired: assignmentMetadata.isRequired,
            submission: submission
              ? {
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
                }
              : null,
          };
        });

      const customAssignments = teacherAssignments
        .filter((item) => item.module_id === module.id)
        .map((item) => {
          const assignmentKey = `teacher_custom:${item.id}`;
          const submission = submissionMap.get(assignmentKey);

          return {
            assignmentKey,
            assignmentSource: "teacher_custom" as const,
            moduleId: module.id,
            teacherAssignmentId: item.id,
            title: item.title,
            content: item.description,
            dueAt: item.due_at,
            isRequired: item.is_required,
            submission: submission
              ? {
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
                }
              : null,
          };
        });

      const allAssignments = [...standardAssignments, ...customAssignments];
      const completedAssignments = allAssignments.filter(
        (item) => item.submission?.isCompleted,
      ).length;
      const teacherPrimaryReviewItem =
        modulePlanItems.find((item) => Boolean(item.is_primary)) ||
        modulePlanItems[0];
      const standardPrimaryReviewItem = module.primary_item_id
        ? standardReviewItems.find(
            (item) => item.standardItemId === module.primary_item_id,
          )
        : standardReviewItems[0];
      const teacherPrimaryPayload = teacherPrimaryReviewItem
        ? [...standardReviewItems, ...teacherReviewItems].find((item) => {
            const planItemId =
              "teacherPlanItemId" in item ? item.teacherPlanItemId : null;
            const standardItemId =
              "standardItemId" in item ? item.standardItemId : null;
            return (
              planItemId === teacherPrimaryReviewItem.id ||
              standardItemId === teacherPrimaryReviewItem.standard_item_id
            );
          })
        : null;
      const primaryReviewItem =
        teacherPrimaryPayload ||
        standardPrimaryReviewItem ||
        standardReviewItems[0] ||
        teacherReviewItems[0] ||
        null;
      const isAssignmentNode =
        Boolean(module.assignment_required) || allAssignments.length > 0;

      return {
        id: module.id,
        moduleIndex: module.module_index,
        moduleName: module.module_name,
        moduleType: module.module_type,
        description: module.description,
        primaryItemId: module.primary_item_id || null,
        unlockMode: module.unlock_mode || "sequential",
        isAssignmentNode,
        primaryReviewItem,
        standardReviewItems,
        teacherReviewItems,
        standardAssignments,
        customAssignments,
        totalReviewItems:
          standardReviewItems.length + teacherReviewItems.length,
        totalAssignments: allAssignments.length,
        completedAssignments,
        isCompleted: isAssignmentNode
          ? allAssignments.length > 0 &&
            completedAssignments === allAssignments.length
          : Boolean(primaryReviewItem),
      };
    });

    let previousSequentialCompleted = true;
    const lockedModulePayload = modulePayload.map((module) => {
      const isLocked =
        module.unlockMode !== "free" && !previousSequentialCompleted;
      if (module.unlockMode !== "free") {
        previousSequentialCompleted =
          previousSequentialCompleted && module.isCompleted;
      }
      return {
        ...module,
        isLocked,
      };
    });

    const totalAssignments = lockedModulePayload.reduce(
      (sum, module) => sum + module.totalAssignments,
      0,
    );
    const completedAssignments = lockedModulePayload.reduce(
      (sum, module) => sum + module.completedAssignments,
      0,
    );
    const completedModules = lockedModulePayload.filter(
      (module) => module.isCompleted,
    ).length;

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        lessonIndex: lesson.lesson_index,
        unitId: lesson.unit_id,
        unitIndex: requireUnitIndex(lesson),
        unitTitle: lesson.unit?.title || "",
        courseId: lesson.unit?.course_id || null,
        courseTitle: lesson.unit?.course?.title || "",
        courseIndex: lesson.unit?.course?.course_index || null,
      },
      courses: courses.map(toCoursePayload),
      availableLessons: lessons.map(toLessonPayload),
      resolvedTeacherId,
      modules: lockedModulePayload,
      progress: {
        totalModules: lockedModulePayload.length,
        completedModules,
        totalAssignments,
        completedAssignments,
      },
    });
  } catch (error) {
    console.error("Failed to load student workspace:", error);
    return NextResponse.json({ error: "加载学生课堂失败" }, { status: 500 });
  }
}
