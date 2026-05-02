"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { GeneratedMiniAppResource } from "@/components/teacher/AiMiniAppGenerator";
import type { ImportedOpenMaicResource } from "@/components/teacher/OpenMaicClassroomGenerator";
import LessonAiCreationCenter from "@/components/teacher/LessonAiCreationCenter";
import MediaPreview from "@/components/media/MediaPreview";
import {
  ArrowLeft,
  Eye,
  FileText,
  Star,
  Save,
  Play,
  Copy,
  Pencil,
  GripVertical,
  CheckCircle,
  Clock3,
  Circle,
  Upload,
  Search,
  Trash2,
  X,
  Plus,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getLessons,
  getLesson,
  getModules,
  normalizeModuleItemMiniAppMount,
  type Lesson,
  type LessonModule,
  type ModuleItem,
  type ModuleItemMiniAppMount,
} from "@/lib/directus";

export const dynamic = "force-dynamic";

const ITEM_TYPE_META: Record<string, { icon: string; label: string }> = {
  miniapp: { icon: "🧩", label: "小游戏" },
  video: { icon: "🎬", label: "视频" },
  audio: { icon: "🎵", label: "音频" },
  image: { icon: "🖼", label: "图片" },
  doc: { icon: "📄", label: "文档" },
  ppt: { icon: "📊", label: "演示" },
  interactive: { icon: "🎮", label: "互动" },
};

interface CurrentUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

interface LessonCustomizationResponse {
  customization: {
    modules_config?: string | null;
  } | null;
  teacherResources?: TeacherResource[];
  studentAssignments?: TeacherStudentAssignment[];
  teacherSelections?: Record<string, number[]>;
  assignmentSettings?: Record<
    string,
    {
      dueAt?: string | null;
      isRequired?: boolean;
    }
  >;
  planItems?: PersistedPlanItem[];
  assembledItems?: PersistedPlanItem[];
}

interface TeacherResource {
  id: number;
  auth_user_id: string;
  lesson_id: number;
  module_id: number;
  title: string;
  item_type: ModuleItem["item_type"];
  file_url?: string | null;
  duration?: number | null;
  review_status?: "draft" | "reviewed" | "published";
  version_number?: number;
  ai_generated?: boolean;
  reviewed_at?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  miniapp_mount?: ModuleItemMiniAppMount | null;
  miniappMount?: ModuleItemMiniAppMount | null;
  miniAppMount?: ModuleItemMiniAppMount | null;
  is_shared?: boolean;
  isShared?: boolean;
  access_scope?: "mine" | "shared";
  accessScope?: "mine" | "shared";
  owner_name?: string | null;
  ownerName?: string | null;
}

interface TeacherResourceVersion {
  id: number;
  resource_id: number;
  version_number: number;
  title: string;
  item_type: string;
  created_at?: string;
}

interface PersistedPlanItem {
  id: number;
  lesson_id: number;
  module_id: number;
  source_type: "standard" | "teacher_resource";
  standard_item_id?: number | null;
  teacher_resource_id?: number | null;
  sourceId?: number | null;
  title: string;
  item_type: ModuleItem["item_type"];
  file_url?: string | null;
  duration?: number | null;
  sort_order: number;
}

interface TeacherStudentAssignment {
  id?: number;
  module_id: number;
  lesson_id?: number;
  title: string;
  description: string;
  sort_order: number;
  dueAt?: string | null;
  isRequired?: boolean;
}

type PlanEntry = {
  key: string;
  sourceType: "standard" | "teacher_resource";
  sourceId: number;
  moduleId: number;
  itemType: ModuleItem["item_type"];
  title: string;
  fileUrl?: string;
  duration: number;
  reviewStatus?: "draft" | "reviewed" | "published";
  versionNumber?: number;
  aiGenerated?: boolean;
  miniappMount?: ModuleItemMiniAppMount | null;
  isShared?: boolean;
  accessScope?: "mine" | "shared";
  ownerName?: string | null;
};

type PreviewItem = ModuleItem & {
  sourceType?: "standard" | "teacher_resource";
  sourceItemId?: number | null;
  teacherResourceId?: number | null;
};

type TeacherStudentAssignmentDraft = TeacherStudentAssignment & {
  clientKey: string;
};

type AssignmentMeta = {
  dueAt: string | null;
  isRequired: boolean;
};

type StandardAssignmentMetaRecord = AssignmentMeta & {
  id?: number;
  moduleId: number;
  standardItemId: number;
};

type TemplateModuleRef = {
  moduleIndex: number;
  moduleType: string;
};

type TemplatePlanEntry = TemplateModuleRef & {
  sourceType: "standard" | "teacher_resource";
  sourceId: number;
  itemType: ModuleItem["item_type"];
  title: string;
  fileUrl?: string;
  duration: number;
};

type TemplateTeacherAssignment = TemplateModuleRef & {
  title: string;
  description: string;
  dueAt: string | null;
  isRequired: boolean;
};

type TemplateStandardAssignmentMeta = TemplateModuleRef & {
  itemTitle: string;
  dueAt: string | null;
  isRequired: boolean;
};

type PlanTemplateSnapshot = {
  id: string;
  name: string;
  sourceLessonId: number;
  sourceLessonTitle: string;
  sourceUnitId?: number;
  createdAt: string;
  planEntries: TemplatePlanEntry[];
  teacherAssignments: TemplateTeacherAssignment[];
  standardAssignmentMeta: TemplateStandardAssignmentMeta[];
};

const ASSIGNMENT_META_PREFIX = "<!--assignment-meta:";
const ASSIGNMENT_META_SUFFIX = "-->";
const STANDARD_ASSIGNMENT_META_PREFIX = "__assignment_meta__:standard:";
const PREPARE_TEMPLATE_STORAGE_KEY = "teacher-prepare-templates:v1";
const MINI_APP_ASPECT_RATIO_OPTIONS = ["16:9", "4:3", "1:1", "3:4", "9:16"];

type MiniAppVersionSummary = {
  id: number;
  miniAppId: number;
  version: string;
  isPublished: boolean;
};

type MiniAppSummary = {
  id: number;
  appKey: string;
  name: string;
  publishedVersionId: number | null;
  versions: MiniAppVersionSummary[];
};

type MiniAppMountDraft = {
  miniAppId: string;
  miniAppVersionId: string;
  aspectRatio: string;
  paramsJson: string;
  mountStatus: "active" | "disabled";
};

type MiniAppMountCarrier = {
  miniappMount?: ModuleItemMiniAppMount | null;
  miniapp_mount?: ModuleItemMiniAppMount | null;
  miniAppMount?: ModuleItemMiniAppMount | null;
  is_shared?: boolean;
  isShared?: boolean;
  access_scope?: "mine" | "shared";
  accessScope?: "mine" | "shared";
  owner_name?: string | null;
  ownerName?: string | null;
};

function buildEmptyMiniAppMountDraft(): MiniAppMountDraft {
  return {
    miniAppId: "",
    miniAppVersionId: "",
    aspectRatio: "16:9",
    paramsJson: "{}",
    mountStatus: "active",
  };
}

function parseMiniAppVersionSummary(raw: any): MiniAppVersionSummary {
  return {
    id: Number(raw?.id || 0),
    miniAppId: Number(raw?.miniAppId || raw?.mini_app_id || 0),
    version: String(raw?.version || ""),
    isPublished: Boolean(raw?.isPublished || raw?.is_published),
  };
}

function parseMiniAppSummary(raw: any): MiniAppSummary {
  const rawVersions = Array.isArray(raw?.versions) ? raw.versions : [];

  return {
    id: Number(raw?.id || 0),
    appKey: String(raw?.appKey || raw?.app_key || ""),
    name: String(raw?.name || ""),
    publishedVersionId:
      Number(raw?.publishedVersionId || raw?.published_version_id || 0) || null,
    versions: rawVersions.map(parseMiniAppVersionSummary),
  };
}

function parseMiniAppsPayload(payload: any): MiniAppSummary[] {
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.apps)
      ? payload.apps
      : Array.isArray(payload?.miniApps)
        ? payload.miniApps
        : [];

  return candidates
    .map(parseMiniAppSummary)
    .filter((app): app is MiniAppSummary => Boolean(app.id && app.name));
}

function parseMiniAppParamsJson(value: string): Record<string, unknown> {
  const normalized = value.trim();
  if (!normalized) {
    return {};
  }

  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("小游戏参数必须是合法 JSON 对象");
  }

  return parsed as Record<string, unknown>;
}

function getMiniAppMount(
  input?: MiniAppMountCarrier | null,
): ModuleItemMiniAppMount | null {
  return (
    normalizeModuleItemMiniAppMount(
      input?.miniappMount ||
        input?.miniapp_mount ||
        input?.miniAppMount ||
        null,
    ) || null
  );
}

function isMiniAppTeacherResource(resource: TeacherResource): boolean {
  return resource.item_type === "miniapp" || Boolean(getMiniAppMount(resource));
}

function getTeacherResourceItemType(
  resource: TeacherResource,
): ModuleItem["item_type"] {
  return isMiniAppTeacherResource(resource) ? "miniapp" : resource.item_type;
}

function buildMiniAppMountDraftFromResource(
  resource: TeacherResource,
): MiniAppMountDraft {
  const mount = getMiniAppMount(resource);

  return {
    miniAppId: mount?.miniAppId ? String(mount.miniAppId) : "",
    miniAppVersionId: mount?.miniAppVersionId
      ? String(mount.miniAppVersionId)
      : "",
    aspectRatio: mount?.aspectRatio || mount?.aspect_ratio || "16:9",
    paramsJson: JSON.stringify(mount?.params || {}, null, 2),
    mountStatus:
      mount?.mountStatus === "disabled" || mount?.mount_status === "disabled"
        ? "disabled"
        : "active",
  };
}

function getMiniAppVersions(
  miniApps: MiniAppSummary[],
  miniAppId: string,
): MiniAppVersionSummary[] {
  const app = miniApps.find((candidate) => String(candidate.id) === miniAppId);
  return app?.versions || [];
}

function getMiniAppMountLabel(
  mount?: ModuleItemMiniAppMount | null,
): string | null {
  if (!mount) {
    return null;
  }

  const miniAppName =
    mount.miniApp?.name ||
    mount.mini_app?.name ||
    mount.miniApp?.appKey ||
    mount.mini_app?.app_key ||
    "未命名小游戏";
  const versionLabel =
    mount.version?.version ||
    (mount.miniAppVersionId || mount.mini_app_version_id
      ? `版本 #${mount.miniAppVersionId || mount.mini_app_version_id}`
      : "已发布版本");
  const status = mount.mountStatus || mount.mount_status || "active";

  return `${miniAppName} · ${versionLabel} · ${status === "disabled" ? "已停用" : "已挂载"}`;
}

function getPlanEntryMetaText(item: PlanEntry): string {
  const itemMeta = ITEM_TYPE_META[item.itemType] || {
    icon: "📎",
    label: "资源",
  };

  if (item.itemType === "miniapp") {
    return (
      getMiniAppMountLabel(item.miniappMount) ||
      `${itemMeta.label} · 待完成挂载`
    );
  }

  return `${itemMeta.label} · ${item.duration}秒`;
}

function mergeTeacherResourceMount(
  resource: TeacherResource,
  mount?: ModuleItemMiniAppMount | null,
): TeacherResource {
  const normalizedMount =
    normalizeModuleItemMiniAppMount(mount || null) || null;
  return {
    ...resource,
    miniappMount: normalizedMount,
    miniapp_mount: normalizedMount,
  };
}

function syncTeacherResourceEntries(
  current: Record<number, PlanEntry[]>,
  resources: TeacherResource[],
): Record<number, PlanEntry[]> {
  const resourceMap = new Map(
    resources.map((resource) => [resource.id, resource]),
  );

  return Object.fromEntries(
    Object.entries(current).map(([moduleId, entries]) => [
      moduleId,
      entries.map((entry) => {
        if (entry.sourceType !== "teacher_resource") {
          return entry;
        }

        const resource = resourceMap.get(entry.sourceId);
        return resource ? toTeacherPlanEntry(resource) : entry;
      }),
    ]),
  );
}

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
    const dueAt =
      typeof parsed.dueAt === "string" && parsed.dueAt.trim().length > 0
        ? parsed.dueAt.trim()
        : null;

    return {
      content: content.slice(0, startIndex).trimEnd(),
      meta: {
        dueAt,
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

function serializeAssignmentMetaContent(
  content: string,
  meta: AssignmentMeta,
): string {
  const trimmedContent = content.trim();
  const shouldPersistMeta = Boolean(meta.dueAt) || meta.isRequired;

  if (!shouldPersistMeta) {
    return trimmedContent;
  }

  const metaBlock = `${ASSIGNMENT_META_PREFIX}${JSON.stringify({
    dueAt: meta.dueAt || null,
    isRequired: meta.isRequired,
  })}${ASSIGNMENT_META_SUFFIX}`;

  return trimmedContent ? `${trimmedContent}\n\n${metaBlock}` : metaBlock;
}

function isStandardAssignmentMetaTitle(title: string): boolean {
  return title.startsWith(STANDARD_ASSIGNMENT_META_PREFIX);
}

function parseStandardAssignmentMetaTitle(title: string): number | null {
  if (!isStandardAssignmentMetaTitle(title)) {
    return null;
  }

  const parsed = Number(title.slice(STANDARD_ASSIGNMENT_META_PREFIX.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildStandardAssignmentMetaTitle(standardItemId: number): string {
  return `${STANDARD_ASSIGNMENT_META_PREFIX}${standardItemId}`;
}

function formatAssignmentDueLabel(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60 * 1000,
  );
  return offsetDate.toISOString().slice(0, 16);
}

function formatTemplateTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getModuleDisplayName(module?: LessonModule | null): string {
  if (!module) {
    return "未选择";
  }

  return (
    module.module_name || module.module_type || `流程 ${module.module_index}`
  );
}

function toTemplateModuleRef(module: LessonModule): TemplateModuleRef {
  return {
    moduleIndex: module.module_index,
    moduleType: getModuleDisplayName(module),
  };
}

function loadStoredPrepareTemplates(): PlanTemplateSnapshot[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PREPARE_TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is PlanTemplateSnapshot => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.sourceLessonId === "number" &&
        typeof candidate.sourceLessonTitle === "string" &&
        typeof candidate.createdAt === "string" &&
        Array.isArray(candidate.planEntries) &&
        Array.isArray(candidate.teacherAssignments) &&
        Array.isArray(candidate.standardAssignmentMeta)
      );
    });
  } catch {
    return [];
  }
}

