"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  LockKeyhole,
  Loader2,
  Paperclip,
  Save,
  Star,
  X,
} from "lucide-react";
import LogoutButton from "@/app/teacher/LogoutButton";
import ClassroomExperience, {
  type ClassroomItem,
  type ClassroomPlayableModule,
} from "@/components/classroom/ClassroomExperience";
import PortalShell from "@/components/portal/PortalShell";
import { COURSE_CATALOG } from "@/lib/course-catalog";
import {
  normalizeModuleItemMiniAppMount,
  type ModuleItem,
} from "@/lib/directus";
import { type StudentAssignmentReviewPhase } from "@/lib/student-assignment-review";

interface User {
  id: string;
  name: string;
  role: string;
}

interface AssignmentAttachment {
  id?: number | string;
  name?: string | null;
  title?: string | null;
  fileName?: string | null;
  originalName?: string | null;
  url?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  type?: string | null;
  size?: number | null;
}

interface AssignmentSubmission {
  responseText: string;
  isCompleted: boolean;
  completedAt?: string | null;
  reviewStatus?: StudentAssignmentReviewPhase;
  teacherReviewNote?: string | null;
  teacherScore?: number | null;
  reviewedAt?: string | null;
  attachments?: AssignmentAttachment[] | null;
}

interface AssignmentItem {
  assignmentKey: string;
  assignmentSource: "standard" | "teacher_custom";
  moduleId: number;
  title: string;
  content: string;
  dueAt?: string | null;
  isRequired?: boolean;
  standardItemId?: number;
  teacherAssignmentId?: number;
  submission: AssignmentSubmission | null;
}

interface ReviewItem {
  id: number;
  reviewKey: string;
  reviewSource: "standard" | "teacher_resource";
  moduleId: number;
  title: string;
  itemType: ModuleItem["item_type"];
  fileUrl?: string | null;
  duration?: number | null;
  sortOrder: number;
  standardItemId?: number;
  teacherPlanItemId?: number;
  teacherResourceId?: number | null;
  teacherActivity?: string;
  studentActivity?: string;
  designIntent?: string;
  curriculumStandards?: string;
  plan?: string;
  durationMinutes?: number | null;
  miniappMount?: ModuleItem["miniappMount"] | null;
  miniapp_mount?: ModuleItem["miniapp_mount"] | null;
}

interface WorkspaceModule {
  id: number;
  moduleIndex: number;
  moduleName: string;
  moduleType: string;
  description?: string;
  primaryItemId?: number | null;
  unlockMode?: string | null;
  isAssignmentNode?: boolean;
  isLocked?: boolean;
  primaryReviewItem?: ReviewItem | null;
  standardReviewItems: ReviewItem[];
  teacherReviewItems: ReviewItem[];
  standardAssignments: AssignmentItem[];
  customAssignments: AssignmentItem[];
  totalReviewItems: number;
  totalAssignments: number;
  completedAssignments: number;
  isCompleted: boolean;
}

interface WorkspaceData {
  lesson: {
    id: number;
    title: string;
    description?: string;
    lessonIndex: number;
    unitId: number;
    unitIndex: number;
    unitTitle?: string;
    courseId?: number | null;
    courseTitle?: string;
    courseIndex?: number | null;
  };
  courses?: Array<{
    id: number;
    title: string;
    description?: string;
    courseIndex: number;
  } | null>;
  availableLessons: Array<{
    id: number;
    title: string;
    lessonIndex: number;
    unitId: number;
    unitIndex: number;
    unitTitle?: string;
    courseId?: number | null;
    courseTitle?: string;
    courseIndex?: number | null;
  }>;
  resolvedTeacherId: string | null;
  modules: WorkspaceModule[];
  progress: {
    totalModules: number;
    completedModules: number;
    totalAssignments: number;
    completedAssignments: number;
  };
}

interface CourseSelectionCard {
  key: string;
  title: string;
  description: string;
  courseId: number | null;
  courseIndex: number | null;
  lessons: WorkspaceData["availableLessons"];
  isAvailable: boolean;
  isPlaceholder: boolean;
}

type DraftMap = Record<string, string>;
type PendingAttachmentMap = Record<string, File[]>;
type RemovedUploadedAttachmentMap = Record<string, number[]>;

type AssignmentMeta = {
  dueAt: string | null;
  isRequired: boolean;
};

const ASSIGNMENT_META_PREFIX = "<!--assignment-meta:";
const ASSIGNMENT_META_SUFFIX = "-->";
const STANDARD_ASSIGNMENT_META_PREFIX = "__assignment_meta__:standard:";

function getDefaultAssignmentMeta(): AssignmentMeta {
  return {
    dueAt: null,
    isRequired: false,
  };
}

