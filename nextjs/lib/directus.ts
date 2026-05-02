import axios from "axios";
import { resolveAssetUrl } from "./media-url";

// In browser, use relative path through nginx proxy (/directus/).
// In server (Node.js), use the host Directus service URL from env, falling back to localhost.
const isBrowser = typeof window !== "undefined";
const DIRECTUS_URL = isBrowser
  ? "/directus" // goes through nginx proxy
  : process.env.DIRECTUS_URL || "http://127.0.0.1:8055";

const directus = axios.create({
  baseURL: `${DIRECTUS_URL}/items`,
  headers: {
    "Content-Type": "application/json",
  },
});

export type MiniAppMountOwnerKind = "standard_module_item" | "teacher_resource";
export type MiniAppLaunchMode = "iframe";
export type MiniAppMountStatus = "active" | "disabled";

export interface ModuleItemMiniAppSummary {
  id?: number;
  appKey?: string;
  app_key?: string;
  name?: string;
  description?: string;
  iconUrl?: string | null;
  icon_url?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  category?: string | null;
  vendorName?: string | null;
  vendor_name?: string | null;
  sourceType?: string | null;
  source_type?: string | null;
  status?: string | null;
  publishedVersionId?: number | null;
  published_version_id?: number | null;
}

export interface ModuleItemMiniAppVersion {
  id?: number;
  miniAppId?: number;
  mini_app_id?: number;
  version?: string | null;
  entryUrl?: string | null;
  entry_url?: string | null;
  sourceType?: string | null;
  source_type?: string | null;
  manifest?: Record<string, unknown> | null;
}

export interface ModuleItemMiniAppMount {
  id?: number;
  ownerKind?: MiniAppMountOwnerKind;
  owner_kind?: MiniAppMountOwnerKind;
  ownerId?: number;
  owner_id?: number;
  miniAppId?: number;
  mini_app_id?: number;
  miniAppVersionId?: number | null;
  mini_app_version_id?: number | null;
  launchMode?: MiniAppLaunchMode;
  launch_mode?: MiniAppLaunchMode;
  mountStatus?: MiniAppMountStatus;
  mount_status?: MiniAppMountStatus;
  titleOverride?: string | null;
  title_override?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  aspectRatio?: string | null;
  aspect_ratio?: string | null;
  params?: Record<string, unknown> | null;
  miniApp?: ModuleItemMiniAppSummary | null;
  mini_app?: ModuleItemMiniAppSummary | null;
  version?: ModuleItemMiniAppVersion | null;
}

function normalizeMiniAppSummary(
  summary?: ModuleItemMiniAppSummary | null,
): ModuleItemMiniAppSummary | undefined {
  if (!summary) {
    return undefined;
  }

  const iconUrl = resolveAssetUrl(summary.iconUrl || summary.icon_url || "");
  const coverUrl = resolveAssetUrl(summary.coverUrl || summary.cover_url || "");

  return {
    ...summary,
    iconUrl: iconUrl || summary.iconUrl || summary.icon_url || null,
    icon_url: iconUrl || summary.icon_url || summary.iconUrl || null,
    coverUrl: coverUrl || summary.coverUrl || summary.cover_url || null,
    cover_url: coverUrl || summary.cover_url || summary.coverUrl || null,
  };
}

function normalizeMiniAppVersion(
  version?: ModuleItemMiniAppVersion | null,
): ModuleItemMiniAppVersion | undefined {
  if (!version) {
    return undefined;
  }

  const entryUrl = resolveAssetUrl(version.entryUrl || version.entry_url || "");

  return {
    ...version,
    entryUrl: entryUrl || version.entryUrl || version.entry_url || null,
    entry_url: entryUrl || version.entry_url || version.entryUrl || null,
  };
}

export function normalizeModuleItemMiniAppMount(
  mount?: ModuleItemMiniAppMount | null,
): ModuleItemMiniAppMount | undefined {
  if (!mount) {
    return undefined;
  }

  const coverUrl = resolveAssetUrl(mount.coverUrl || mount.cover_url || "");
  const normalizedMiniApp = normalizeMiniAppSummary(
    mount.miniApp || mount.mini_app,
  );
  const normalizedVersion = normalizeMiniAppVersion(mount.version);

  return {
    ...mount,
    coverUrl: coverUrl || mount.coverUrl || mount.cover_url || null,
    cover_url: coverUrl || mount.cover_url || mount.coverUrl || null,
    miniApp: normalizedMiniApp || null,
    mini_app: normalizedMiniApp || null,
    version: normalizedVersion || null,
  };
}

export function getModuleItemMiniAppMount(
  item?: Pick<ModuleItem, "miniapp_mount" | "miniappMount"> | null,
): ModuleItemMiniAppMount | null {
  return item?.miniappMount || item?.miniapp_mount || null;
}

function normalizeModuleItem(item: ModuleItem): ModuleItem {
  const miniAppMount = normalizeModuleItemMiniAppMount(
    item.miniappMount || item.miniapp_mount,
  );

  return {
    ...item,
    file_url: resolveAssetUrl(item.file_url),
    miniapp_mount: miniAppMount,
    miniappMount: miniAppMount,
  };
}

function normalizeResource(resource: Resource): Resource {
  return {
    ...resource,
    file_url: resolveAssetUrl(resource.file_url),
  };
}

// Types
export interface Unit {
  id: number;
  course_id?: number | null;
  unit_index: number;
  title: string;
  description?: string | null;
  course?: Course;
}

export interface Course {
  id: number;
  course_index: number;
  title: string;
  description?: string | null;
  status?: string | null;
}

export interface Lesson {
  id: number;
  unit_id: number;
  lesson_index: number;
  title: string;
  description: string;
  unit?: Unit;
}