function persistPrepareTemplates(templates: PlanTemplateSnapshot[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PREPARE_TEMPLATE_STORAGE_KEY,
    JSON.stringify(templates),
  );
}

interface SortableItemProps {
  item: PlanEntry;
  onToggle: () => void;
  onPreview: () => void;
}

interface TeacherResourceCardProps {
  item: PlanEntry;
  isSelected: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onVersions: () => void;
  onReviewStatusChange: (status: "draft" | "reviewed" | "published") => void;
}

const RESOURCE_STATUS_META = {
  draft: { label: "AI草稿", className: "border-amber-200 bg-amber-50 text-amber-700" },
  reviewed: { label: "已审校", className: "border-blue-200 bg-blue-50 text-blue-700" },
  published: { label: "已发布", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
} as const;

function SortableItem({ item, onToggle, onPreview }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: item.key,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const itemMeta = ITEM_TYPE_META[item.itemType] || {
    icon: "📎",
    label: "资源",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-[24px] border px-4 py-3.5 transition-all ${"border-[#c58d3e]/55 bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(248,236,208,0.92))] shadow-[0_14px_30px_rgba(197,141,62,0.12)]"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab rounded-full border border-[#d9c29b]/50 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700 active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <button onClick={onToggle} className="flex-shrink-0 rounded-full">
        <CheckCircle className="w-5 h-5 text-[#c58d3e]" />
      </button>

      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
        {itemMeta.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-stone-900">
            {item.title}
          </p>
          <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-2 py-0.5 text-[10px] tracking-[0.12em] text-stone-500">
            {item.sourceType === "standard" ? "标准" : "我的"}
          </span>
        </div>
        <p className="text-xs tracking-[0.12em] text-stone-500">
          {getPlanEntryMetaText(item)}
        </p>
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
      >
        预览
      </button>
    </div>
  );
}

function ModuleItemPicker({
  item,
  isSelected,
  onSelect,
  onPreview,
}: {
  item: PlanEntry;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const itemMeta = ITEM_TYPE_META[item.itemType] || {
    icon: "📎",
    label: "资源",
  };

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-[#d9c29b]/45 bg-white/80 px-4 py-3">
      <button onClick={onSelect} className="flex-shrink-0 rounded-full">
        {isSelected ? (
          <CheckCircle className="h-5 w-5 text-[#c58d3e]" />
        ) : (
          <Circle className="h-5 w-5 text-stone-300 transition-colors hover:text-[#c58d3e]" />
        )}
      </button>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-lg">
        {itemMeta.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-stone-900">
            {item.title}
          </p>
          {isSelected ? (
            <span className="rounded-full border border-[#c58d3e]/55 bg-[#fff2d7] px-2 py-0.5 text-[10px] tracking-[0.12em] text-[#8f2017]">
              已加入课堂
            </span>
          ) : null}
        </div>
        <p className="text-xs tracking-[0.12em] text-stone-500">
          {getPlanEntryMetaText(item)}
        </p>
      </div>
      <button
        type="button"
        onClick={onPreview}
        className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
      >
        预览
      </button>
      <button
        onClick={onSelect}
        className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
      >
        {isSelected ? "移出课堂" : "加入课堂"}
      </button>
    </div>
  );
}

function TeacherResourceCard({
  item,
  isSelected,
  onPreview,
  onEdit,
  onSelect,
  onDelete,
  onVersions,
  onReviewStatusChange,
}: TeacherResourceCardProps) {
  const itemMeta = ITEM_TYPE_META[item.itemType] || {
    icon: "📎",
    label: "资源",
  };
  const status = item.reviewStatus || "draft";
  const statusMeta = RESOURCE_STATUS_META[status];
  const canJoinClassroom = status === "published";
  const isSharedResource = item.accessScope === "shared";

  return (
    <div className="rounded-[22px] border border-[#d9c29b]/45 bg-white/80 px-4 py-4">
      <div className="flex items-start gap-3">
        <button
          onClick={onSelect}
          className="mt-1 flex-shrink-0 rounded-full"
        >
          {isSelected ? (
            <CheckCircle className="h-5 w-5 text-[#c58d3e]" />
          ) : (
            <Circle className="h-5 w-5 text-stone-300 transition-colors hover:text-[#c58d3e]" />
          )}
        </button>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-lg">
          {itemMeta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-sm font-medium text-stone-900">
              {item.title}
            </p>
            {isSelected ? (
              <span className="rounded-full border border-[#c58d3e]/55 bg-[#fff2d7] px-2 py-0.5 text-[10px] tracking-[0.12em] text-[#8f2017]">
                已加入课堂
              </span>
            ) : null}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] tracking-[0.12em] ${statusMeta.className}`}>
              {statusMeta.label}
            </span>
            <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-2 py-0.5 text-[10px] tracking-[0.12em] text-stone-500">
              v{item.versionNumber || 1}
            </span>
            {isSharedResource ? (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] tracking-[0.12em] text-purple-700">
                共享 · {item.ownerName || "其他老师"}
              </span>
            ) : item.isShared ? (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] tracking-[0.12em] text-purple-700">
                已共享
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-xs tracking-[0.12em] text-stone-500">
              {getPlanEntryMetaText(item)}
            </p>
            {item.itemType === "miniapp" ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] tracking-[0.12em] ${
                  item.miniappMount?.mountStatus === "disabled" ||
                  item.miniappMount?.mount_status === "disabled"
                    ? "border-stone-300 bg-stone-100 text-stone-500"
                    : item.miniappMount
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {item.miniappMount
                  ? item.miniappMount.mountStatus === "disabled" ||
                    item.miniappMount.mount_status === "disabled"
                    ? "挂载停用"
                    : "挂载已完成"
                  : "待挂载"}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
        >
          预览
        </button>
        {!isSharedResource && status === "draft" ? (
          <button
            onClick={() => onReviewStatusChange("reviewed")}
            className="rounded-full border border-blue-200 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-blue-700 transition-colors hover:bg-blue-50"
          >
            标记审校
          </button>
        ) : null}
        {!isSharedResource && status !== "published" ? (
          <button
            onClick={() => onReviewStatusChange("published")}
            className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            发布
          </button>
        ) : null}
        {!isSharedResource ? (
          <button
            onClick={onVersions}
            className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
          >
            版本
          </button>
        ) : null}
        {!isSharedResource ? (
          <button
            onClick={onEdit}
            className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
          >
            编辑
          </button>
        ) : null}
        <button
          onClick={onSelect}
          disabled={!isSelected && !canJoinClassroom}
          title={!canJoinClassroom ? "发布后才能加入课堂" : undefined}
          className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1.5 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:cursor-not-allowed disabled:border-[#e7dccb] disabled:text-stone-400"
        >
          {isSelected ? "移出课堂" : canJoinClassroom ? "加入课堂" : "需发布"}
        </button>
        {!isSharedResource ? (
          <button
            onClick={onDelete}
            className="rounded-full border border-rose-200 bg-white/90 p-2 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            title="删除我的资源"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MiniAppMountFields({
  miniApps,
  loading,
  catalogError,
  draft,
  onChange,
}: {
  miniApps: MiniAppSummary[];
  loading: boolean;
  catalogError: string | null;
  draft: MiniAppMountDraft;
  onChange: (patch: Partial<MiniAppMountDraft>) => void;
}) {
  const versions = getMiniAppVersions(miniApps, draft.miniAppId);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-stone-700">
            小游戏
          </label>
          <select
            value={draft.miniAppId}
            onChange={(event) =>
              onChange({
                miniAppId: event.target.value,
                miniAppVersionId: "",
              })
            }
            className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            <option value="">
              {loading ? "正在读取小游戏列表..." : "请选择小游戏"}
            </option>
            {miniApps.map((miniApp) => (
              <option key={miniApp.id} value={miniApp.id}>
                {miniApp.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-stone-700">
            版本
          </label>
          <select
            value={draft.miniAppVersionId}
            onChange={(event) =>
              onChange({ miniAppVersionId: event.target.value })
            }
            className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            <option value="">使用已发布版本</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.version}
                {version.isPublished ? "（已发布）" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-stone-700">
            显示比例
          </label>
          <select
            value={draft.aspectRatio}
            onChange={(event) => onChange({ aspectRatio: event.target.value })}
            className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {MINI_APP_ASPECT_RATIO_OPTIONS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-stone-700">
            挂载状态
          </label>
          <select
            value={draft.mountStatus}
            onChange={(event) =>
              onChange({
                mountStatus:
                  event.target.value === "disabled" ? "disabled" : "active",
              })
            }
            className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-stone-700">
          启动参数 JSON
        </label>
        <textarea
          rows={5}
          value={draft.paramsJson}
          onChange={(event) => onChange({ paramsJson: event.target.value })}
          className="w-full rounded-[22px] border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm leading-7 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          placeholder='例如：{"level":"easy"}'
        />
      </div>

      {catalogError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-700">
          {catalogError}
        </div>
      ) : (
        <p className="text-xs leading-6 text-stone-500">
          版本留空时会跟随小游戏当前已发布版本；参数必须是 JSON 对象。
        </p>
      )}
    </div>
  );
}

function toStandardPlanEntry(item: ModuleItem, moduleId: number): PlanEntry {
  return {
    key: `standard:${item.id}`,
    sourceType: "standard",
    sourceId: item.id,
    moduleId,
    itemType: item.item_type,
    title: item.title,
    fileUrl: item.file_url || "",
    duration: item.duration || 0,
    miniappMount: getMiniAppMount(item),
  };
}

function toTeacherPlanEntry(resource: TeacherResource): PlanEntry {
  const mount = getMiniAppMount(resource);

  return {
    key: `teacher_resource:${resource.id}`,
    sourceType: "teacher_resource",
    sourceId: resource.id,
    moduleId: resource.module_id,
    itemType: getTeacherResourceItemType(resource),
    title: resource.title,
    fileUrl: resource.file_url || "",
    duration: resource.duration || 0,
    reviewStatus: resource.review_status || "draft",
    versionNumber: resource.version_number || 1,
    aiGenerated: resource.ai_generated === true,
    isShared: resource.is_shared === true || resource.isShared === true,
    accessScope: resource.access_scope || resource.accessScope || "mine",
    ownerName: resource.owner_name || resource.ownerName || null,
    miniappMount: mount,
  };
}

function toTeacherAssignmentDraft(
  assignment: TeacherStudentAssignment,
  fallbackIndex: number,
): TeacherStudentAssignmentDraft {
  const parsed = parseAssignmentMeta(assignment.description);
  return {
    ...assignment,
    description: parsed.content,
    dueAt: assignment.dueAt ?? parsed.meta.dueAt,
    isRequired: assignment.isRequired ?? parsed.meta.isRequired,
    clientKey: assignment.id
      ? `assignment:${assignment.id}`
      : `assignment:new:${fallbackIndex}`,
  };
}

function buildTemplateSnapshotFromState(params: {
  templateId: string;
  templateName: string;
  lesson: Lesson;
  modules: LessonModule[];
  planEntries: Record<number, PlanEntry[]>;
  teacherAssignments: TeacherStudentAssignmentDraft[];
  standardAssignmentMeta: Record<number, StandardAssignmentMetaRecord>;
}): PlanTemplateSnapshot {
  const moduleById = new Map(
    params.modules.map((module) => [module.id, module]),
  );

  const planEntries = params.modules.flatMap((module) =>
    (params.planEntries[module.id] || []).map((entry) => ({
      ...toTemplateModuleRef(module),
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      itemType: entry.itemType,
      title: entry.title,
      fileUrl: entry.fileUrl,
      duration: entry.duration,
    })),
  );

  const teacherAssignments = params.teacherAssignments
    .map((assignment) => {
      const module = moduleById.get(assignment.module_id);
      if (!module) {
        return null;
      }

      return {
        ...toTemplateModuleRef(module),
        title: assignment.title.trim(),
        description: assignment.description,
        dueAt: assignment.dueAt || null,
        isRequired: assignment.isRequired === true,
      };
    })
    .filter((assignment): assignment is TemplateTeacherAssignment => {
      if (!assignment) {
        return false;
      }

      return assignment.title.length > 0;
    });

  const standardAssignmentMeta = Object.values(params.standardAssignmentMeta)
    .map((meta) => {
      const module = moduleById.get(meta.moduleId);
      const item = module?.items?.find(
        (candidate) => candidate.id === meta.standardItemId,
      );
      if (!module || !item) {
        return null;
      }

      return {
        ...toTemplateModuleRef(module),
        itemTitle: item.title,
        dueAt: meta.dueAt || null,
        isRequired: meta.isRequired === true,
      };
    })
    .filter((item): item is TemplateStandardAssignmentMeta => Boolean(item));

  return {
    id: params.templateId,
    name: params.templateName,
    sourceLessonId: params.lesson.id,
    sourceLessonTitle: params.lesson.title,
    sourceUnitId: params.lesson.unit_id,
    createdAt: new Date().toISOString(),
    planEntries,
    teacherAssignments,
    standardAssignmentMeta,
  };
}

function buildTemplateSnapshotFromCustomization(params: {
  templateId: string;
  templateName: string;
  lesson: Lesson;
  modules: LessonModule[];
  customizationResponse: LessonCustomizationResponse;
}): PlanTemplateSnapshot {
  const nextTeacherAssignments: TeacherStudentAssignmentDraft[] = [];
  const nextStandardAssignmentMeta: Record<
    number,
    StandardAssignmentMetaRecord
  > = {};

  (params.customizationResponse.studentAssignments || []).forEach(
    (assignment, index) => {
      const standardItemId = parseStandardAssignmentMetaTitle(assignment.title);
      const parsed = parseAssignmentMeta(assignment.description);

      if (standardItemId) {
        nextStandardAssignmentMeta[standardItemId] = {
          id: assignment.id,
          moduleId: assignment.module_id,
          standardItemId,
          dueAt: assignment.dueAt ?? parsed.meta.dueAt,
          isRequired: assignment.isRequired ?? parsed.meta.isRequired,
        };
        return;
      }

      nextTeacherAssignments.push(
        toTeacherAssignmentDraft(
          {
            ...assignment,
            description: parsed.content,
            dueAt: assignment.dueAt ?? parsed.meta.dueAt,
            isRequired: assignment.isRequired ?? parsed.meta.isRequired,
          },
          index,
        ),
      );
    },
  );

  const groupedPlanEntries = (
    params.customizationResponse.planItems || []
  ).reduce<Record<number, PlanEntry[]>>((accumulator, planItem) => {
    const moduleId = planItem.module_id;
    const sourceType = planItem.source_type;
    const sourceId =
      sourceType === "standard"
        ? planItem.standard_item_id || planItem.sourceId || 0
        : planItem.teacher_resource_id || planItem.sourceId || 0;

    accumulator[moduleId] = [
      ...(accumulator[moduleId] || []),
      {
        key: `${sourceType}:${sourceId}`,
        sourceType,
        sourceId: Number(sourceId),
        moduleId,
        itemType: planItem.item_type,
        title: planItem.title,
        fileUrl: planItem.file_url || "",
        duration: planItem.duration || 0,
      },
    ];

    return accumulator;
  }, {});

  return buildTemplateSnapshotFromState({
    templateId: params.templateId,
    templateName: params.templateName,
    lesson: params.lesson,
    modules: params.modules,
    planEntries: groupedPlanEntries,
    teacherAssignments: nextTeacherAssignments,
    standardAssignmentMeta: nextStandardAssignmentMeta,
  });
}

function PrepareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lessonId = parseInt(searchParams.get("lessonId") || "0");
  const requestedModuleId = parseInt(searchParams.get("moduleId") || "0");

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingClassroom, setStartingClassroom] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [planEntries, setPlanEntries] = useState<Record<number, PlanEntry[]>>(
    {},
  );
  const [teacherResources, setTeacherResources] = useState<TeacherResource[]>(
    [],
  );
  const [teacherAssignments, setTeacherAssignments] = useState<
    TeacherStudentAssignmentDraft[]
  >([]);
  const [standardAssignmentMeta, setStandardAssignmentMeta] = useState<
    Record<number, StandardAssignmentMetaRecord>
  >({});
  const [activeModule, setActiveModule] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePanel, setActivePanel] = useState<
    "design" | "ai" | "resources" | "assignments"
  >("resources");
  const [activeDesignSection, setActiveDesignSection] = useState<string | null>(
    null,
  );
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [showMiniAppCreate, setShowMiniAppCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAudioFile, setUploadAudioFile] = useState<File | null>(null);
  const [creatingMiniAppResource, setCreatingMiniAppResource] = useState(false);
  const [miniAppCreateTitle, setMiniAppCreateTitle] = useState("");
  const [miniAppCreateModuleId, setMiniAppCreateModuleId] = useState<
    number | null
  >(null);
  const [miniAppCreateDraft, setMiniAppCreateDraft] =
    useState<MiniAppMountDraft>(buildEmptyMiniAppMountDraft);
  const [resourceFeedback, setResourceFeedback] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [versionResource, setVersionResource] = useState<TeacherResource | null>(null);
  const [resourceVersions, setResourceVersions] = useState<TeacherResourceVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [editingResource, setEditingResource] =
    useState<TeacherResource | null>(null);
  const [editingResourceTitle, setEditingResourceTitle] = useState("");
  const [editingResourceModuleId, setEditingResourceModuleId] = useState<
    number | null
  >(null);
  const [editingResourceFile, setEditingResourceFile] = useState<File | null>(
    null,
  );
  const [editingResourceAudioFile, setEditingResourceAudioFile] =
    useState<File | null>(null);
  const [editingMiniAppDraft, setEditingMiniAppDraft] =
    useState<MiniAppMountDraft>(buildEmptyMiniAppMountDraft);
  const [savingResourceEdit, setSavingResourceEdit] = useState(false);
  const [miniApps, setMiniApps] = useState<MiniAppSummary[]>([]);
  const [loadingMiniApps, setLoadingMiniApps] = useState(false);
  const [miniAppCatalogError, setMiniAppCatalogError] = useState<string | null>(
    null,
  );

  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [copySourceType, setCopySourceType] = useState<"lesson" | "template">(
    "lesson",
  );
  const [availableLessons, setAvailableLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [selectedCopyLessonId, setSelectedCopyLessonId] = useState<
    number | null
  >(null);
  const [storedTemplates, setStoredTemplates] = useState<
    PlanTemplateSnapshot[]
  >([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [copyingPlan, setCopyingPlan] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
        }
      } catch (e) {
        console.error("Failed to load user", e);
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    setStoredTemplates(loadStoredPrepareTemplates());
  }, []);

  useEffect(() => {
    if (!storedTemplates.length) {
      setSelectedTemplateId(null);
      return;
    }

    setSelectedTemplateId((current) =>
      current && storedTemplates.some((item) => item.id === current)
        ? current
        : storedTemplates[0].id,
    );
  }, [storedTemplates]);

  useEffect(() => {
    async function load() {
      if (!lessonId || !currentUser) return;
      try {
        const [lessonData, modulesData, customizationResponse] =
          await Promise.all([
            getLesson(lessonId),
            getModules(lessonId),
            fetch(`/api/teacher/customizations?lessonId=${lessonId}`, {
              cache: "no-store",
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error("Failed to load customization");
              }
              return response.json() as Promise<LessonCustomizationResponse>;
            }),
          ]);
        setLesson(lessonData);
        setModules(modulesData);

        let modulesConfig: Record<string, number[]> = {};
        if (customizationResponse.customization?.modules_config) {
          try {
            modulesConfig = JSON.parse(
              customizationResponse.customization.modules_config,
            );
          } catch (error) {
            console.error("Failed to parse saved customization", error);
          }
        }

        const nextTeacherResources =
          customizationResponse.teacherResources || [];
        setTeacherResources(nextTeacherResources);
        const nextTeacherAssignments: TeacherStudentAssignmentDraft[] = [];
        const nextStandardAssignmentMeta: Record<
          number,
          StandardAssignmentMetaRecord
        > = {};

        (customizationResponse.studentAssignments || []).forEach(
          (assignment, index) => {
            const standardItemId = parseStandardAssignmentMetaTitle(
              assignment.title,
            );
            const parsed = parseAssignmentMeta(assignment.description);

            if (standardItemId) {
              nextStandardAssignmentMeta[standardItemId] = {
                id: assignment.id,
                moduleId: assignment.module_id,
                standardItemId,
                dueAt: parsed.meta.dueAt,
                isRequired: parsed.meta.isRequired,
              };
              return;
            }

            nextTeacherAssignments.push(
              toTeacherAssignmentDraft(
                {
                  ...assignment,
                  description: parsed.content,
                  dueAt: parsed.meta.dueAt,
                  isRequired: parsed.meta.isRequired,
                },
                index,
              ),
            );
          },
        );

        setTeacherAssignments(nextTeacherAssignments);
        setStandardAssignmentMeta(nextStandardAssignmentMeta);

        const initialPlanEntries: Record<number, PlanEntry[]> = {};
        const persistedPlanItems = customizationResponse.planItems || [];

        if (persistedPlanItems.length > 0) {
          for (const planItem of persistedPlanItems) {
            const moduleId = planItem.module_id;
            const entry =
              planItem.source_type === "teacher_resource"
                ? (() => {
                    const teacherResourceId =
                      planItem.teacher_resource_id || planItem.sourceId || 0;
                    const resource = nextTeacherResources.find(
                      (candidate) => candidate.id === teacherResourceId,
                    );

                    if (resource) {
                      return toTeacherPlanEntry(resource);
                    }

                    return {
                      key: `teacher_resource:${teacherResourceId}`,
                      sourceType: "teacher_resource" as const,
                      sourceId: Number(teacherResourceId),
                      moduleId,
                      itemType: planItem.item_type,
                      title: planItem.title,
                      fileUrl: planItem.file_url || "",
                      duration: planItem.duration || 0,
                    };
                  })()
                : (() => {
                    const standardItemId =
                      planItem.standard_item_id || planItem.sourceId || 0;
                    const standardItem = modulesData
                      .find((module) => module.id === moduleId)
                      ?.items?.find((item) => item.id === standardItemId);

                    if (standardItem) {
                      return toStandardPlanEntry(standardItem, moduleId);
                    }

                    return {
                      key: `standard:${standardItemId}`,
                      sourceType: "standard" as const,
                      sourceId: Number(standardItemId),
                      moduleId,
                      itemType: planItem.item_type,
                      title: planItem.title,
                      fileUrl: planItem.file_url || "",
                      duration: planItem.duration || 0,
                    };
                  })();

            initialPlanEntries[moduleId] = [
              ...(initialPlanEntries[moduleId] || []),
              entry,
            ];
          }
        } else {
          for (const mod of modulesData) {
            const moduleItems = mod.items || [];
            const itemIds = moduleItems.map((item) => item.id);
            const storedIds = modulesConfig[String(mod.id)];
            const selectedIds = Array.isArray(storedIds) ? storedIds : itemIds;
            const allowedIds = new Set(itemIds);
            const standardEntries = selectedIds
              .filter((id) => allowedIds.has(id))
              .map((id) => moduleItems.find((item) => item.id === id))
              .filter((item): item is ModuleItem => Boolean(item))
              .map((item) => toStandardPlanEntry(item, mod.id));
            initialPlanEntries[mod.id] = standardEntries;
          }
        }

        setPlanEntries(initialPlanEntries);

        if (modulesData.length > 0) {
          const initialModule =
            modulesData.find((mod) => mod.id === requestedModuleId) ||
            modulesData[0];
          setActiveModule(initialModule.id);
        }
      } catch (e) {
        console.error("Failed to load lesson", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [lessonId, requestedModuleId, currentUser]);

  useEffect(() => {
    if (!showCopyDialog || !lesson) {
      return;
    }

    const currentLesson = lesson;
    let isCancelled = false;

    async function loadLessons() {
      setLoadingLessons(true);
      try {
        const relatedLessons = await getLessons(currentLesson.unit_id);
        if (isCancelled) {
          return;
        }

        const filteredLessons = relatedLessons.filter(
          (candidate) => candidate.id !== currentLesson.id,
        );
        setAvailableLessons(filteredLessons);
        setSelectedCopyLessonId((current) => {
          if (
            current &&
            filteredLessons.some((candidate) => candidate.id === current)
          ) {
            return current;
          }
          return filteredLessons[0]?.id || null;
        });
      } catch (error) {
        console.error("Failed to load related lessons", error);
      } finally {
        if (!isCancelled) {
          setLoadingLessons(false);
        }
      }
    }

    loadLessons();

    return () => {
      isCancelled = true;
    };
  }, [showCopyDialog, lesson]);

  const teacherResourceIdsKey = teacherResources
    .map((resource) => resource.id)
    .sort((left, right) => left - right)
    .join(",");

  useEffect(() => {
    if (!teacherResourceIdsKey) {
      return;
    }

    let isCancelled = false;

    async function loadTeacherResourceMounts() {
      try {
        const response = await fetch(
          `/api/miniapps/mounts?ownerKind=teacher_resource&ownerIds=${teacherResourceIdsKey}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("读取小游戏挂载失败");
        }

        const payload = await response.json().catch(() => ({ mounts: [] }));
        const mountMap = new Map<number, ModuleItemMiniAppMount | null>();

        for (const rawMount of Array.isArray(payload?.mounts)
          ? payload.mounts
          : []) {
          const mount = normalizeModuleItemMiniAppMount(rawMount);
          const ownerId = mount?.ownerId || mount?.owner_id;
          if (!mount || !ownerId) {
            continue;
          }

          mountMap.set(ownerId, mount);
        }

        if (isCancelled) {
          return;
        }

        setTeacherResources((current) => {
          const nextResources = current.map((resource) =>
            mergeTeacherResourceMount(
              resource,
              mountMap.get(resource.id) || null,
            ),
          );
          setPlanEntries((prev) =>
            syncTeacherResourceEntries(prev, nextResources),
          );
          return nextResources;
        });
      } catch (error) {
        console.error("Failed to load teacher resource mini app mounts", error);
      }
    }

    void loadTeacherResourceMounts();

    return () => {
      isCancelled = true;
    };
  }, [teacherResourceIdsKey]);

  useEffect(() => {
    if (
      !showMiniAppCreate &&
      !(editingResource && isMiniAppTeacherResource(editingResource))
    ) {
      return;
    }

    if (miniApps.length > 0 || loadingMiniApps) {
      return;
    }

    let isCancelled = false;

    async function loadMiniAppCatalog() {
      setLoadingMiniApps(true);
      setMiniAppCatalogError(null);

      try {
        const response = await fetch("/api/miniapps/catalog", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string" && payload.error.trim()
              ? payload.error.trim()
              : "小游戏列表暂时不可用，请确认小游戏管理接口已开放。",
          );
        }

        if (isCancelled) {
          return;
        }

        setMiniApps(parseMiniAppsPayload(payload));
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to load mini app catalog", error);
          setMiniAppCatalogError(
            error instanceof Error
              ? error.message
              : "小游戏列表暂时不可用，请稍后重试。",
          );
        }
      } finally {
        if (!isCancelled) {
          setLoadingMiniApps(false);
        }
      }
    }

    void loadMiniAppCatalog();

    return () => {
      isCancelled = true;
    };
  }, [editingResource, loadingMiniApps, miniApps.length, showMiniAppCreate]);

  function resolveTargetModule(source: TemplateModuleRef): LessonModule | null {
    return (
      modules.find(
        (module) =>
          module.module_index === source.moduleIndex &&
          getModuleDisplayName(module) === source.moduleType,
      ) ||
      modules.find(
        (module) => getModuleDisplayName(module) === source.moduleType,
      ) ||
      null
    );
  }

  function buildCurrentTemplateSnapshot(
    nextTemplateName: string,
  ): PlanTemplateSnapshot | null {
    if (!lesson) {
      return null;
    }

    return buildTemplateSnapshotFromState({
      templateId: `template-${Date.now()}`,
      templateName: nextTemplateName,
      lesson,
      modules,
      planEntries,
      teacherAssignments,
      standardAssignmentMeta,
    });
  }

  function applyTemplateSnapshot(snapshot: PlanTemplateSnapshot) {
    const nextPlanEntries: Record<number, PlanEntry[]> = {};
    const nextTeacherAssignmentsByModule = new Map<
      number,
      TeacherStudentAssignmentDraft[]
    >();
    const nextStandardAssignmentMeta: Record<
      number,
      StandardAssignmentMetaRecord
    > = {};
    const canReuseTeacherResources = snapshot.sourceLessonId === lessonId;

    for (const entry of snapshot.planEntries) {
      const targetModule = resolveTargetModule(entry);
      if (!targetModule) {
        continue;
      }

      if (
        entry.sourceType === "teacher_resource" &&
        !canReuseTeacherResources
      ) {
        continue;
      }

      let planEntry: PlanEntry | null = null;

      if (entry.sourceType === "standard") {
        const matchedStandardItem = (targetModule.items || []).find(
          (item) =>
            item.title === entry.title && item.item_type === entry.itemType,
        );

        if (!matchedStandardItem) {
          continue;
        }

        planEntry = toStandardPlanEntry(matchedStandardItem, targetModule.id);
      } else {
        const matchedTeacherResource = teacherResources.find(
          (resource) =>
            resource.id === entry.sourceId &&
            resource.module_id === targetModule.id,
        );

        if (!matchedTeacherResource) {
          continue;
        }

        planEntry = toTeacherPlanEntry(matchedTeacherResource);
      }

      const currentEntries = nextPlanEntries[targetModule.id] || [];
      if (
        !currentEntries.some((candidate) => candidate.key === planEntry.key)
      ) {
        nextPlanEntries[targetModule.id] = [...currentEntries, planEntry];
      }
    }

    for (const assignment of snapshot.teacherAssignments) {
      const targetModule = resolveTargetModule(assignment);
      if (!targetModule) {
        continue;
      }

      const currentAssignments =
        nextTeacherAssignmentsByModule.get(targetModule.id) || [];
      currentAssignments.push({
        clientKey: `assignment:copied:${Date.now()}:${currentAssignments.length}`,
        module_id: targetModule.id,
        title: assignment.title,
        description: assignment.description,
        sort_order: currentAssignments.length + 1,
        dueAt: assignment.dueAt,
        isRequired: assignment.isRequired,
      });
      nextTeacherAssignmentsByModule.set(targetModule.id, currentAssignments);
    }

    for (const meta of snapshot.standardAssignmentMeta) {
      const targetModule = resolveTargetModule(meta);
      if (!targetModule) {
        continue;
      }

      const matchedStandardAssignment = (targetModule.items || []).find(
        (item) =>
          item.title === meta.itemTitle &&
          typeof item.student_activity === "string" &&
          item.student_activity.trim().length > 0,
      );

      if (!matchedStandardAssignment) {
        continue;
      }

      nextStandardAssignmentMeta[matchedStandardAssignment.id] = {
        moduleId: targetModule.id,
        standardItemId: matchedStandardAssignment.id,
        dueAt: meta.dueAt,
        isRequired: meta.isRequired,
      };
    }

    setPlanEntries(nextPlanEntries);
    setTeacherAssignments(
      Array.from(nextTeacherAssignmentsByModule.values()).flatMap(
        (items) => items,
      ),
    );
    setStandardAssignmentMeta(nextStandardAssignmentMeta);
    setSaved(false);
  }

  async function handleApplyCopySource() {
    if (!lesson) {
      return;
    }

    setCopyingPlan(true);
    setCopyError(null);

    try {
      if (copySourceType === "template") {
        const template = storedTemplates.find(
          (item) => item.id === selectedTemplateId,
        );
        if (!template) {
          throw new Error("请选择一个可用模板");
        }

        applyTemplateSnapshot(template);
        setShowCopyDialog(false);
        setTemplateFeedback(`已套用模板「${template.name}」`);
        return;
      }

      if (!selectedCopyLessonId) {
        throw new Error("请选择一个来源课时");
      }

      const sourceLesson = availableLessons.find(
        (item) => item.id === selectedCopyLessonId,
      );
      if (!sourceLesson) {
        throw new Error("未找到来源课时");
      }

      const [sourceModules, sourceCustomizationResponse] = await Promise.all([
        getModules(selectedCopyLessonId),
        fetch(`/api/teacher/customizations?lessonId=${selectedCopyLessonId}`, {
          cache: "no-store",
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error("读取来源课时失败");
          }

          return response.json() as Promise<LessonCustomizationResponse>;
        }),
      ]);

      const snapshot = buildTemplateSnapshotFromCustomization({
        templateId: `copy-${selectedCopyLessonId}-${Date.now()}`,
        templateName: `${sourceLesson.title} 教案复制`,
        lesson: sourceLesson,
        modules: sourceModules,
        customizationResponse: sourceCustomizationResponse,
      });

      applyTemplateSnapshot(snapshot);
      setShowCopyDialog(false);
      setTemplateFeedback(`已复制「${sourceLesson.title}」的备课安排`);
    } catch (error) {
      console.error("Failed to apply copied plan", error);
      setCopyError(error instanceof Error ? error.message : "复制失败，请重试");
    } finally {
      setCopyingPlan(false);
    }
  }

  function handleSaveTemplate() {
    const normalizedName = templateName.trim();
    if (!normalizedName) {
      setCopyError("请先填写模板名称");
      return;
    }

    const snapshot = buildCurrentTemplateSnapshot(normalizedName);
    if (!snapshot) {
      setCopyError("当前课时信息不完整，暂时无法保存模板");
      return;
    }

    const nextTemplates = [snapshot, ...storedTemplates].slice(0, 12);
    persistPrepareTemplates(nextTemplates);
    setStoredTemplates(nextTemplates);
    setTemplateName("");
    setShowTemplateDialog(false);
    setTemplateFeedback(`已保存模板「${normalizedName}」`);
    setCopyError(null);
    setSelectedTemplateId(snapshot.id);
  }

  function handleDeleteTemplate(templateId: string) {
    const nextTemplates = storedTemplates.filter(
      (item) => item.id !== templateId,
    );
    persistPrepareTemplates(nextTemplates);
    setStoredTemplates(nextTemplates);
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId(nextTemplates[0]?.id || null);
    }
  }

  function openMiniAppCreateDialog() {
    setShowMiniAppCreate(true);
    setMiniAppCreateTitle("");
    setMiniAppCreateModuleId(activeModule || modules[0]?.id || null);
    setMiniAppCreateDraft(buildEmptyMiniAppMountDraft());
    setResourceError(null);
  }

  function closeMiniAppCreateDialog() {
    if (creatingMiniAppResource) {
      return;
    }

    setShowMiniAppCreate(false);
    setMiniAppCreateTitle("");
    setMiniAppCreateModuleId(null);
    setMiniAppCreateDraft(buildEmptyMiniAppMountDraft());
    setResourceError(null);
  }

  async function createMiniAppTeacherResource(): Promise<TeacherResource> {
    if (!miniAppCreateModuleId) {
      throw new Error("请先选择要归属的流程");
    }

    const mountParams = parseMiniAppParamsJson(miniAppCreateDraft.paramsJson);
    const response = await fetch("/api/teacher/resources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lessonId,
        moduleId: miniAppCreateModuleId,
        title: miniAppCreateTitle.trim(),
        itemType: "miniapp",
        miniAppMount: {
          miniAppId: Number(miniAppCreateDraft.miniAppId),
          miniAppVersionId: miniAppCreateDraft.miniAppVersionId
            ? Number(miniAppCreateDraft.miniAppVersionId)
            : null,
          aspectRatio: miniAppCreateDraft.aspectRatio || "16:9",
          mountStatus: miniAppCreateDraft.mountStatus,
          titleOverride: miniAppCreateTitle.trim(),
          params: mountParams,
        },
      }),
    });

    const payload = await response
      .json()
      .catch(() => ({ error: "创建小游戏资源失败" }));
    if (!response.ok || (!payload?.resource && !payload?.teacherResource)) {
      throw new Error(
        typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "创建小游戏资源失败",
      );
    }

    return (payload.resource || payload.teacherResource) as TeacherResource;
  }

  function handleGeneratedAiMiniAppResource(
    generatedResource: GeneratedMiniAppResource,
  ) {
    const resource = generatedResource as TeacherResource;
    const entry = toTeacherPlanEntry(resource);

    setTeacherResources((current) => {
      if (current.some((item) => item.id === resource.id)) {
        return current;
      }
      return [...current, resource];
    });
    setPlanEntries((current) => {
      const entries = current[resource.module_id] || [];
      if (entries.some((item) => item.key === entry.key)) {
        return current;
      }
      return {
        ...current,
        [resource.module_id]: [...entries, entry],
      };
    });
    setSaved(false);
    setResourceFeedback(
      `AI 已生成小游戏「${resource.title}」，并加入当前课堂。`,
    );
    setResourceError(null);
  }


  function handleImportedOpenMaicResources(
    importedResources: ImportedOpenMaicResource[],
  ) {
    const resources = importedResources as TeacherResource[];
    if (resources.length === 0) {
      return;
    }

    setTeacherResources((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      return [
        ...current,
        ...resources.filter((resource) => !existingIds.has(resource.id)),
      ];
    });
    setPlanEntries((current) => {
      const next = { ...current };
      for (const resource of resources) {
        const entry = toTeacherPlanEntry(resource);
        const entries = next[resource.module_id] || [];
        if (entries.some((item) => item.key === entry.key)) {
          continue;
        }
        next[resource.module_id] = [...entries, entry];
      }
      return next;
    });
    setSaved(false);
    setResourceFeedback(
      `已导入 OpenMAIC 课件资源 ${resources.length} 个，并加入当前课堂。`,
    );
    setResourceError(null);
  }

  function handleGeneratedResourceDeleted(resourceId: number) {
    setTeacherResources((current) =>
      current.filter((resource) => resource.id !== resourceId),
    );
    setPlanEntries((current) =>
      Object.fromEntries(
        Object.entries(current).map(([moduleId, entries]) => [
          moduleId,
          entries.filter(
            (entry) =>
              !(
                entry.sourceType === "teacher_resource" &&
                entry.sourceId === resourceId
              ),
          ),
        ]),
      ),
    );
    setSaved(false);
    setResourceFeedback("已从当前课堂中移除对应资源。");
    setResourceError(null);
  }

  function openEditTeacherResource(resource: TeacherResource) {
    setEditingResource(resource);
    setEditingResourceTitle(resource.title);
    setEditingResourceModuleId(resource.module_id);
    setEditingResourceFile(null);
    setEditingResourceAudioFile(null);
    setEditingMiniAppDraft(buildMiniAppMountDraftFromResource(resource));
    setResourceError(null);
  }

  function closeEditTeacherResource() {
    if (savingResourceEdit) {
      return;
    }

    setEditingResource(null);
    setEditingResourceTitle("");
    setEditingResourceModuleId(null);
    setEditingResourceFile(null);
    setEditingResourceAudioFile(null);
    setEditingMiniAppDraft(buildEmptyMiniAppMountDraft());
    setResourceError(null);
  }

  function togglePlanEntry(moduleId: number, entry: PlanEntry) {
    setPlanEntries((prev) => {
      const current = prev[moduleId] || [];
      if (current.some((item) => item.key === entry.key)) {
        return {
          ...prev,
          [moduleId]: current.filter((item) => item.key !== entry.key),
        };
      }

      return { ...prev, [moduleId]: [...current, entry] };
    });
    setSaved(false);
  }

  function handleDragEnd(event: DragEndEvent, moduleId: number) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPlanEntries((prev) => {
      const current = prev[moduleId] || [];
      const oldIndex = current.findIndex((item) => item.key === active.id);
      const newIndex = current.findIndex((item) => item.key === over.id);
      return { ...prev, [moduleId]: arrayMove(current, oldIndex, newIndex) };
    });
    setSaved(false);
  }

  function addTeacherAssignment(moduleId: number) {
    setTeacherAssignments((prev) => [
      ...prev,
      {
        clientKey: `assignment:new:${Date.now()}:${prev.length}`,
        module_id: moduleId,
        title: "",
        description: "",
        sort_order:
          prev.filter((item) => item.module_id === moduleId).length + 1,
        dueAt: null,
        isRequired: true,
      },
    ]);
    setSaved(false);
  }

  function updateTeacherAssignment(
    clientKey: string,
    patch: Partial<
      Pick<
        TeacherStudentAssignmentDraft,
        "title" | "description" | "dueAt" | "isRequired"
      >
    >,
  ) {
    setTeacherAssignments((prev) =>
      prev.map((item) =>
        item.clientKey === clientKey ? { ...item, ...patch } : item,
      ),
    );
    setSaved(false);
  }

  function updateStandardAssignmentSetting(
    standardItemId: number,
    moduleId: number,
    patch: Partial<AssignmentMeta>,
  ) {
    setStandardAssignmentMeta((prev) => {
      const current = prev[standardItemId] || {
        moduleId,
        standardItemId,
        ...getDefaultAssignmentMeta(),
      };

      return {
        ...prev,
        [standardItemId]: {
          ...current,
          ...patch,
        },
      };
    });
    setSaved(false);
  }

  function removeTeacherAssignment(clientKey: string) {
    setTeacherAssignments((prev) =>
      prev.filter((item) => item.clientKey !== clientKey),
    );
    setSaved(false);
  }

  async function persistCustomization() {
    if (!currentUser) {
      throw new Error("请先登录");
    }

    let sortCursor = 1;
    const sortedPlanItems = modules.flatMap((module) =>
      (planEntries[module.id] || []).map((entry, index) => ({
        moduleId: module.id,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        sortOrder: sortCursor++,
        isPrimary: index === 0,
      })),
    );

    const sortedStudentAssignments = modules.flatMap((module) =>
      teacherAssignments
        .filter((assignment) => assignment.module_id === module.id)
        .map((assignment, index) => ({
          id: assignment.id,
          moduleId: module.id,
          title: assignment.title.trim(),
          description: serializeAssignmentMetaContent(assignment.description, {
            dueAt: assignment.dueAt || null,
            isRequired: assignment.isRequired === true,
          }),
          sortOrder: index + 1,
        }))
        .filter((assignment) => assignment.title.length > 0),
    );

    const standardAssignmentMetaPayload = modules.flatMap((module) =>
      (module.items || [])
        .filter(
          (item) =>
            typeof item.student_activity === "string" &&
            item.student_activity.trim().length > 0,
        )
        .map((item, index) => {
          const meta = standardAssignmentMeta[item.id];

          if (!meta || (!meta.dueAt && !meta.isRequired)) {
            return null;
          }

          return {
            id: meta.id,
            moduleId: module.id,
            title: buildStandardAssignmentMetaTitle(item.id),
            description: serializeAssignmentMetaContent("", {
              dueAt: meta.dueAt || null,
              isRequired: meta.isRequired === true,
            }),
            sortOrder: sortedStudentAssignments.length + index + 1,
          };
        })
        .filter(Boolean),
    );

    const response = await fetch("/api/teacher/customizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lessonId,
        title: `${lesson?.title} - 我的教案`,
        planItems: sortedPlanItems,
        studentAssignments: [
          ...sortedStudentAssignments,
          ...standardAssignmentMetaPayload,
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save customization");
    }

    const data = await response.json();

    if (Array.isArray(data.studentAssignments)) {
      const nextTeacherAssignments: TeacherStudentAssignmentDraft[] = [];
      const nextStandardAssignmentMeta: Record<
        number,
        StandardAssignmentMetaRecord
      > = {};

      data.studentAssignments.forEach(
        (assignment: TeacherStudentAssignment, index: number) => {
          const standardItemId = parseStandardAssignmentMetaTitle(
            assignment.title,
          );
          const parsed = parseAssignmentMeta(assignment.description);

          if (standardItemId) {
            nextStandardAssignmentMeta[standardItemId] = {
              id: assignment.id,
              moduleId: assignment.module_id,
              standardItemId,
              dueAt: parsed.meta.dueAt,
              isRequired: parsed.meta.isRequired,
            };
            return;
          }

          nextTeacherAssignments.push(
            toTeacherAssignmentDraft(
              {
                ...assignment,
                description: parsed.content,
                dueAt: parsed.meta.dueAt,
                isRequired: parsed.meta.isRequired,
              },
              index,
            ),
          );
        },
      );

      setTeacherAssignments(nextTeacherAssignments);
      setStandardAssignmentMeta(nextStandardAssignmentMeta);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await persistCustomization();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save", e);
      setSaveError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPptx() {
    const items = Object.values(planEntries)
      .flat()
      .sort((left, right) => (left.moduleId || 0) - (right.moduleId || 0));

    if (items.length === 0) {
      setSaveError("请先装配至少一个课堂资源，再导出 PPT。");
      return;
    }

    setExportingPptx(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/teacher/pptx/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonTitle: lesson?.title || "课程课件",
          items: items.map((item) => ({
            title: item.title,
            itemType: item.itemType,
            sourceType: item.sourceType,
            fileUrl: item.fileUrl,
            duration: item.duration,
            teacherResourceId:
              item.sourceType === "teacher_resource" ? item.sourceId : null,
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "导出 PPT 失败");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${lesson?.title || "课程课件"}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "导出 PPT 失败");
    } finally {
      setExportingPptx(false);
    }
  }

  async function handleStartClassroom() {
    setStartingClassroom(true);
    setSaveError(null);
    try {
      await persistCustomization();
      setSaved(true);
      router.push(`/teacher/classroom?lessonId=${lessonId}`);
    } catch (e) {
      console.error("Failed to start classroom", e);
      setSaveError("进入课堂前保存失败，请重试");
      setStartingClassroom(false);
    }
  }

  async function uploadTeacherResource(params: {
    moduleId: number;
    title: string;
    file: File;
    audioFile?: File | null;
  }): Promise<TeacherResource> {
    const formData = new FormData();
    formData.append("file", params.file);
    formData.append("moduleId", String(params.moduleId));
    formData.append("lessonId", String(lessonId));
    formData.append("title", params.title);

    if (params.audioFile && params.file.type.startsWith("image/")) {
      formData.append("audioFile", params.audioFile);
    }

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(() => ({ error: "上传失败" }));
    if (!response.ok || !data.teacherResource) {
      throw new Error(data.error || "上传失败");
    }

    return data.teacherResource as TeacherResource;
  }

  async function handleUpload() {
    if (!activeModule || !uploadFile) return;
    setUploading(true);
    try {
      const resource = await uploadTeacherResource({
        moduleId: activeModule,
        title: uploadTitle || uploadFile.name,
        file: uploadFile,
        audioFile: uploadAudioFile,
      });

      const entry = toTeacherPlanEntry(resource);
      setTeacherResources((current) => [...current, resource]);
      setPlanEntries((current) => ({
        ...current,
        [activeModule]: [...(current[activeModule] || []), entry],
      }));
      setSaved(false);
      setResourceFeedback(`已上传资源「${resource.title}」，并加入当前课堂。`);
      setResourceError(null);
      setShowUpload(false);
      setUploadTitle("");
      setUploadFile(null);
      setUploadAudioFile(null);
    } catch (e) {
      console.error("Upload failed", e);
      const message = e instanceof Error ? e.message : "上传失败";
      setResourceError(message);
      alert(message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateMiniAppResource() {
    if (!miniAppCreateModuleId) {
      setResourceError("请先选择要归属的流程");
      return;
    }

    const normalizedTitle = miniAppCreateTitle.trim();
    if (!normalizedTitle) {
      setResourceError("请先填写资源标题");
      return;
    }

    if (!miniAppCreateDraft.miniAppId) {
      setResourceError("请先选择小游戏");
      return;
    }

    try {
      parseMiniAppParamsJson(miniAppCreateDraft.paramsJson);
    } catch (error) {
      setResourceError(
        error instanceof Error
          ? error.message
          : "小游戏参数必须是合法 JSON 对象",
      );
      return;
    }

    setCreatingMiniAppResource(true);
    setResourceError(null);

    try {
      const mountedResource = await createMiniAppTeacherResource();

      setTeacherResources((current) => [...current, mountedResource]);
      setPlanEntries((current) => ({
        ...current,
        [mountedResource.module_id]: [
          ...(current[mountedResource.module_id] || []),
          toTeacherPlanEntry(mountedResource),
        ],
      }));
      setSaved(false);
      setResourceFeedback(
        `已创建小游戏资源「${mountedResource.title}」，并加入当前课堂。`,
      );
      setShowMiniAppCreate(false);
      setMiniAppCreateTitle("");
      setMiniAppCreateModuleId(null);
      setMiniAppCreateDraft(buildEmptyMiniAppMountDraft());
    } catch (error) {
      console.error("Failed to create mini app teacher resource", error);
      setResourceError(
        error instanceof Error ? error.message : "创建小游戏资源失败",
      );
    } finally {
      setCreatingMiniAppResource(false);
    }
  }

  async function handleSaveEditedResource() {
    if (!editingResource || !editingResourceModuleId) {
      return;
    }

    const normalizedTitle = editingResourceTitle.trim();
    if (!normalizedTitle) {
      setResourceError("请先填写资源标题");
      return;
    }

    setSavingResourceEdit(true);
    setResourceError(null);

    try {
      if (isMiniAppTeacherResource(editingResource)) {
        if (!editingMiniAppDraft.miniAppId) {
          throw new Error("请先选择小游戏");
        }

        const mountParams = parseMiniAppParamsJson(
          editingMiniAppDraft.paramsJson,
        );

        const response = await fetch(
          `/api/teacher/resources/${editingResource.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: normalizedTitle,
              moduleId: editingResourceModuleId,
              itemType: "miniapp",
              miniAppMount: {
                miniAppId: Number(editingMiniAppDraft.miniAppId),
                miniAppVersionId: editingMiniAppDraft.miniAppVersionId
                  ? Number(editingMiniAppDraft.miniAppVersionId)
                  : null,
                aspectRatio: editingMiniAppDraft.aspectRatio || "16:9",
                mountStatus: editingMiniAppDraft.mountStatus,
                titleOverride: normalizedTitle,
                params: mountParams,
              },
            }),
          },
        );

        const data = await response
          .json()
          .catch(() => ({ error: "更新资源失败" }));
        if (!response.ok || !data.resource) {
          throw new Error(data.error || "更新资源失败");
        }

        const updatedResource = data.resource as TeacherResource;

        setTeacherResources((current) => {
          const nextResources = current.map((resource) =>
            resource.id === editingResource.id ? updatedResource : resource,
          );
          setPlanEntries((prev) =>
            syncTeacherResourceEntries(prev, nextResources),
          );
          return nextResources;
        });
        setSaved(false);
      setResourceFeedback(`已更新小游戏资源「${updatedResource.title}」。`);
        closeEditTeacherResource();
        return;
      }

      const formData = new FormData();
      formData.append("title", normalizedTitle);
      formData.append("moduleId", String(editingResourceModuleId));

      if (editingResourceFile) {
        formData.append("file", editingResourceFile);
      }

      if (editingResourceAudioFile) {
        formData.append("audioFile", editingResourceAudioFile);
      }

      const response = await fetch(
        `/api/teacher/resources/${editingResource.id}`,
        {
          method: "PATCH",
          body: formData,
        },
      );

      const data = await response
        .json()
        .catch(() => ({ error: "更新资源失败" }));
      if (!response.ok || !data.resource) {
        throw new Error(data.error || "更新资源失败");
      }

      const updatedResource = data.resource as TeacherResource;

      setTeacherResources((current) =>
        current.map((resource) =>
          resource.id === editingResource.id
            ? mergeTeacherResourceMount(
                updatedResource,
                getMiniAppMount(resource),
              )
            : resource,
        ),
      );
      setPlanEntries((current) => {
        const mergedUpdatedResource = mergeTeacherResourceMount(
          updatedResource,
          getMiniAppMount(editingResource),
        );
        const updatedEntry = toTeacherPlanEntry(mergedUpdatedResource);
        const nextEntries: Record<number, PlanEntry[]> = {};
        let wasSelected = false;

        Object.entries(current).forEach(([moduleKey, entries]) => {
          const moduleId = Number(moduleKey);
          const remainingEntries = entries.filter((entry) => {
            const matchesEditedResource =
              entry.sourceType === "teacher_resource" &&
              entry.sourceId === editingResource.id;

            if (matchesEditedResource) {
              wasSelected = true;
            }

            return !matchesEditedResource;
          });

          nextEntries[moduleId] = remainingEntries;
        });

        if (wasSelected) {
          nextEntries[updatedResource.module_id] = [
            ...(nextEntries[updatedResource.module_id] || []),
            updatedEntry,
          ];
        }

        return nextEntries;
      });
      setSaved(false);
      setResourceFeedback(`已更新资源「${updatedResource.title}」。`);
      setEditingResource(null);
      setEditingResourceTitle("");
      setEditingResourceModuleId(null);
      setEditingResourceFile(null);
      setEditingResourceAudioFile(null);
      setEditingMiniAppDraft(buildEmptyMiniAppMountDraft());
    } catch (error) {
      console.error("Failed to edit teacher resource", error);
      setResourceError(error instanceof Error ? error.message : "更新资源失败");
    } finally {
      setSavingResourceEdit(false);
    }
  }

  async function handleDeleteTeacherResource(resourceId: number) {
    if (
      !window.confirm(
        "确认删除这条老师私有资源吗？删除后会同时从当前教案中移除。",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/teacher/resources/${resourceId}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({ error: "删除失败" }));
      if (!response.ok) {
        throw new Error(data.error || "删除失败");
      }

      setTeacherResources((current) =>
        current.filter((resource) => resource.id !== resourceId),
      );
      setPlanEntries((current) =>
        Object.fromEntries(
          Object.entries(current).map(([moduleId, entries]) => [
            moduleId,
            entries.filter(
              (entry) =>
                !(
                  entry.sourceType === "teacher_resource" &&
                  entry.sourceId === resourceId
                ),
            ),
          ]),
        ),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Failed to delete teacher resource", error);
      alert(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleTeacherResourceReviewStatusChange(
    resourceId: number,
    reviewStatus: "draft" | "reviewed" | "published",
  ) {
    setResourceError(null);
    setResourceFeedback(null);

    try {
      const response = await fetch(`/api/teacher/resources/${resourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        resource?: TeacherResource;
        error?: string;
      };

      if (!response.ok || !data.resource) {
        throw new Error(data.error || "更新资源状态失败");
      }

      const updatedResource = data.resource;
      setTeacherResources((current) =>
        current.map((resource) =>
          resource.id === updatedResource.id ? updatedResource : resource,
        ),
      );
      setPlanEntries((current) =>
        syncTeacherResourceEntries(current, [updatedResource]),
      );
      setResourceFeedback(
        reviewStatus === "published"
          ? `资源「${updatedResource.title}」已发布。`
          : `资源「${updatedResource.title}」已标记为已审校。`,
      );
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : "更新资源状态失败",
      );
    }
  }

  async function openTeacherResourceVersions(resource: TeacherResource) {
    setVersionResource(resource);
    setResourceVersions([]);
    setLoadingVersions(true);
    setResourceError(null);

    try {
      const response = await fetch(`/api/teacher/resources/${resource.id}/versions`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        versions?: TeacherResourceVersion[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(data.versions)) {
        throw new Error(data.error || "读取资源版本失败");
      }
      setResourceVersions(data.versions);
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : "读取资源版本失败");
    } finally {
      setLoadingVersions(false);
    }
  }

  async function restoreTeacherResourceVersion(versionNumber: number) {
    if (!versionResource) return;
    if (!window.confirm(`确认回滚到 v${versionNumber}？当前内容会先保存为一个历史版本。`)) {
      return;
    }

    setRestoringVersion(versionNumber);
    setResourceError(null);
    setResourceFeedback(null);

    try {
      const response = await fetch(`/api/teacher/resources/${versionResource.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        resource?: TeacherResource;
        versions?: TeacherResourceVersion[];
        error?: string;
      };
      if (!response.ok || !data.resource) {
        throw new Error(data.error || "回滚资源版本失败");
      }

      const restoredResource = data.resource;
      setTeacherResources((current) =>
        current.map((resource) =>
          resource.id === restoredResource.id ? restoredResource : resource,
        ),
      );
      setPlanEntries((current) =>
        syncTeacherResourceEntries(current, [restoredResource]),
      );
      setVersionResource(restoredResource);
      setResourceVersions(Array.isArray(data.versions) ? data.versions : []);
      setSaved(false);
      setResourceFeedback(`资源「${restoredResource.title}」已回滚到历史版本，并生成新的 v${restoredResource.version_number || ""} 草稿。`);
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : "回滚资源版本失败");
    } finally {
      setRestoringVersion(null);
    }
  }

  const activeModuleData = modules.find((m) => m.id === activeModule);
  const activeModuleItems = activeModuleData?.items || [];
  const activePlanEntries = activeModuleData
    ? planEntries[activeModuleData.id] || []
    : [];
  const selectedStandardIds = new Set(
    activePlanEntries
      .filter((entry) => entry.sourceType === "standard")
      .map((entry) => entry.sourceId),
  );
  const selectedTeacherIds = new Set(
    activePlanEntries
      .filter((entry) => entry.sourceType === "teacher_resource")
      .map((entry) => entry.sourceId),
  );
  const standardCandidates = activeModuleItems
    .map((item) => toStandardPlanEntry(item, activeModuleData?.id || 0))
    .filter((entry) =>
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  const teacherCandidates = teacherResources
    .filter(
      (resource) =>
        resource.module_id === activeModuleData?.id &&
        resource.title.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .map((resource) => toTeacherPlanEntry(resource));
  const standardAssignments = activeModuleItems.filter(
    (item) =>
      typeof item.student_activity === "string" &&
      item.student_activity.trim().length > 0,
  );
  const activeTeacherAssignments = teacherAssignments.filter(
    (assignment) => assignment.module_id === activeModuleData?.id,
  );
  const activeLeadItem = activeModuleItems[0];
  const activeModuleDetails = activeLeadItem
    ? [
        {
          key: "teacher_activity",
          label: "教师活动",
          icon: "👨‍🏫",
          tone: "border-sky-200/80 bg-sky-50/70 text-sky-700",
          content: activeLeadItem.teacher_activity,
        },
        {
          key: "student_activity",
          label: "学生活动",
          icon: "👧",
          tone: "border-emerald-200/80 bg-emerald-50/70 text-emerald-700",
          content: activeLeadItem.student_activity,
        },
        {
          key: "design_intent",
          label: "设计意图",
          icon: "💡",
          tone: "border-fuchsia-200/80 bg-fuchsia-50/70 text-fuchsia-700",
          content: activeLeadItem.design_intent,
        },
        {
          key: "curriculum_standards",
          label: "课标对应",
          icon: "📚",
          tone: "border-orange-200/80 bg-orange-50/70 text-orange-700",
          content: activeLeadItem.curriculum_standards,
        },
        {
          key: "plan",
          label: "教学计划",
          icon: "📋",
          tone: "border-amber-200/80 bg-amber-50/70 text-amber-700",
          content: activeLeadItem.plan,
        },
      ].filter((section) => Boolean(section.content))
    : [];
  const activeDesignSectionKey =
    activeDesignSection &&
    activeModuleDetails.some((section) => section.key === activeDesignSection)
      ? activeDesignSection
      : activeModuleDetails[0]?.key || null;
  const activeDesignContent =
    activeModuleDetails.find(
      (section) => section.key === activeDesignSectionKey,
    ) || null;
  const selectedResourceCount = Object.values(planEntries).reduce(
    (total, entries) => total + entries.length,
    0,
  );
  const totalAssignmentCount =
    standardAssignments.length + activeTeacherAssignments.length;
  const selectedTemplate =
    storedTemplates.find((item) => item.id === selectedTemplateId) || null;
  const currentTemplateSummary = {
    planEntries: Object.values(planEntries).reduce(
      (total, entries) => total + entries.length,
      0,
    ),
    teacherAssignments: teacherAssignments.filter(
      (assignment) => assignment.title.trim().length > 0,
    ).length,
    standardAssignmentMeta: Object.values(standardAssignmentMeta).filter(
      (meta) => Boolean(meta.dueAt) || meta.isRequired,
    ).length,
  };

  useEffect(() => {
    if (!activeModuleDetails.length) {
      setActiveDesignSection(null);
      return;
    }

    if (!activeDesignSectionKey) {
      setActiveDesignSection(activeModuleDetails[0].key);
    }
  }, [
    activeModule,
    activeLeadItem?.id,
    activeDesignSectionKey,
    activeModuleDetails,
  ]);

  useEffect(() => {
    if (!templateFeedback) {
      return;
    }

    const timer = window.setTimeout(() => setTemplateFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [templateFeedback]);

  useEffect(() => {
    if (!resourceFeedback) {
      return;
    }

    const timer = window.setTimeout(() => setResourceFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [resourceFeedback]);

  function createPreviewItemFromPlanEntry(entry: PlanEntry): PreviewItem {
    if (entry.sourceType === "standard") {
      const sourceItem = modules
        .flatMap((module) => module.items || [])
        .find((item) => item.id === entry.sourceId);
      if (sourceItem) {
        return {
          ...sourceItem,
          sourceType: "standard",
          sourceItemId: sourceItem.id,
        };
      }
    }

    if (entry.sourceType === "teacher_resource") {
      const resource = teacherResources.find(
        (candidate) => candidate.id === entry.sourceId,
      );
      if (resource) {
        const mount = getMiniAppMount(resource);
        const previewType = getTeacherResourceItemType(resource);
        return {
          id: resource.id,
          module_id: resource.module_id,
          item_type: previewType,
          title: resource.title,
          file_url: resource.file_url || "",
          duration: resource.duration || 0,
          sort_order: 0,
          miniappMount: mount,
          miniapp_mount: mount,
          sourceType: "teacher_resource",
          teacherResourceId: resource.id,
        };
      }
    }

    return {
      id: entry.sourceId,
      module_id: entry.moduleId,
      item_type: entry.itemType,
      title: entry.title,
      file_url: entry.fileUrl || "",
      duration: entry.duration || 0,
      sort_order: 0,
      miniappMount: entry.miniappMount || null,
      miniapp_mount: entry.miniappMount || null,
      sourceType: entry.sourceType,
      sourceItemId:
        entry.sourceType === "standard" ? entry.sourceId : undefined,
      teacherResourceId:
        entry.sourceType === "teacher_resource" ? entry.sourceId : undefined,
    };
  }

  function openPreviewForEntry(entry: PlanEntry) {
    setPreviewItem(createPreviewItemFromPlanEntry(entry));
  }

  if (loading) {
    return (
      <div className="portal-panel mx-auto max-w-3xl p-12 text-center">
        <div className="relative">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-[#c58d3e] border-t-transparent animate-spin" />
          <p className="text-stone-600">加载课时数据...</p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="portal-panel mx-auto max-w-3xl p-12 text-center">
        <div className="relative">
          <p className="text-stone-600">课时不存在</p>
          <Link
            href="/teacher"
            className="mt-6 inline-flex rounded-full border border-[#d9c29b]/55 bg-white/80 px-5 py-2.5 text-sm text-stone-700 transition-colors hover:border-[#b83226]/25"
          >
            返回课时选择
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="portal-panel portal-shell-frame p-7 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <Link
              href="/teacher"
              className="inline-flex items-center gap-1 text-sm tracking-[0.12em] text-stone-500 transition-colors hover:text-stone-800"
            >
              <ArrowLeft className="h-4 w-4" />
              返回课时选择
            </Link>
            <h1 className="portal-title mt-5 text-3xl font-semibold leading-[1.18] text-stone-900 md:text-4xl">
              老师端备课
            </h1>
            <div className="mt-5 flex flex-wrap gap-2 text-sm text-stone-600">
              <div className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2">
                第 {lesson.unit?.unit_index || "-"} 单元 · 第{" "}
                {lesson.lesson_index} 课
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2">
                {lesson.title}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2">
                当前流程: {getModuleDisplayName(activeModuleData)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving || startingClassroom}
              className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/80 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25 disabled:opacity-50"
            >
              {saving ? (
                <div className="h-4 w-4 rounded-full border-2 border-stone-400 border-t-transparent animate-spin" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "保存中..." : saved ? "已保存" : "保存"}
            </button>
            <button
              onClick={handleStartClassroom}
              disabled={startingClassroom || saving}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.22)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              {startingClassroom ? (
                <div className="h-4 w-4 rounded-full border-2 border-[#f8ead1] border-t-transparent animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {startingClassroom ? "保存并进入课堂..." : "进入课堂"}
            </button>
          </div>
        </div>

        {saveError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600">
            {saveError}
          </div>
        ) : null}
        {templateFeedback ? (
          <div className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
            {templateFeedback}
          </div>
        ) : null}
        {resourceFeedback ? (
          <div className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
            {resourceFeedback}
          </div>
        ) : null}
        {resourceError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600">
            {resourceError}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="relative mx-auto w-full max-w-3xl">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 100 ${Math.max(modules.length, 1) * 132}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {modules.slice(0, -1).map((_, index) => (
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
            {modules.map((mod, index) => {
              const alignRight = index % 2 === 1;
              const isActive = activeModule === mod.id;

              return (
                <div key={mod.id} className="relative h-[132px]">
                  <button
                    onClick={() => setActiveModule(mod.id)}
                    className={`group absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${
                      alignRight ? "left-[76%]" : "left-[24%]"
                    }`}
                    aria-label={`切换到第 ${index + 1} 个流程`}
                  >
                    <div
                      className={`relative flex h-24 w-24 items-center justify-center rounded-full border transition-all ${
                        isActive
                          ? "border-[#c58d3e]/75 bg-[radial-gradient(circle_at_30%_30%,#fffdf7,#f6e5ba_55%,#e2bf68_100%)] shadow-[0_16px_34px_rgba(197,141,62,0.22)]"
                          : "border-[#ddd2c4] bg-[radial-gradient(circle_at_30%_30%,#ffffff,#f6efe5_70%,#e8dfd2_100%)] shadow-[0_12px_26px_rgba(97,73,33,0.08)]"
                      }`}
                    >
                      <Star
                        className={`h-10 w-10 transition-colors ${
                          isActive ? "text-[#b77910]" : "text-stone-300"
                        }`}
                        fill={isActive ? "#d8a44c" : "none"}
                      />
                      <span className="absolute bottom-2 text-xs font-semibold text-stone-700">
                        {mod.module_index}
                      </span>
                    </div>
                    <div className="mt-3 w-28 -translate-x-1/2 text-center">
                      <div className="text-sm font-semibold text-stone-800">
                        {getModuleDisplayName(mod)}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {activeModuleData ? (
        <section className="portal-panel overflow-hidden">
          <div className="border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm tracking-[0.22em] text-stone-600">
                  当前流程
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  {getModuleDisplayName(activeModuleData)}
                </h2>
              </div>
              {activeLeadItem?.duration_minutes ? (
                <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-2 text-sm tracking-[0.16em] text-[#8f2017]">
                  {activeLeadItem.duration_minutes} 分钟
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-6 p-6">
              <div className="flex flex-wrap gap-2">
              {[
                { key: "resources", label: "调配资源" },
                { key: "ai", label: "AI备课" },
                { key: "assignments", label: "布置作业" },
                { key: "design", label: "教学说明" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActivePanel(tab.key as typeof activePanel)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    activePanel === tab.key
                      ? "bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)]"
                      : "border border-[#d9c29b]/55 bg-white/86 text-stone-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activePanel === "design" ? (
              <div className="rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-5">
                <div className="text-sm tracking-[0.22em] text-stone-600">
                  教学说明
                </div>

                {activeModuleDetails.length > 0 ? (
                  <>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {activeModuleDetails.map((section) => (
                        <button
                          key={section.key}
                          onClick={() => setActiveDesignSection(section.key)}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                            activeDesignSectionKey === section.key
                              ? section.tone
                              : "border-[#d9c29b]/55 bg-white/86 text-stone-600"
                          }`}
                        >
                          <span>{section.icon}</span>
                          {section.label}
                        </button>
                      ))}
                    </div>
                    {activeDesignContent ? (
                      <div className="mt-5 rounded-[22px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] px-5 py-5">
                        <div className="text-sm font-medium text-stone-900">
                          {activeDesignContent.label}
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                          {activeDesignContent.content}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-5 rounded-[22px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-5 py-6 text-sm text-stone-500">
                    暂无教学说明
                  </div>
                )}
              </div>
            ) : null}

            {activePanel === "ai" ? (
              <div>
                <LessonAiCreationCenter
                  lessonId={lessonId}
                  moduleId={activeModuleData.id}
                  lessonTitle={lesson?.title}
                  moduleName={activeModuleData.module_name}
                  onImported={handleImportedOpenMaicResources}
                  onGeneratedMiniApp={handleGeneratedAiMiniAppResource}
                  onResourceCreated={(resource) =>
                    handleImportedOpenMaicResources([
                      resource as ImportedOpenMaicResource,
                    ])
                  }
                  onResourceDeleted={handleGeneratedResourceDeleted}
                />
              </div>
            ) : null}

            {activePanel === "resources" ? (
              <div className="rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-5">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="搜索资源"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-full border border-[#d9c29b]/55 bg-white/88 py-3 pl-11 pr-4 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                </div>

                <div className="mt-6 space-y-5">
                  <div className="rounded-[22px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                    <div className="text-sm font-medium text-stone-900">
                      标准资源（可选 / 可取消）
                    </div>
                    <div className="mt-1 text-xs tracking-[0.12em] text-stone-500">
                      再点一次已选资源，会从当前课堂安排中移出。
                    </div>
                    <div className="mt-4 max-h-[420px] overflow-y-auto">
                      {standardCandidates.length > 0 ? (
                        <div className="space-y-3">
                            {standardCandidates.map((item) => (
                              <ModuleItemPicker
                                key={item.key}
                                item={item}
                                isSelected={selectedStandardIds.has(item.sourceId)}
                                onPreview={() => openPreviewForEntry(item)}
                                onSelect={() =>
                                  togglePlanEntry(activeModuleData.id, item)
                                }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="py-10 text-center text-stone-400">
                          <Upload className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p className="text-sm">暂无标准资源</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                    <div className="text-sm font-medium text-stone-900">
                      已安排资源（可拖动 / 可移出）
                    </div>
                    <div className="mt-1 text-xs tracking-[0.12em] text-stone-500">
                      点击左侧勾选即可移出，拖动可调整顺序。
                    </div>
                    <div className="mt-4">
                      {activePlanEntries.length > 0 ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) =>
                            handleDragEnd(event, activeModuleData.id)
                          }
                        >
                          <SortableContext
                            items={activePlanEntries.map((item) => item.key)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-3">
                              {activePlanEntries.map((item) => (
                                <SortableItem
                                  key={item.key}
                                  item={item}
                                  onPreview={() => openPreviewForEntry(item)}
                                  onToggle={() =>
                                    togglePlanEntry(activeModuleData.id, item)
                                  }
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-[#d9c29b]/60 bg-[#fffaf2] px-5 py-8 text-center text-sm text-stone-500">
                          暂无已安排资源
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                    <div className="text-sm font-medium text-stone-900">
                      教师资源 / 共享资源（可选 / 可取消）
                    </div>
                    <div className="mt-1 text-xs tracking-[0.12em] text-stone-500">
                      已加入课堂的资源会保留在列表中，可再次点击移出。
                    </div>
                    <div className="mt-4 max-h-[720px] overflow-y-auto">
                      {teacherCandidates.length > 0 ? (
                        <div className="space-y-3">
                          {teacherCandidates.map((item) => (
                            <TeacherResourceCard
                              key={item.key}
                              item={item}
                              isSelected={selectedTeacherIds.has(item.sourceId)}
                              onPreview={() => openPreviewForEntry(item)}
                              onEdit={() => {
                                const resource = teacherResources.find(
                                  (candidate) => candidate.id === item.sourceId,
                                );
                                if (resource) {
                                  openEditTeacherResource(resource);
                                }
                              }}
                              onSelect={() =>
                                togglePlanEntry(activeModuleData.id, item)
                              }
                              onDelete={() =>
                                handleDeleteTeacherResource(item.sourceId)
                              }
                              onVersions={() => {
                                const resource = teacherResources.find(
                                  (candidate) => candidate.id === item.sourceId,
                                );
                                if (resource) {
                                  void openTeacherResourceVersions(resource);
                                }
                              }}
                              onReviewStatusChange={(status) =>
                                handleTeacherResourceReviewStatusChange(
                                  item.sourceId,
                                  status,
                                )
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="py-10 text-center text-stone-400">
                          <Upload className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p className="text-sm">暂无教师资源或共享资源</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-center">
                  <button
                    onClick={() => setShowUpload(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-6 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.22)] transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    <Upload className="h-4 w-4" />
                    上传课件
                  </button>
                </div>
              </div>
            ) : null}

            {activePanel === "assignments" ? (
              <div className="rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm tracking-[0.22em] text-stone-600">
                    布置作业
                  </div>
                  <button
                    onClick={() => addTeacherAssignment(activeModuleData.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/86 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                  >
                    <Plus className="h-4 w-4" />
                    新增自定义作业
                  </button>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-[22px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                    <div className="text-sm font-medium text-stone-900">
                      标准作业
                    </div>
                    {standardAssignments.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {standardAssignments.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-[20px] border border-[#d9c29b]/45 bg-white/85 px-4 py-4"
                          >
                            <div className="text-sm font-medium text-stone-900">
                              {item.title}
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                              {item.student_activity}
                            </div>
                            <div className="mt-4 rounded-[18px] border border-[#d9c29b]/45 bg-[#fffaf2] p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs tracking-[0.14em] text-stone-500">
                                    提交要求
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full border px-3 py-1 text-xs tracking-[0.14em] ${
                                        standardAssignmentMeta[item.id]
                                          ?.isRequired
                                          ? "border-[#c58d3e]/55 bg-[#fff2d7] text-[#8f2017]"
                                          : "border-[#d9c29b]/55 bg-white/88 text-stone-500"
                                      }`}
                                    >
                                      {standardAssignmentMeta[item.id]
                                        ?.isRequired
                                        ? "必交"
                                        : "选做"}
                                    </span>
                                    <span className="rounded-full border border-[#d9c29b]/55 bg-white/88 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                                      {formatAssignmentDueLabel(
                                        standardAssignmentMeta[item.id]?.dueAt,
                                      ) || "未设置截止时间"}
                                    </span>
                                  </div>
                                </div>
                                <label className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/88 px-3 py-2 text-xs font-medium text-stone-700">
                                  <input
                                    type="checkbox"
                                    checked={
                                      standardAssignmentMeta[item.id]
                                        ?.isRequired === true
                                    }
                                    onChange={(event) =>
                                      updateStandardAssignmentSetting(
                                        item.id,
                                        activeModuleData.id,
                                        {
                                          isRequired: event.target.checked,
                                        },
                                      )
                                    }
                                    className="h-4 w-4 rounded border-[#d9c29b]/60 text-[#8f2017] focus:ring-[#c58d3e]"
                                  />
                                  设为必交
                                </label>
                              </div>
                              <div className="mt-4">
                                <label className="text-xs tracking-[0.14em] text-stone-500">
                                  截止时间
                                </label>
                                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4">
                                  <Clock3 className="h-4 w-4 text-stone-400" />
                                  <input
                                    type="datetime-local"
                                    value={toDateTimeLocalValue(
                                      standardAssignmentMeta[item.id]?.dueAt,
                                    )}
                                    onChange={(event) =>
                                      updateStandardAssignmentSetting(
                                        item.id,
                                        activeModuleData.id,
                                        {
                                          dueAt: event.target.value || null,
                                        },
                                      )
                                    }
                                    className="w-full bg-transparent py-3 text-sm text-stone-700 outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[20px] border border-dashed border-[#d9c29b]/55 bg-white/78 px-4 py-6 text-sm text-stone-500">
                        暂无标准作业
                      </div>
                    )}
                  </div>

                  <div className="rounded-[22px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                    <div className="text-sm font-medium text-stone-900">
                      自定义作业
                    </div>
                    {activeTeacherAssignments.length > 0 ? (
                      <div className="mt-4 space-y-4">
                        {activeTeacherAssignments.map((assignment, index) => (
                          <div
                            key={assignment.clientKey}
                            className="rounded-[20px] border border-[#d9c29b]/45 bg-white/85 px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs tracking-[0.16em] text-stone-500">
                                自定义作业 {index + 1}
                              </div>
                              <button
                                onClick={() =>
                                  removeTeacherAssignment(assignment.clientKey)
                                }
                                className="rounded-full border border-rose-200 bg-white/90 p-2 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                title="删除自定义作业"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-3 space-y-3">
                              <input
                                type="text"
                                value={assignment.title}
                                onChange={(event) =>
                                  updateTeacherAssignment(
                                    assignment.clientKey,
                                    {
                                      title: event.target.value,
                                    },
                                  )
                                }
                                placeholder="作业标题，例如：课堂观察记录"
                                className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                              />
                              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                <div>
                                  <label className="text-xs tracking-[0.14em] text-stone-500">
                                    截止时间
                                  </label>
                                  <div className="mt-2 flex items-center gap-2 rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4">
                                    <Clock3 className="h-4 w-4 text-stone-400" />
                                    <input
                                      type="datetime-local"
                                      value={toDateTimeLocalValue(
                                        assignment.dueAt,
                                      )}
                                      onChange={(event) =>
                                        updateTeacherAssignment(
                                          assignment.clientKey,
                                          {
                                            dueAt: event.target.value || null,
                                          },
                                        )
                                      }
                                      className="w-full bg-transparent py-3 text-sm text-stone-700 outline-none"
                                    />
                                  </div>
                                </div>
                                <label className="inline-flex items-center gap-2 self-end rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm font-medium text-stone-700">
                                  <input
                                    type="checkbox"
                                    checked={assignment.isRequired === true}
                                    onChange={(event) =>
                                      updateTeacherAssignment(
                                        assignment.clientKey,
                                        {
                                          isRequired: event.target.checked,
                                        },
                                      )
                                    }
                                    className="h-4 w-4 rounded border-[#d9c29b]/60 text-[#8f2017] focus:ring-[#c58d3e]"
                                  />
                                  设为必交
                                </label>
                              </div>
                              {assignment.isRequired || assignment.dueAt ? (
                                <div className="flex flex-wrap gap-2">
                                  <span
                                    className={`rounded-full border px-3 py-1 text-xs tracking-[0.14em] ${
                                      assignment.isRequired
                                        ? "border-[#c58d3e]/55 bg-[#fff2d7] text-[#8f2017]"
                                        : "border-[#d9c29b]/55 bg-white/88 text-stone-500"
                                    }`}
                                  >
                                    {assignment.isRequired ? "必交" : "选做"}
                                  </span>
                                  {assignment.dueAt ? (
                                    <span className="rounded-full border border-[#d9c29b]/55 bg-white/88 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                                      截止{" "}
                                      {formatAssignmentDueLabel(
                                        assignment.dueAt,
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              <textarea
                                value={assignment.description}
                                onChange={(event) =>
                                  updateTeacherAssignment(
                                    assignment.clientKey,
                                    {
                                      description: event.target.value,
                                    },
                                  )
                                }
                                rows={4}
                                placeholder="输入作业要求、提交说明或完成标准"
                                className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm leading-7 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[20px] border border-dashed border-[#d9c29b]/55 bg-white/78 px-4 py-6 text-sm text-stone-500">
                        暂无自定义作业
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showCopyDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel w-full max-w-4xl p-6">
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm tracking-[0.22em] text-stone-600">
                    教案复制
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-stone-900">
                    从其他课时或模板带入
                  </h3>
                </div>
                <button
                  onClick={() => setShowCopyDialog(false)}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { key: "lesson", label: "从其他课时复制" },
                  {
                    key: "template",
                    label: `从模板套用 ${storedTemplates.length}`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setCopyError(null);
                      setCopySourceType(tab.key as "lesson" | "template");
                    }}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      copySourceType === tab.key
                        ? "bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)]"
                        : "border border-[#d9c29b]/55 bg-white/86 text-stone-600"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {copySourceType === "lesson" ? (
                <div className="mt-6 rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-stone-900">
                        同单元其他课时
                      </div>
                    </div>
                    <div className="rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-xs tracking-[0.14em] text-stone-500">
                      当前单元第 {lesson.unit?.unit_index || "-"} 单元
                    </div>
                  </div>

                  <div className="mt-5 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {loadingLessons ? (
                      <div className="rounded-[20px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-5 py-10 text-center text-sm text-stone-500">
                        正在读取可复制课时...
                      </div>
                    ) : availableLessons.length > 0 ? (
                      availableLessons.map((candidate) => {
                        const selected = selectedCopyLessonId === candidate.id;
                        return (
                          <button
                            key={candidate.id}
                            onClick={() =>
                              setSelectedCopyLessonId(candidate.id)
                            }
                            className={`flex w-full items-start justify-between gap-4 rounded-[22px] border px-4 py-4 text-left transition-colors ${
                              selected
                                ? "border-[#c58d3e]/65 bg-[#fff6e4] shadow-[0_12px_24px_rgba(197,141,62,0.12)]"
                                : "border-[#d9c29b]/45 bg-white/88 hover:border-[#c58d3e]/55"
                            }`}
                          >
                            <div>
                              <div className="text-sm font-medium text-stone-900">
                                第 {candidate.lesson_index} 课 ·{" "}
                                {candidate.title}
                              </div>
                              <div className="mt-2 text-sm leading-7 text-stone-500">
                                {candidate.description ||
                                  "复制这个课时当前已经保存的教案装配与作业要求。"}
                              </div>
                            </div>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs tracking-[0.14em] ${
                                selected
                                  ? "border-[#c58d3e]/55 bg-white/90 text-[#8f2017]"
                                  : "border-[#d9c29b]/55 bg-white/90 text-stone-500"
                              }`}
                            >
                              {selected ? "已选择" : "点击选择"}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-5 py-10 text-center text-sm text-stone-500">
                        当前单元暂时没有其他课时可供复制。
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-stone-900">
                        我的备课模板
                      </div>
                    </div>
                    <div className="rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-xs tracking-[0.14em] text-stone-500">
                      最多保留 12 个模板
                    </div>
                  </div>

                  <div className="mt-5 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {storedTemplates.length > 0 ? (
                      storedTemplates.map((template) => {
                        const selected = selectedTemplateId === template.id;
                        return (
                          <div
                            key={template.id}
                            className={`rounded-[22px] border px-4 py-4 ${
                              selected
                                ? "border-[#c58d3e]/65 bg-[#fff6e4] shadow-[0_12px_24px_rgba(197,141,62,0.12)]"
                                : "border-[#d9c29b]/45 bg-white/88"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <button
                                onClick={() =>
                                  setSelectedTemplateId(template.id)
                                }
                                className="flex-1 text-left"
                              >
                                <div className="text-sm font-medium text-stone-900">
                                  {template.name}
                                </div>
                                <div className="mt-2 text-xs tracking-[0.14em] text-stone-500">
                                  来源：{template.sourceLessonTitle} · 保存于{" "}
                                  {formatTemplateTimestamp(template.createdAt)}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                                    已装配 {template.planEntries.length} 项
                                  </span>
                                  <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                                    自定义作业{" "}
                                    {template.teacherAssignments.length} 条
                                  </span>
                                  <span className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                                    标准作业要求{" "}
                                    {template.standardAssignmentMeta.length} 条
                                  </span>
                                </div>
                              </button>
                              <div className="flex flex-col items-end gap-2">
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs tracking-[0.14em] ${
                                    selected
                                      ? "border-[#c58d3e]/55 bg-white/90 text-[#8f2017]"
                                      : "border-[#d9c29b]/55 bg-white/90 text-stone-500"
                                  }`}
                                >
                                  {selected ? "已选择" : "点击卡片选择"}
                                </span>
                                <button
                                  onClick={() =>
                                    handleDeleteTemplate(template.id)
                                  }
                                  className="rounded-full border border-rose-200 bg-white/90 px-3 py-1 text-xs tracking-[0.14em] text-rose-500 transition-colors hover:bg-rose-50"
                                >
                                  删除模板
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-5 py-10 text-center text-sm text-stone-500">
                        暂无模板
                      </div>
                    )}
                  </div>
                </div>
              )}

              {copyError ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                  {copyError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setShowCopyDialog(false)}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/86 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25"
                >
                  取消
                </button>
                <button
                  onClick={handleApplyCopySource}
                  disabled={
                    copyingPlan ||
                    (copySourceType === "lesson"
                      ? !selectedCopyLessonId
                      : !selectedTemplate)
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.22)] disabled:opacity-50"
                >
                  {copyingPlan ? (
                    <div className="h-4 w-4 rounded-full border-2 border-[#f8ead1] border-t-transparent animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copyingPlan ? "正在套用..." : "覆盖当前备课"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showTemplateDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel w-full max-w-2xl p-6">
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm tracking-[0.22em] text-stone-600">
                    模板保存
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-stone-900">
                    保存当前教案为模板
                  </h3>
                </div>
                <button
                  onClick={() => setShowTemplateDialog(false)}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                <label className="text-sm font-medium text-stone-700">
                  模板名称
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="例如：低年级观察课通用模板"
                  className="mt-3 w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[20px] border border-[#d9c29b]/45 bg-white/88 px-4 py-4">
                    <div className="text-xs tracking-[0.14em] text-stone-500">
                      已装配资源
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-stone-900">
                      {currentTemplateSummary.planEntries}
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-[#d9c29b]/45 bg-white/88 px-4 py-4">
                    <div className="text-xs tracking-[0.14em] text-stone-500">
                      自定义作业
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-stone-900">
                      {currentTemplateSummary.teacherAssignments}
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-[#d9c29b]/45 bg-white/88 px-4 py-4">
                    <div className="text-xs tracking-[0.14em] text-stone-500">
                      标准作业要求
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-stone-900">
                      {currentTemplateSummary.standardAssignmentMeta}
                    </div>
                  </div>
                </div>
              </div>

              {copyError ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                  {copyError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setShowTemplateDialog(false)}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/86 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.22)]"
                >
                  <Save className="h-4 w-4" />
                  保存模板
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingResource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel w-full max-w-2xl p-6">
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm tracking-[0.22em] text-stone-600">
                    资源编辑
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-stone-900">
                    调整我的资源
                  </h3>
                </div>
                <button
                  onClick={closeEditTeacherResource}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      资源标题
                    </label>
                    <input
                      type="text"
                      value={editingResourceTitle}
                      onChange={(event) =>
                        setEditingResourceTitle(event.target.value)
                      }
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      所在流程
                    </label>
                    <select
                      value={editingResourceModuleId ?? ""}
                      onChange={(event) =>
                        setEditingResourceModuleId(
                          Number(event.target.value) || null,
                        )
                      }
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    >
                      {modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          第 {module.module_index} 个流程 ·{" "}
                          {getModuleDisplayName(module)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isMiniAppTeacherResource(editingResource) ? (
                    <div className="md:col-span-2">
                      <MiniAppMountFields
                        miniApps={miniApps}
                        loading={loadingMiniApps}
                        catalogError={miniAppCatalogError}
                        draft={editingMiniAppDraft}
                        onChange={(patch) =>
                          setEditingMiniAppDraft((current) => ({
                            ...current,
                            ...patch,
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="mb-1.5 block text-sm font-medium text-stone-700">
                          当前文件
                        </div>
                        <div className="rounded-2xl border border-[#d9c29b]/45 bg-[#fffaf2] px-4 py-3 text-sm text-stone-600">
                          {editingResource.file_url
                            ? "沿用当前已上传文件"
                            : "当前缺少文件，请重新选择替换文件"}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium text-stone-700">
                          替换文件（选填）
                        </label>
                        <input
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            setEditingResourceFile(file);
                            if (file && !file.type.startsWith("image/")) {
                              setEditingResourceAudioFile(null);
                            }
                          }}
                          accept="video/*,audio/*,image/*,.pdf,.doc,.docx,.ppt,.pptx"
                          className="block w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#f4e2be] file:px-4 file:py-2 file:text-sm file:text-stone-700"
                        />
                        {editingResourceFile ? (
                          <p className="mt-2 text-xs text-[#8f2017]">
                            已选择：{editingResourceFile.name}
                          </p>
                        ) : null}
                      </div>

                      {editingResourceFile?.type.startsWith("image/") ||
                      (!editingResourceFile &&
                        editingResource.item_type === "image") ? (
                        <div className="md:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-stone-700">
                            讲解音频（选填）
                          </label>
                          <input
                            type="file"
                            onChange={(event) =>
                              setEditingResourceAudioFile(
                                event.target.files?.[0] || null,
                              )
                            }
                            accept="audio/*"
                            className="block w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#f4e2be] file:px-4 file:py-2 file:text-sm file:text-stone-700"
                          />
                          {editingResourceAudioFile ? (
                            <p className="mt-2 text-xs text-[#8f2017]">
                              已选择：{editingResourceAudioFile.name}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  onClick={closeEditTeacherResource}
                  disabled={savingResourceEdit}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/86 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEditedResource}
                  disabled={savingResourceEdit}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.22)] disabled:opacity-50"
                >
                  {savingResourceEdit ? (
                    <div className="h-4 w-4 rounded-full border-2 border-[#f8ead1] border-t-transparent animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                  {savingResourceEdit ? "正在保存资源..." : "保存资源调整"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showMiniAppCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel w-full max-w-2xl p-6">
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm tracking-[0.22em] text-stone-600">
                    小游戏挂载
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-stone-900">
                    创建小游戏资源
                  </h3>
                </div>
                <button
                  onClick={closeMiniAppCreateDialog}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(255,255,255,0.92))] p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      资源标题
                    </label>
                    <input
                      type="text"
                      value={miniAppCreateTitle}
                      onChange={(event) =>
                        setMiniAppCreateTitle(event.target.value)
                      }
                      placeholder="例如：闯关答题台"
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      归属流程
                    </label>
                    <select
                      value={miniAppCreateModuleId ?? ""}
                      onChange={(event) =>
                        setMiniAppCreateModuleId(
                          Number(event.target.value) || null,
                        )
                      }
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    >
                      <option value="">请选择流程</option>
                      {modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          第 {module.module_index} 个流程 ·{" "}
                          {getModuleDisplayName(module)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <MiniAppMountFields
                    miniApps={miniApps}
                    loading={loadingMiniApps}
                    catalogError={miniAppCatalogError}
                    draft={miniAppCreateDraft}
                    onChange={(patch) =>
                      setMiniAppCreateDraft((current) => ({
                        ...current,
                        ...patch,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  onClick={closeMiniAppCreateDialog}
                  disabled={creatingMiniAppResource}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/86 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateMiniAppResource}
                  disabled={creatingMiniAppResource}
                  className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.22)] disabled:opacity-50"
                >
                  {creatingMiniAppResource ? (
                    <div className="h-4 w-4 rounded-full border-2 border-[#f8ead1] border-t-transparent animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {creatingMiniAppResource ? "正在创建..." : "创建并加入课堂"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {versionResource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel max-h-[82vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm tracking-[0.22em] text-stone-600">
                  资源版本
                </div>
                <h3 className="mt-2 text-xl font-semibold text-stone-900">
                  {versionResource.title}
                </h3>
                <p className="mt-2 text-sm text-stone-500">
                  当前版本 v{versionResource.version_number || 1}
                </p>
              </div>
              <button
                onClick={() => {
                  setVersionResource(null);
                  setResourceVersions([]);
                }}
                className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {loadingVersions ? (
                <div className="rounded-2xl border border-[#d9c29b]/45 bg-white/75 px-4 py-8 text-center text-sm text-stone-500">
                  正在读取版本...
                </div>
              ) : resourceVersions.length > 0 ? (
                resourceVersions.map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9c29b]/45 bg-white/82 px-4 py-3">
                    <div>
                      <div className="font-semibold text-stone-900">v{version.version_number} · {version.title}</div>
                      <div className="mt-1 text-xs tracking-[0.12em] text-stone-500">
                        {version.item_type} · {version.created_at ? new Date(version.created_at).toLocaleString('zh-CN') : '未知时间'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreTeacherResourceVersion(version.version_number)}
                      disabled={restoringVersion === version.version_number}
                      className="rounded-full border border-[#d9c29b]/55 bg-white/90 px-4 py-2 text-xs tracking-[0.12em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-50"
                    >
                      {restoringVersion === version.version_number ? '回滚中...' : '回滚到此版本'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[#d9c29b]/55 bg-white/75 px-4 py-8 text-center text-sm text-stone-500">
                  暂无历史版本
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel w-full max-w-md p-6">
            <div className="relative">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm tracking-[0.22em] text-stone-600">
                    资源上传
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-stone-900">
                    上传课件
                  </h3>
                </div>
                <button
                  onClick={() => setShowUpload(false)}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700">
                    课件名称
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="输入课件名称"
                    className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700">
                    选择文件
                  </label>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadFile(file);
                      if (file && !file.type.startsWith("image/")) {
                        setUploadAudioFile(null);
                      }
                    }}
                    accept="video/*,audio/*,image/*,.pdf,.doc,.docx,.ppt,.pptx"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-[#d9c29b]/70 bg-white/76 px-4 py-8 text-stone-600 transition-colors hover:border-[#c58d3e]"
                  >
                    <Upload className="h-8 w-8 text-stone-400" />
                    <span>点击选择文件</span>
                  </label>
                  {uploadFile ? (
                    <p className="mt-2 text-xs text-[#8f2017]">
                      已选择：{uploadFile.name}
                    </p>
                  ) : null}
                </div>

                {uploadFile?.type.startsWith("image/") ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      关联讲解音频（选填）
                    </label>
                    <input
                      type="file"
                      id="audio-upload"
                      className="hidden"
                      onChange={(e) =>
                        setUploadAudioFile(e.target.files?.[0] || null)
                      }
                      accept="audio/*"
                    />
                    <label
                      htmlFor="audio-upload"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-[22px] border border-dashed border-[#d9c29b]/70 bg-[#fffaf2] px-4 py-4 text-stone-600 transition-colors hover:border-[#c58d3e]"
                    >
                      <Upload className="h-5 w-5 text-[#c58d3e]" />
                      <span>为这张图片选择讲解音频</span>
                    </label>
                    {uploadAudioFile ? (
                      <p className="mt-2 text-xs text-[#8f2017]">
                        已关联：{uploadAudioFile.name}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!uploadFile || uploading}
                  className="w-full rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)] disabled:opacity-50"
                >
                  开始上传
                </button>

                {uploading ? (
                  <div className="py-4 text-center">
                    <div className="mx-auto h-8 w-8 rounded-full border-2 border-[#c58d3e] border-t-transparent animate-spin" />
                    <p className="mt-2 text-sm text-stone-500">上传中...</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.72)] px-4 py-6">
          <div className="portal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between gap-4 border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.96),rgba(247,238,224,0.92))] px-6 py-4">
              <div className="min-w-0">
                <div className="text-sm tracking-[0.22em] text-stone-600">
                  资源预览
                </div>
                <div className="mt-1 truncate text-lg font-semibold text-stone-900">
                  {previewItem.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="rounded-full border border-[#d9c29b]/55 bg-white/86 p-2 text-stone-500 transition-colors hover:text-stone-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(180deg,#1a120f_0%,#241814_48%,#130c09_100%)] p-4">
              <MediaPreview
                item={previewItem}
                lessonId={lessonId}
                immersive={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PreparePage() {
  return (
    <Suspense
      fallback={
        <div className="portal-panel mx-auto max-w-3xl p-12 text-center">
          <div className="relative">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-[#c58d3e] border-t-transparent animate-spin" />
            <p className="text-stone-600">加载中...</p>
          </div>
        </div>
      }
    >
      <PrepareContent />
    </Suspense>
  );
}