function parseAssignmentMeta(rawContent?: string | null): {
  content: string;
  meta: AssignmentMeta;
} {
  const content = typeof rawContent === "string" ? rawContent : "";
  const startIndex = content.lastIndexOf(ASSIGNMENT_META_PREFIX);

  if (startIndex < 0) {
    return {
      content,
      meta: getDefaultAssignmentMeta(),
    };
  }

  const endIndex = content.indexOf(ASSIGNMENT_META_SUFFIX, startIndex);
  if (endIndex < 0) {
    return {
      content,
      meta: getDefaultAssignmentMeta(),
    };
  }

  const jsonText = content
    .slice(startIndex + ASSIGNMENT_META_PREFIX.length, endIndex)
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    return {
      content: content.slice(0, startIndex).trimEnd(),
      meta: {
        dueAt:
          typeof parsed.dueAt === "string" && parsed.dueAt.trim().length > 0
            ? parsed.dueAt.trim()
            : null,
        isRequired: parsed.isRequired === true,
      },
    };
  } catch {
    return {
      content,
      meta: getDefaultAssignmentMeta(),
    };
  }
}

function parseStandardAssignmentMetaTitle(title: string): number | null {
  if (!title.startsWith(STANDARD_ASSIGNMENT_META_PREFIX)) {
    return null;
  }

  const parsed = Number(title.slice(STANDARD_ASSIGNMENT_META_PREFIX.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeWorkspaceAssignments(
  workspaceData: WorkspaceData,
): WorkspaceData {
  return {
    ...workspaceData,
    modules: workspaceData.modules.map((module) => {
      const standardMetaByItemId = new Map<number, AssignmentMeta>();
      const visibleCustomAssignments: AssignmentItem[] = [];

      for (const assignment of module.customAssignments) {
        const standardItemId = parseStandardAssignmentMetaTitle(
          assignment.title,
        );
        const parsed = parseAssignmentMeta(assignment.content);

        if (standardItemId) {
          standardMetaByItemId.set(standardItemId, parsed.meta);
          continue;
        }

        visibleCustomAssignments.push({
          ...assignment,
          content: parsed.content,
          dueAt: parsed.meta.dueAt,
          isRequired: parsed.meta.isRequired,
        });
      }

      const standardAssignments = module.standardAssignments.map(
        (assignment) => {
          const parsed = parseAssignmentMeta(assignment.content);
          const overlay = assignment.standardItemId
            ? standardMetaByItemId.get(assignment.standardItemId)
            : undefined;

          return {
            ...assignment,
            content: parsed.content,
            dueAt: overlay?.dueAt ?? parsed.meta.dueAt,
            isRequired: overlay?.isRequired ?? parsed.meta.isRequired,
          };
        },
      );

      return {
        ...module,
        standardAssignments,
        customAssignments: visibleCustomAssignments,
        totalAssignments:
          standardAssignments.length + visibleCustomAssignments.length,
        completedAssignments: [
          ...standardAssignments,
          ...visibleCustomAssignments,
        ].filter((assignment) => assignment.submission?.isCompleted).length,
        isCompleted:
          standardAssignments.length + visibleCustomAssignments.length > 0 &&
          [...standardAssignments, ...visibleCustomAssignments].every(
            (assignment) => assignment.submission?.isCompleted,
          ),
      };
    }),
  };
}

function buildDrafts(modules: WorkspaceModule[]): DraftMap {
  return Object.fromEntries(
    modules
      .flatMap((module) => [
        ...module.standardAssignments,
        ...module.customAssignments,
      ])
      .map((assignment) => [
        assignment.assignmentKey,
        assignment.submission?.responseText || "",
      ]),
  );
}

function isGenericLessonTitle(title: string, lessonIndex: number): boolean {
  const normalized = title.trim();
  return normalized === `课时${lessonIndex}` || /^课时\d+$/.test(normalized);
}

function formatLessonOptionLabel(
  lesson: WorkspaceData["availableLessons"][number],
): string {
  if (isGenericLessonTitle(lesson.title, lesson.lessonIndex)) {
    return `第 ${lesson.lessonIndex} 课`;
  }

  return `第 ${lesson.lessonIndex} 课 · ${lesson.title}`;
}

function normalizeCourseTitle(value?: string | null): string {
  return value?.trim() || "默认课程";
}

function buildCourseKey(
  courseId?: number | null,
  courseTitle?: string | null,
): string {
  return courseId ? `course:${courseId}` : `title:${normalizeCourseTitle(courseTitle)}`;
}

function getModuleDisplayName(module: WorkspaceModule): string {
  return (
    module.moduleName?.trim() ||
    module.moduleType?.trim() ||
    `流程 ${module.moduleIndex}`
  );
}

function toClassroomItem(item: ReviewItem): ClassroomItem {
  const miniAppMount = normalizeModuleItemMiniAppMount(
    item.miniappMount || item.miniapp_mount,
  );

  return {
    id: item.standardItemId || item.teacherPlanItemId || item.id,
    module_id: item.moduleId,
    item_type: item.itemType,
    title: item.title,
    file_url: item.fileUrl || undefined,
    duration: item.duration || 0,
    sort_order: item.sortOrder,
    teacher_activity: item.teacherActivity || undefined,
    student_activity: item.studentActivity || undefined,
    design_intent: item.designIntent || undefined,
    curriculum_standards: item.curriculumStandards || undefined,
    plan: item.plan || undefined,
    duration_minutes: item.durationMinutes || undefined,
    sourceType:
      item.reviewSource === "teacher_resource"
        ? "teacher_resource"
        : "standard",
    sourceItemId: item.standardItemId || undefined,
    teacherResourceId: item.teacherResourceId || undefined,
    miniapp_mount: miniAppMount,
    miniappMount: miniAppMount,
  };
}

function buildFileIdentity(file: File): string {
  return [file.name, file.size, file.lastModified].join(":");
}

function formatFileSize(size?: number | null): string | null {
  if (!size || Number.isNaN(size)) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getAttachmentDisplayName(attachment: AssignmentAttachment): string {
  return (
    attachment.originalName ||
    attachment.fileName ||
    attachment.name ||
    attachment.title ||
    "未命名附件"
  );
}

function getAttachmentUrl(attachment: AssignmentAttachment): string | null {
  return attachment.fileUrl || attachment.url || null;
}

function getAttachmentId(attachment: AssignmentAttachment): number | null {
  if (
    typeof attachment.id === "number" &&
    Number.isInteger(attachment.id) &&
    attachment.id > 0
  ) {
    return attachment.id;
  }

  if (typeof attachment.id === "string") {
    const parsed = Number(attachment.id);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function getAttachmentKindLabel(
  mimeType?: string | null,
  fileName?: string | null,
): string {
  const normalizedMimeType = mimeType?.toLowerCase() || "";
  const normalizedFileName = fileName?.toLowerCase() || "";

  if (normalizedMimeType.startsWith("image/")) {
    return "图片";
  }

  if (normalizedMimeType.startsWith("audio/")) {
    return "音频";
  }

  if (normalizedMimeType.startsWith("video/")) {
    return "视频";
  }

  if (
    normalizedMimeType.includes("pdf") ||
    normalizedMimeType.includes("word") ||
    normalizedMimeType.includes("sheet") ||
    normalizedMimeType.includes("excel") ||
    normalizedMimeType.includes("powerpoint") ||
    normalizedMimeType.includes("presentation") ||
    normalizedMimeType.includes("text/")
  ) {
    return "文档";
  }

  if (
    /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|rtf|pages|key|numbers)$/i.test(
      normalizedFileName,
    )
  ) {
    return "文档";
  }

  return "附件";
}

export default function StudentPage() {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [pendingAttachments, setPendingAttachments] =
    useState<PendingAttachmentMap>({});
  const [removedUploadedAttachmentIds, setRemovedUploadedAttachmentIds] =
    useState<RemovedUploadedAttachmentMap>({});
  const [selectedCourseKey, setSelectedCourseKey] = useState<string | null>(
    null,
  );
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function loadWorkspace(nextLessonId?: number | null) {
    setLoading(true);
    setError(null);

    try {
      const userRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!userRes.ok) {
        setError("请先登录后进入学生端");
        setLoading(false);
        return;
      }

      const userData = await userRes.json();
      setUser(userData.user);

      const params = new URLSearchParams();
      if (nextLessonId) {
        params.set("lessonId", String(nextLessonId));
      }

      const workspaceRes = await fetch(
        `/api/student/workspace?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

      if (!workspaceRes.ok) {
        const data = await workspaceRes
          .json()
          .catch(() => ({ error: "学生端加载失败" }));
        throw new Error(data.error || "学生端加载失败");
      }

      const workspaceData = normalizeWorkspaceAssignments(
        (await workspaceRes.json()) as WorkspaceData,
      );
      setWorkspace(workspaceData);
      setDrafts(buildDrafts(workspaceData.modules));
      setPendingAttachments({});
      setRemovedUploadedAttachmentIds({});
      setSelectedLessonId(workspaceData.lesson.id);

      if (
        selectedModuleId &&
        !workspaceData.modules.some((module) => module.id === selectedModuleId)
      ) {
        setSelectedModuleId(null);
        setReviewOpen(false);
      }
    } catch (loadError) {
      console.error("Failed to load student workspace", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "学生端加载失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, []);

  const selectedModule = useMemo(
    () =>
      workspace?.modules.find((module) => module.id === selectedModuleId) ||
      null,
    [workspace, selectedModuleId],
  );

  const selectedModuleAssignments = useMemo(() => {
    if (!selectedModule) {
      return [];
    }

    return [
      ...selectedModule.standardAssignments,
      ...selectedModule.customAssignments,
    ];
  }, [selectedModule]);

  const selectedModuleReviewItems = useMemo(() => {
    if (!selectedModule) {
      return [];
    }

    const teacherItems =
      selectedModule.teacherReviewItems.length > 0
        ? selectedModule.teacherReviewItems
        : selectedModule.primaryReviewItem
          ? [selectedModule.primaryReviewItem]
          : selectedModule.standardReviewItems;

    return teacherItems
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(toClassroomItem);
  }, [selectedModule]);

  const selectedModuleReviewModules = useMemo<ClassroomPlayableModule[]>(() => {
    if (!selectedModule) {
      return [];
    }

    return [
      {
        id: selectedModule.id,
        module_name: getModuleDisplayName(selectedModule),
      },
    ];
  }, [selectedModule]);

  const groupedLessons = useMemo(() => {
    if (!workspace) {
      return [];
    }

    const filteredLessons = selectedCourseKey
      ? workspace.availableLessons.filter(
          (lesson) =>
            buildCourseKey(lesson.courseId, lesson.courseTitle) ===
            selectedCourseKey,
        )
      : workspace.availableLessons;

    const groups = new Map<
      string,
      {
        courseTitle: string;
        unitTitle: string;
        lessons: WorkspaceData["availableLessons"];
      }
    >();

    for (const lesson of filteredLessons) {
      const courseLabel = normalizeCourseTitle(lesson.courseTitle);
      const unitLabel =
        lesson.unitTitle?.trim() || `第 ${lesson.unitIndex} 单元`;
      const groupKey = `${lesson.courseId || "legacy"}:${lesson.unitId}`;
      const existing = groups.get(groupKey) || {
        courseTitle: courseLabel,
        unitTitle: unitLabel,
        lessons: [],
      };
      existing.lessons.push(lesson);
      groups.set(groupKey, existing);
    }

    return Array.from(groups.values());
  }, [selectedCourseKey, workspace]);

  const courseCards = useMemo<CourseSelectionCard[]>(() => {
    if (!workspace) {
      return [];
    }

    const courseDescriptionMap = new Map<number, string>();
    const courseCardsByKey = new Map<string, CourseSelectionCard>();

    for (const course of workspace.courses || []) {
      if (!course || typeof course.id !== "number") {
        continue;
      }
      courseDescriptionMap.set(course.id, course.description?.trim() || "");
    }

    for (const lesson of workspace.availableLessons) {
      const courseKey = buildCourseKey(lesson.courseId, lesson.courseTitle);
      const existing = courseCardsByKey.get(courseKey);

      if (existing) {
        existing.lessons.push(lesson);
        continue;
      }

      courseCardsByKey.set(courseKey, {
        key: courseKey,
        title: normalizeCourseTitle(lesson.courseTitle),
        description:
          (lesson.courseId ? courseDescriptionMap.get(lesson.courseId) : "") ||
          "",
        courseId: lesson.courseId || null,
        courseIndex: lesson.courseIndex || null,
        lessons: [lesson],
        isAvailable: true,
        isPlaceholder: false,
      });
    }

    const actualCards = Array.from(courseCardsByKey.values()).map((card) => ({
      ...card,
      lessons: card.lessons
        .slice()
        .sort(
          (left, right) =>
            left.unitIndex - right.unitIndex || left.lessonIndex - right.lessonIndex,
        ),
    }));
    const actualByTitle = new Map(
      actualCards.map((card) => [card.title.trim(), card]),
    );
    const mergedCards: CourseSelectionCard[] = [];
    const usedKeys = new Set<string>();

    for (const courseEntry of COURSE_CATALOG) {
      const title = courseEntry.title.trim();
      const actualCard = actualByTitle.get(title);

      if (actualCard) {
        usedKeys.add(actualCard.key);
        mergedCards.push({
          ...actualCard,
          description: actualCard.description || courseEntry.description,
        });
        continue;
      }

      mergedCards.push({
        key: `placeholder:${title}`,
        title,
        description: courseEntry.description,
        courseId: null,
        courseIndex: null,
        lessons: [],
        isAvailable: false,
        isPlaceholder: true,
      });
    }

    const extraActualCards = actualCards
      .filter((card) => !usedKeys.has(card.key))
      .sort((left, right) => {
        const leftIndex = left.courseIndex ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = right.courseIndex ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex || left.title.localeCompare(right.title, "zh-CN");
      });
    return [...mergedCards, ...extraActualCards];
  }, [workspace]);

  const selectedCourse = useMemo(
    () => courseCards.find((card) => card.key === selectedCourseKey) || null,
    [courseCards, selectedCourseKey],
  );

  function resetWorkspaceSelection(clearUploads = false) {
    setSelectedModuleId(null);
    setReviewOpen(false);
    setFeedback(null);

    if (clearUploads) {
      setPendingAttachments({});
      setRemovedUploadedAttachmentIds({});
    }
  }

  async function selectCourse(card: CourseSelectionCard) {
    if (!card.isAvailable || card.lessons.length === 0) {
      return;
    }

    resetWorkspaceSelection(true);
    setSelectedCourseKey(card.key);
    await loadWorkspace(card.lessons[0]?.id || null);
  }

  function returnToCourseSelection() {
    closeWorkspaceDialog();
    setPendingAttachments({});
    setRemovedUploadedAttachmentIds({});
    setSelectedCourseKey(null);
  }

  function updatePendingAttachments(assignmentKey: string, nextFiles: File[]) {
    setPendingAttachments((prev) => {
      if (nextFiles.length === 0) {
        const { [assignmentKey]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [assignmentKey]: nextFiles,
      };
    });
  }

  function addPendingAttachments(
    assignmentKey: string,
    fileList: FileList | null,
  ) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const incomingFiles = Array.from(fileList);
    const existingFiles = pendingAttachments[assignmentKey] || [];
    const mergedFiles = [...existingFiles];
    const seen = new Set(existingFiles.map(buildFileIdentity));

    for (const file of incomingFiles) {
      const identity = buildFileIdentity(file);
      if (!seen.has(identity)) {
        seen.add(identity);
        mergedFiles.push(file);
      }
    }

    updatePendingAttachments(assignmentKey, mergedFiles);
  }

  function removePendingAttachment(assignmentKey: string, fileIndex: number) {
    const nextFiles = (pendingAttachments[assignmentKey] || []).filter(
      (_, index) => index !== fileIndex,
    );
    updatePendingAttachments(assignmentKey, nextFiles);
  }

  function updateRemovedUploadedAttachments(
    assignmentKey: string,
    nextIds: number[],
  ) {
    setRemovedUploadedAttachmentIds((prev) => {
      if (nextIds.length === 0) {
        const { [assignmentKey]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [assignmentKey]: nextIds,
      };
    });
  }

  function removeUploadedAttachment(
    assignmentKey: string,
    attachmentId: number,
  ) {
    const currentIds = removedUploadedAttachmentIds[assignmentKey] || [];
    if (currentIds.includes(attachmentId)) {
      return;
    }

    updateRemovedUploadedAttachments(assignmentKey, [
      ...currentIds,
      attachmentId,
    ]);
  }

  function restoreUploadedAttachment(
    assignmentKey: string,
    attachmentId: number,
  ) {
    const nextIds = (removedUploadedAttachmentIds[assignmentKey] || []).filter(
      (id) => id !== attachmentId,
    );
    updateRemovedUploadedAttachments(assignmentKey, nextIds);
  }

  async function saveAssignment(
    assignment: AssignmentItem,
    completeNow: boolean,
  ) {
    if (!workspace) {
      return;
    }

    setSavingKey(assignment.assignmentKey);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append("lessonId", String(workspace.lesson.id));
      formData.append("moduleId", String(assignment.moduleId));
      formData.append("assignmentKey", assignment.assignmentKey);
      formData.append("assignmentSource", assignment.assignmentSource);
      formData.append("responseText", drafts[assignment.assignmentKey] || "");
      formData.append("isCompleted", String(completeNow));

      if (assignment.standardItemId !== undefined) {
        formData.append("standardItemId", String(assignment.standardItemId));
      }

      if (assignment.teacherAssignmentId !== undefined) {
        formData.append(
          "teacherAssignmentId",
          String(assignment.teacherAssignmentId),
        );
      }

      if (workspace.resolvedTeacherId) {
        formData.append("teacherId", workspace.resolvedTeacherId);
      }

      const removedAttachmentIds =
        removedUploadedAttachmentIds[assignment.assignmentKey] || [];
      if (removedAttachmentIds.length > 0) {
        const retainedAttachmentIds = (assignment.submission?.attachments || [])
          .map((attachment) => getAttachmentId(attachment))
          .filter(
            (attachmentId): attachmentId is number => attachmentId !== null,
          )
          .filter(
            (attachmentId) => !removedAttachmentIds.includes(attachmentId),
          );

        formData.append(
          "retainedAttachmentIds",
          JSON.stringify(retainedAttachmentIds),
        );
      }

      for (const file of pendingAttachments[assignment.assignmentKey] || []) {
        formData.append("attachments", file);
      }

      const response = await fetch("/api/student/assignments", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "保存失败" }));
        throw new Error(data.error || "保存失败");
      }

      setFeedback(completeNow ? "提交成功" : "草稿已保存");
      updatePendingAttachments(assignment.assignmentKey, []);
      await loadWorkspace(workspace.lesson.id);
    } catch (saveError) {
      console.error("Failed to save assignment", saveError);
      setFeedback(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSavingKey(null);
    }
  }

  function clearAssignmentDraft(assignment: AssignmentItem) {
    setDrafts((prev) => ({
      ...prev,
      [assignment.assignmentKey]: assignment.submission?.responseText || "",
    }));
    updatePendingAttachments(assignment.assignmentKey, []);
    updateRemovedUploadedAttachments(assignment.assignmentKey, []);
    setFeedback(null);
  }

  function canSubmitAssignment(assignment: AssignmentItem) {
    return (drafts[assignment.assignmentKey] || "").trim().length > 0;
  }

  function openModule(moduleId: number) {
    const targetModule = workspace?.modules.find(
      (module) => module.id === moduleId,
    );
    if (targetModule?.isLocked) {
      setFeedback("请先完成前面的学习节点");
      return;
    }
    setSelectedModuleId(moduleId);
    setReviewOpen(false);
    setFeedback(null);
  }

  function closeWorkspaceDialog() {
    setSelectedModuleId(null);
    setReviewOpen(false);
    setFeedback(null);
  }

  if (loading) {
    return (
      <PortalShell roleLabel="学生端">
        <div className="portal-panel flex min-h-[420px] items-center justify-center">
          <div className="relative text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
            <p className="mt-4 text-stone-600">正在载入学生课堂工作台</p>
          </div>
        </div>
      </PortalShell>
    );
  }

  if (error || !user) {
    return (
      <PortalShell roleLabel="学生端">
        <div className="portal-panel mx-auto max-w-xl p-10 text-center">
          <div className="relative">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
              <BookOpen className="h-7 w-7" />
            </div>
            <h1 className="portal-title mt-6 text-3xl font-semibold text-stone-900">
              学生课堂工作台
            </h1>
            <p className="mt-4 text-stone-600">{error || "请先登录后继续"}</p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login/student"
                className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-6 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_12px_26px_rgba(127,23,18,0.22)]"
              >
                前往登录
              </Link>
            </div>
          </div>
        </div>
      </PortalShell>
    );
  }

  if (user.role !== "student" && user.role !== "admin") {
    return (
      <PortalShell
        roleLabel="学生端"
        userName={user.name}
        actions={<LogoutButton />}
      >
        <div className="portal-panel mx-auto max-w-xl p-10 text-center">
          <h1 className="portal-title text-3xl font-semibold text-stone-900">
            当前账号不可进入学生端
          </h1>
          <p className="mt-4 text-stone-600">
            请返回首页，使用对应身份进入平台。
          </p>
        </div>
      </PortalShell>
    );
  }

  if (!workspace) {
    return (
      <PortalShell
        roleLabel="学生端"
        userName={user.name}
        actions={<LogoutButton />}
      >
        <div className="portal-panel mx-auto max-w-2xl p-10 text-center text-stone-600">
          当前还没有可进入的课时，请联系老师先准备课堂内容。
        </div>
      </PortalShell>
    );
  }

  return (
      <PortalShell
        roleLabel="学生端"
        userName={user.name}
        actions={<LogoutButton />}
      >
      {selectedCourse ? (
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">
          <div className="w-full max-w-3xl">
            <button
              onClick={returnToCourseSelection}
              className="rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm text-stone-600 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
            >
              返回选课程
            </button>
          </div>

          <div className="w-full max-w-md">
            <select
              value={selectedLessonId || workspace.lesson.id}
              onChange={(event) => {
                resetWorkspaceSelection(true);
                loadWorkspace(Number(event.target.value));
              }}
              className="w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
            >
              {groupedLessons.map((group) => (
                <optgroup
                  key={`${group.courseTitle}:${group.unitTitle}`}
                  label={`${group.courseTitle} / ${group.unitTitle}`}
                >
                  {group.lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {formatLessonOptionLabel(lesson)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {workspace.modules.length > 0 ? (
            <div className="relative w-full max-w-3xl">
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 100 ${workspace.modules.length * 132}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {workspace.modules.slice(0, -1).map((_, index) => (
                  <line
                    key={`path-${index}`}
                    x1={index % 2 === 0 ? 24 : 76}
                    y1={index * 132 + 66}
                    x2={(index + 1) % 2 === 0 ? 24 : 76}
                    y2={(index + 1) * 132 + 66}
                    stroke="rgba(197,141,62,0.65)"
                    strokeWidth="1.8"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                  />
                ))}
              </svg>
              <div className="relative">
                {workspace.modules.map((module, index) => {
                  const alignRight = index % 2 === 1;
                  const isSelected = module.id === selectedModuleId;
                  const isLit = module.isCompleted || isSelected;
                  const isLocked = Boolean(module.isLocked);

                  return (
                    <div key={module.id} className="relative h-[132px]">
                      <button
                        onClick={() => openModule(module.id)}
                        disabled={isLocked}
                        className={`group absolute top-1/2 flex -translate-y-1/2 -translate-x-1/2 flex-col items-center gap-3 ${
                          alignRight ? "left-[76%]" : "left-[24%]"
                        }`}
                        aria-label={
                          isLocked
                            ? `${getModuleDisplayName(module)}尚未解锁`
                            : `进入${getModuleDisplayName(module)}`
                        }
                      >
                        <div
                          className={`relative flex h-24 w-24 items-center justify-center rounded-full border transition-all ${
                            isLocked
                              ? "border-stone-200 bg-[radial-gradient(circle_at_30%_30%,#ffffff,#eee8df_70%,#ddd5ca_100%)] opacity-70 shadow-[0_8px_18px_rgba(97,73,33,0.06)]"
                              : isLit
                                ? "border-[#c58d3e]/75 bg-[radial-gradient(circle_at_30%_30%,#fffdf7,#f6e5ba_55%,#e2bf68_100%)] shadow-[0_16px_34px_rgba(197,141,62,0.22)]"
                                : "border-[#ddd2c4] bg-[radial-gradient(circle_at_30%_30%,#ffffff,#f6efe5_70%,#e8dfd2_100%)] shadow-[0_12px_26px_rgba(97,73,33,0.08)]"
                          }`}
                        >
                          {isLocked ? (
                            <LockKeyhole className="h-9 w-9 text-stone-400" />
                          ) : (
                            <Star
                              className={`h-10 w-10 transition-colors ${
                                isLit ? "text-[#b77910]" : "text-stone-300"
                              }`}
                              fill={module.isCompleted ? "#d8a44c" : "none"}
                            />
                          )}
                          <span className="absolute bottom-2 text-xs font-semibold text-stone-700">
                            {module.moduleIndex}
                          </span>
                        </div>
                        <span className="max-w-[9rem] rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1 text-center text-xs font-medium leading-5 text-stone-700 shadow-[0_8px_18px_rgba(97,73,33,0.08)]">
                          {getModuleDisplayName(module)}
                          {isLocked ? (
                            <span className="ml-1 text-stone-400">未解锁</span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="portal-panel w-full max-w-2xl px-6 py-10 text-center text-stone-600">
              当前课时还没有配置流程，请联系老师在后台添加课程流程。
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto mt-10 flex max-w-4xl flex-col gap-8">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {courseCards.map((course) => (
              <div
                key={course.key}
                className={`rounded-[24px] border px-5 py-5 shadow-[0_14px_28px_rgba(97,73,33,0.08)] ${
                  course.isAvailable
                    ? "border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,251,244,0.96),rgba(255,255,255,0.94))]"
                    : "border-[#e4d8c4]/70 bg-[linear-gradient(180deg,rgba(250,246,239,0.96),rgba(244,239,231,0.94))]"
                }`}
              >
                <h2 className="text-xl font-semibold text-stone-900">
                  {course.title}
                </h2>

                <button
                  onClick={() => selectCourse(course)}
                  disabled={!course.isAvailable}
                  className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
                    course.isAvailable
                      ? "bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1] shadow-[0_12px_26px_rgba(127,23,18,0.22)]"
                      : "cursor-not-allowed border border-[#d9c29b]/55 bg-white/70 text-stone-400"
                  }`}
                >
                  {course.isAvailable ? "进入路径学习" : "课程待开发"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedModule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6">
          <div className="w-full max-w-3xl rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.22)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-stone-900">
                  {getModuleDisplayName(selectedModule)}
                </h2>
              </div>
              <button
                onClick={closeWorkspaceDialog}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-white/86 text-stone-600 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6">
              {feedback ? (
                <div className="rounded-2xl border border-[#d9c29b]/55 bg-[#fffaf2] px-4 py-3 text-sm text-stone-600">
                  {feedback}
                </div>
              ) : null}

              <div className="mt-6">
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewOpen(true);
                      setFeedback(null);
                    }}
                    disabled={selectedModuleReviewItems.length === 0}
                    className="inline-flex items-center rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    课程回顾
                  </button>
                </div>

                {reviewOpen ? (
                  <ClassroomExperience
                    lessonId={workspace.lesson.id}
                    lessonTitle={workspace.lesson.title}
                    modules={selectedModuleReviewModules}
                    items={selectedModuleReviewItems}
                    onExit={() => setReviewOpen(false)}
                    exitLabel="返回作业"
                    completionExitLabel="返回作业"
                    completionTitle="课程回顾已完成"
                    completionDescription="已返回当前模块作业。"
                  />
                ) : (
                  <div className="space-y-4">
                    {selectedModuleAssignments.length > 0 ? (
                      selectedModuleAssignments.map((assignment) => {
                    const isSaving = savingKey === assignment.assignmentKey;
                    const stagedAttachments =
                      pendingAttachments[assignment.assignmentKey] || [];
                    const uploadedAttachments =
                      assignment.submission?.attachments || [];
                    const removedAttachmentIds =
                      removedUploadedAttachmentIds[assignment.assignmentKey] || [];
                    const visibleUploadedAttachments =
                      uploadedAttachments.filter((attachment) => {
                        const attachmentId = getAttachmentId(attachment);
                        return (
                          attachmentId === null ||
                          !removedAttachmentIds.includes(attachmentId)
                        );
                      });

                        return (
                          <div
                            key={assignment.assignmentKey}
                            className="rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.96),rgba(255,255,255,0.94))] p-5"
                          >
                        <div className="text-lg font-semibold text-stone-900">
                          {assignment.title}
                        </div>

                        <textarea
                          value={drafts[assignment.assignmentKey] || ""}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [assignment.assignmentKey]: event.target.value,
                            }))
                          }
                          rows={6}
                          placeholder="填写作业内容"
                          className="mt-4 w-full rounded-[20px] border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm leading-7 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                        />

                        <div className="mt-4 rounded-[20px] border border-[#d9c29b]/55 bg-[#fffaf2] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex items-center gap-2 text-sm font-medium text-stone-800">
                              <Paperclip className="h-4 w-4 text-[#8f2017]" />
                              附件上传
                            </div>
                            <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#d9c29b]/55 bg-white/90 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]">
                              选择文件
                              <input
                                type="file"
                                multiple
                                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf"
                                className="hidden"
                                disabled={isSaving}
                                onChange={(event) => {
                                  addPendingAttachments(
                                    assignment.assignmentKey,
                                    event.target.files,
                                  );
                                  event.target.value = "";
                                }}
                              />
                            </label>
                          </div>

                          {visibleUploadedAttachments.length > 0 ||
                          stagedAttachments.length > 0 ? (
                            <div className="mt-4 space-y-2">
                              {visibleUploadedAttachments.map((attachment, index) => {
                                const attachmentName =
                                  getAttachmentDisplayName(attachment);
                                const attachmentUrl = getAttachmentUrl(attachment);
                                const attachmentId = getAttachmentId(attachment);

                                return (
                                  <div
                                    key={`${attachment.id || attachmentUrl || attachmentName}-${index}`}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9c29b]/45 bg-white/90 px-4 py-3"
                                  >
                                    <div className="min-w-0 flex-1 truncate text-sm text-stone-700">
                                      {attachmentUrl ? (
                                        <a
                                          href={attachmentUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="truncate hover:text-[#8f2017]"
                                        >
                                          {attachmentName}
                                        </a>
                                      ) : (
                                        attachmentName
                                      )}
                                    </div>
                                    {attachmentId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeUploadedAttachment(
                                            assignment.assignmentKey,
                                            attachmentId,
                                          )
                                        }
                                        disabled={isSaving}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-white/90 text-stone-500 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                                        aria-label={`移除已上传附件 ${attachmentName}`}
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })}

                              {stagedAttachments.map((file, index) => (
                                <div
                                  key={buildFileIdentity(file)}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9c29b]/45 bg-white/90 px-4 py-3"
                                >
                                  <div className="min-w-0 flex-1 truncate text-sm text-stone-700">
                                    {file.name}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removePendingAttachment(
                                        assignment.assignmentKey,
                                        index,
                                      )
                                    }
                                    disabled={isSaving}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-white/90 text-stone-500 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                                    aria-label={`移除附件 ${file.name}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-4 text-sm text-stone-500">
                              暂未上传附件
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={() => clearAssignmentDraft(assignment)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/86 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                          >
                            清空
                          </button>
                          <button
                            onClick={() => saveAssignment(assignment, false)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/86 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            保存草稿
                          </button>
                          <button
                            onClick={() => {
                              if (!canSubmitAssignment(assignment)) {
                                setFeedback("请先填写作业文字内容后再提交");
                                return;
                              }
                              if (!window.confirm("确认提交这份作业吗？")) {
                                return;
                              }
                              saveAssignment(assignment, true);
                            }}
                            disabled={isSaving || !canSubmitAssignment(assignment)}
                            className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)] disabled:opacity-60"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            提交
                          </button>
                        </div>
                        {assignment.submission?.reviewedAt ||
                        assignment.submission?.teacherReviewNote ||
                        typeof assignment.submission?.teacherScore === "number" ? (
                          <div className="mt-4 rounded-[20px] border border-[#d9c29b]/55 bg-[#fffaf2] p-4">
                            <div className="text-sm font-semibold text-stone-900">
                              老师反馈
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-sm text-stone-700">
                              {typeof assignment.submission?.teacherScore === "number" ? (
                                <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5">
                                  评分：{assignment.submission.teacherScore} 分
                                </span>
                              ) : (
                                <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5">
                                  暂未评分
                                </span>
                              )}
                              {assignment.submission?.reviewedAt ? (
                                <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5">
                                  评语时间：{new Date(assignment.submission.reviewedAt).toLocaleString("zh-CN")}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                              {assignment.submission?.teacherReviewNote?.trim()
                                ? assignment.submission.teacherReviewNote
                                : "老师暂未填写评语"}
                            </div>
                          </div>
                        ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-[#d9c29b]/60 bg-[#fffaf2] px-5 py-10 text-center text-sm text-stone-500">
                        当前节点暂无作业。
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PortalShell>
  );
}