export interface LessonModule {
  id: number;
  lesson_id: number;
  module_index: number;
  module_name: string;
  module_type: string;
  description: string;
  primary_item_id?: number | null;
  assignment_required?: boolean | null;
  unlock_mode?: string | null;
  items?: ModuleItem[];
}

export interface ModuleItem {
  id: number;
  module_id: number;
  item_type:
    | "video"
    | "audio"
    | "image"
    | "doc"
    | "ppt"
    | "interactive"
    | "miniapp";
  title: string;
  file_url?: string;
  duration: number;
  sort_order: number;
  // 教学设计字段
  teacher_activity?: string;
  student_activity?: string;
  design_intent?: string;
  curriculum_standards?: string;
  plan?: string;
  duration_minutes?: number;
  miniapp_mount?: ModuleItemMiniAppMount | null;
  miniappMount?: ModuleItemMiniAppMount | null;
}

export interface Resource {
  id: number;
  title: string;
  type: "video" | "audio" | "image" | "doc" | "ppt" | "interactive" | "miniapp";
  file_url: string;
  uploader_id?: number;
  status: "pending" | "approved" | "rejected";
  tags?: string[];
}

// API functions
export async function getCourses(): Promise<Course[]> {
  try {
    const { data } = await directus.get<{ data: Course[] }>("/courses", {
      params: {
        sort: "course_index,id",
        fields: "id,course_index,title,description,status",
        limit: -1,
      },
    });
    return data.data;
  } catch (error) {
    console.warn("Failed to load courses, using legacy unit hierarchy:", error);
    return [];
  }
}

export async function getUnits(courseId?: number): Promise<Unit[]> {
  const courses = await getCourses();
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const params: Record<string, unknown> = {
    sort: "unit_index,id",
    fields: "id,course_id,unit_index,title,description",
    limit: -1,
  };
  if (courseId) params["filter[course_id][_eq]"] = courseId;
  const { data } = await directus.get<{ data: Unit[] }>("/units", {
    params,
  });
  return data.data.map((unit) => ({
    ...unit,
    course: unit.course_id ? courseMap.get(unit.course_id) : undefined,
  }));
}

export async function getLessons(
  unitId?: number,
  courseId?: number,
): Promise<Lesson[]> {
  const params: Record<string, unknown> = {
    fields: "id,unit_id,lesson_index,title,description",
  };
  if (unitId) params["filter[unit_id][_eq]"] = unitId;
  const { data } = await directus.get<{ data: Lesson[] }>("/lessons", {
    params,
  });
  const units = await getUnits(courseId);
  const unitMap = new Map(units.map((unit) => [unit.id, unit]));

  return data.data
    .filter((lesson) => unitMap.has(lesson.unit_id))
    .map((lesson) => ({
      ...lesson,
      unit: unitMap.get(lesson.unit_id),
    }))
    .sort((left, right) => {
      const leftCourseIndex =
        left.unit?.course?.course_index ?? Number.MAX_SAFE_INTEGER;
      const rightCourseIndex =
        right.unit?.course?.course_index ?? Number.MAX_SAFE_INTEGER;

      if (leftCourseIndex !== rightCourseIndex) {
        return leftCourseIndex - rightCourseIndex;
      }

      const leftUnitIndex = left.unit?.unit_index ?? Number.MAX_SAFE_INTEGER;
      const rightUnitIndex = right.unit?.unit_index ?? Number.MAX_SAFE_INTEGER;

      if (leftUnitIndex !== rightUnitIndex) {
        return leftUnitIndex - rightUnitIndex;
      }

      if (left.lesson_index !== right.lesson_index) {
        return left.lesson_index - right.lesson_index;
      }

      return left.id - right.id;
    });
}

export async function getLesson(id: number): Promise<Lesson> {
  const [{ data }, units] = await Promise.all([
    directus.get<{ data: Lesson[] }>("/lessons", {
      params: {
        fields: "id,unit_id,lesson_index,title,description",
        "filter[id][_eq]": id,
        limit: 1,
      },
    }),
    getUnits(),
  ]);
  const lesson = data.data[0];
  if (!lesson) {
    throw new Error(`Lesson ${id} not found`);
  }

  const unitMap = new Map(units.map((unit) => [unit.id, unit]));
  return {
    ...lesson,
    unit: unitMap.get(lesson.unit_id),
  };
}

export async function getModules(lessonId: number): Promise<LessonModule[]> {
  const { data } = await directus.get<{ data: LessonModule[] }>(
    "/lesson_modules",
    {
      params: {
        "filter[lesson_id][_eq]": lessonId,
        sort: "module_index",
        fields: "*",
      },
    },
  );
  return Promise.all(
    data.data.map(async (module) => ({
      ...module,
      items: await getModuleItems(module.id),
    })),
  );
}

export async function getModuleItems(moduleId: number): Promise<ModuleItem[]> {
  const { data } = await directus.get<{ data: ModuleItem[] }>("/module_items", {
    params: {
      "filter[module_id][_eq]": moduleId,
      sort: "sort_order",
    },
  });
  return data.data.map(normalizeModuleItem);
}

export async function getResources(params?: {
  status?: "approved";
  type?: string;
  search?: string;
}): Promise<Resource[]> {
  const queryParams: Record<string, unknown> = { sort: "-id" };
  if (params?.status) queryParams["filter[status][_eq]"] = params.status;
  if (params?.type) queryParams["filter[type][_eq]"] = params.type;
  if (params?.search) queryParams["search"] = params.search;

  const { data } = await directus.get<{ data: Resource[] }>("/resources", {
    params: queryParams,
  });
  return data.data.map(normalizeResource);
}

export default directus;
