import "server-only";
import { query, queryOne } from "./db";
import { COURSE_CATALOG } from "./course-catalog";
import { buildAppAssetUrl } from "./media-url";
import { getMiniAppMount, listMiniAppMounts } from "./miniapps";
import type { MiniAppMountSummary } from "./miniapps.types";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://127.0.0.1:8055";
const DIRECTUS_SSO_EMAIL =
  process.env.DIRECTUS_SSO_EMAIL || "sso-admin@course-platform.com";
const DIRECTUS_SSO_PASSWORD =
  process.env.DIRECTUS_SSO_PASSWORD || "SSOAdmin2026@Directus";
const DIRECTUS_SESSION_COOKIE = "directus_session_token";

type DirectusListResponse<T> = {
  data: T[];
};

type DirectusItemResponse<T> = {
  data: T;
};

type DirectusFileMeta = {
  id: string;
};

export interface AdminUnit {
  id: number;
  course_id?: number | null;
  unit_index: number;
  title: string;
  description?: string | null;
}

export interface AdminCourse {
  id: number;
  course_index: number;
  title: string;
  description: string | null;
  status: string | null;
}

export interface AdminLesson {
  id: number;
  unit_id: number;
  lesson_index: number;
  title: string;
  description: string | null;
}

export interface AdminModuleItem {
  id: number;
  module_id?: number;
  item_type: string;
  title: string;
  sort_order: number;
  duration?: number;
  file_url?: string | null;
  miniAppMount?: MiniAppMountSummary | null;
}

export interface AdminLessonModule {
  id: number;
  lesson_id: number;
  module_index: number;
  module_name: string;
  module_type: string;
  description: string | null;
  primary_item_id?: number | null;
  assignment_required?: boolean | null;
  unlock_mode?: string | null;
  items?: AdminModuleItem[];
}

export interface AdminLessonCustomization {
  id: number;
  title?: string | null;
  auth_user_id: string;
  lesson_id: number;
  modules_config?: string | null;
  custom_resources?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminResource {
  id: number;
  title: string;
  type: string;
  file_url: string;
  status: string;
}

export interface DirectusSessionCookie {
  name: string;
  value: string;
  maxAge: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getDirectusToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }

  const response = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: DIRECTUS_SSO_EMAIL,
      password: DIRECTUS_SSO_PASSWORD,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to authenticate with Directus");
  }

  const json = await response.json();
  const token = json?.data?.access_token as string | undefined;
  const expires = json?.data?.expires as number | undefined;

  if (!token || !expires) {
    throw new Error("Invalid Directus auth response");
  }

  cachedToken = {
    value: token,
    expiresAt: now + expires,
  };

  return token;
}

function parseDirectusSessionCookie(
  setCookieHeader: string | null,
): DirectusSessionCookie {
  if (!setCookieHeader) {
    throw new Error("Missing Directus session cookie");
  }

  const valueMatch = setCookieHeader.match(
    new RegExp(`${DIRECTUS_SESSION_COOKIE}=([^;]+)`),
  );
  if (!valueMatch?.[1]) {
    throw new Error("Invalid Directus session cookie");
  }

  const maxAgeMatch = setCookieHeader.match(/Max-Age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 60 * 60 * 24;

  return {
    name: DIRECTUS_SESSION_COOKIE,
    value: valueMatch[1],
    maxAge,
  };
}

async function directusFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getDirectusToken();
  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Directus request failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function getAssetIdFromUrl(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/(?:directus\/)?assets\/([^/?]+)/);
  return match?.[1] || null;
}

async function attachMiniAppMounts(
  items: AdminModuleItem[],
): Promise<AdminModuleItem[]> {
  const itemIds = items
    .map((item) => item.id)
    .filter(
      (itemId): itemId is number => Number.isInteger(itemId) && itemId > 0,
    );
  if (itemIds.length === 0) {
    return items;
  }

  const mounts = await listMiniAppMounts("standard_module_item", itemIds);
  const mountByItemId = new Map(mounts.map((mount) => [mount.ownerId, mount]));

  return items.map((item) => ({
    ...item,
    miniAppMount: mountByItemId.get(item.id) || null,
  }));
}

export async function getDirectusAuthHeaders(
  headers?: HeadersInit,
): Promise<Headers> {
  const token = await getDirectusToken();
  const finalHeaders = new Headers(headers);

  finalHeaders.set("Authorization", `Bearer ${token}`);

  return finalHeaders;
}

export async function createDirectusSessionCookie(): Promise<DirectusSessionCookie> {
  const response = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: DIRECTUS_SSO_EMAIL,
      password: DIRECTUS_SSO_PASSWORD,
      mode: "session",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create Directus session: ${response.status} ${text}`,
    );
  }

  return parseDirectusSessionCookie(response.headers.get("set-cookie"));
}

export async function listAdminUnits(): Promise<AdminUnit[]> {
  return listAdminUnitsByCourse();
}

export async function listAdminCourses(): Promise<AdminCourse[]> {
  return query<AdminCourse>(
    `select id, course_index, title, description, status
     from courses
     order by course_index asc nulls last, id asc`,
  );
}

export async function createAdminCourse(
  payload: Pick<
    AdminCourse,
    "course_index" | "title" | "description" | "status"
  >,
): Promise<AdminCourse> {
  const course = await queryOne<AdminCourse>(
    `insert into courses (course_index, title, description, status, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     returning id, course_index, title, description, status`,
    [payload.course_index, payload.title, payload.description, payload.status],
  );
  if (!course) {
    throw new Error("Failed to create course");
  }
  return course;
}

export async function updateAdminCourse(
  courseId: number,
  payload: Partial<
    Pick<AdminCourse, "course_index" | "title" | "description" | "status">
  >,
): Promise<void> {
  await query(
    `update courses
     set course_index = coalesce($2, course_index),
         title = coalesce($3, title),
         description = case when $4 then $5 else description end,
         status = coalesce($6, status),
         updated_at = now()
     where id = $1`,
    [
      courseId,
      payload.course_index ?? null,
      payload.title ?? null,
      Object.prototype.hasOwnProperty.call(payload, "description"),
      payload.description ?? null,
      payload.status ?? null,
    ],
  );
}

export async function deleteAdminCourse(courseId: number): Promise<void> {
  await query("delete from courses where id = $1", [courseId]);
}

export async function listAdminUnitsByCourse(
  courseId?: number,
): Promise<AdminUnit[]> {
  const query = new URLSearchParams({
    sort: "unit_index,id",
    fields: "id,course_id,unit_index,title,description",
    limit: "-1",
  });
  if (courseId) {
    query.set("filter[course_id][_eq]", String(courseId));
  }
  const response = await directusFetch<DirectusListResponse<AdminUnit>>(
    `/items/units?${query.toString()}`,
  );
  return response.data;
}

export async function createAdminUnit(
  payload: Pick<
    AdminUnit,
    "course_id" | "unit_index" | "title" | "description"
  >,
): Promise<AdminUnit> {
  const response = await directusFetch<DirectusItemResponse<AdminUnit>>(
    "/items/units",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function updateAdminUnit(
  unitId: number,
  payload: Partial<
    Pick<AdminUnit, "course_id" | "unit_index" | "title" | "description">
  >,
): Promise<void> {
  await directusFetch<DirectusItemResponse<AdminUnit>>(
    `/items/units/${unitId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminUnit(unitId: number): Promise<void> {
  await directusFetch<unknown>(`/items/units/${unitId}`, {
    method: "DELETE",
  });
}

export async function listAdminLessons(unitId: number): Promise<AdminLesson[]> {
  const query = new URLSearchParams({
    sort: "lesson_index",
    fields: "id,unit_id,lesson_index,title,description",
    limit: "-1",
  });
  query.set("filter[unit_id][_eq]", String(unitId));

  const response = await directusFetch<DirectusListResponse<AdminLesson>>(
    `/items/lessons?${query.toString()}`,
  );
  return response.data;
}

export async function createAdminLesson(
  payload: Pick<
    AdminLesson,
    "unit_id" | "lesson_index" | "title" | "description"
  >,
): Promise<AdminLesson> {
  const response = await directusFetch<DirectusItemResponse<AdminLesson>>(
    "/items/lessons",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function getAdminLesson(id: number): Promise<AdminLesson | null> {
  try {
    const response = await directusFetch<DirectusItemResponse<AdminLesson>>(
      `/items/lessons/${id}?fields=id,unit_id,lesson_index,title,description`,
    );
    return response.data;
  } catch {
    return null;
  }
}

export async function listAdminModules(
  lessonId: number,
): Promise<AdminLessonModule[]> {
  const query = new URLSearchParams({
    sort: "module_index",
    fields:
      "id,lesson_id,module_index,module_name,module_type,description,primary_item_id,assignment_required,unlock_mode",
    limit: "-1",
  });
  query.set("filter[lesson_id][_eq]", String(lessonId));

  const response = await directusFetch<DirectusListResponse<AdminLessonModule>>(
    `/items/lesson_modules?${query.toString()}`,
  );

  // Nested relation fields have proven unreliable here; fetch module items directly
  // so content management always reflects the latest uploaded resources.
  return Promise.all(
    response.data.map(async (module) => ({
      ...module,
      module_name:
        module.module_name ||
        module.module_type ||
        `流程 ${module.module_index}`,
      module_type:
        module.module_type ||
        module.module_name ||
        `流程 ${module.module_index}`,
      items: await listAdminModuleItems(module.id),
    })),
  );
}

export async function getAdminLessonCustomization(
  authUserId: string,
  lessonId: number,
): Promise<AdminLessonCustomization | null> {
  const query = new URLSearchParams({
    fields: "id,title,auth_user_id,lesson_id,modules_config,custom_resources",
    limit: "1",
  });
  query.set("filter[auth_user_id][_eq]", authUserId);
  query.set("filter[lesson_id][_eq]", String(lessonId));

  const response = await directusFetch<
    DirectusListResponse<AdminLessonCustomization>
  >(`/items/lessonCustomizations?${query.toString()}`);

  return response.data[0] || null;
}

export async function upsertAdminLessonCustomization(payload: {
  auth_user_id: string;
  lesson_id: number;
  title?: string | null;
  modules_config: string;
  custom_resources?: string;
}): Promise<AdminLessonCustomization> {
  const existing = await getAdminLessonCustomization(
    payload.auth_user_id,
    payload.lesson_id,
  );

  if (existing) {
    const response = await directusFetch<
      DirectusItemResponse<AdminLessonCustomization>
    >(`/items/lessonCustomizations/${existing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title ?? existing.title ?? null,
        modules_config: payload.modules_config,
        custom_resources: payload.custom_resources ?? "[]",
      }),
    });

    return response.data;
  }

  const response = await directusFetch<
    DirectusItemResponse<AdminLessonCustomization>
  >("/items/lessonCustomizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_user_id: payload.auth_user_id,
      lesson_id: payload.lesson_id,
      title: payload.title ?? null,
      modules_config: payload.modules_config,
      custom_resources: payload.custom_resources ?? "[]",
    }),
  });

  return response.data;
}

export async function createAdminModule(
  payload: Pick<
    AdminLessonModule,
    | "lesson_id"
    | "module_index"
    | "module_name"
    | "module_type"
    | "description"
    | "primary_item_id"
    | "assignment_required"
    | "unlock_mode"
  >,
): Promise<AdminLessonModule> {
  const response = await directusFetch<DirectusItemResponse<AdminLessonModule>>(
    "/items/lesson_modules",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function listAdminModuleItems(
  moduleId: number,
): Promise<AdminModuleItem[]> {
  const query = new URLSearchParams({
    sort: "sort_order",
    fields: "id,module_id,item_type,title,sort_order,duration,file_url",
    limit: "-1",
  });
  query.set("filter[module_id][_eq]", String(moduleId));

  const response = await directusFetch<DirectusListResponse<AdminModuleItem>>(
    `/items/module_items?${query.toString()}`,
  );
  return attachMiniAppMounts(response.data);
}

export async function updateAdminLesson(
  lessonId: number,
  payload: Partial<Pick<AdminLesson, "lesson_index" | "title" | "description">>,
): Promise<void> {
  await directusFetch<DirectusItemResponse<AdminLesson>>(
    `/items/lessons/${lessonId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminLesson(lessonId: number): Promise<void> {
  await directusFetch<unknown>(`/items/lessons/${lessonId}`, {
    method: "DELETE",
  });
}

export async function updateAdminModule(
  moduleId: number,
  payload: Partial<
    Pick<
      AdminLessonModule,
      | "module_index"
      | "module_name"
      | "module_type"
      | "description"
      | "primary_item_id"
      | "assignment_required"
      | "unlock_mode"
    >
  >,
): Promise<void> {
  await directusFetch<DirectusItemResponse<AdminLessonModule>>(
    `/items/lesson_modules/${moduleId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminModule(moduleId: number): Promise<void> {
  await directusFetch<unknown>(`/items/lesson_modules/${moduleId}`, {
    method: "DELETE",
  });
}

export async function createAdminModuleItem(payload: {
  module_id: number;
  item_type: string;
  title: string;
  file_url?: string | null;
  sort_order: number;
  duration?: number;
}): Promise<AdminModuleItem> {
  const response = await directusFetch<DirectusItemResponse<AdminModuleItem>>(
    "/items/module_items",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  return response.data;
}

export async function createAdminResource(payload: {
  title: string;
  type: string;
  file_url: string;
  status?: string;
}): Promise<AdminResource> {
  const response = await directusFetch<DirectusItemResponse<AdminResource>>(
    "/items/resources",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        status: payload.status ?? "approved",
      }),
    },
  );

  return response.data;
}

async function countAdminModuleItemsByField(
  field: "file_url",
  value?: string | null,
): Promise<number> {
  if (!value) return 0;

  const query = new URLSearchParams({
    limit: "1",
  });
  query.set("aggregate[count]", "*");
  query.set(`filter[${field}][_eq]`, value);

  const response = await directusFetch<{
    data?: Array<{ count?: number | string | null }>;
  }>(`/items/module_items?${query.toString()}`);

  const count = response.data?.[0]?.count;
  return typeof count === "string" ? Number(count) : Number(count || 0);
}

export async function countAdminModuleItemsByFileUrl(
  fileUrl?: string | null,
): Promise<number> {
  return countAdminModuleItemsByField("file_url", fileUrl);
}

export async function deleteAdminResourcesByFileUrl(
  fileUrl?: string | null,
): Promise<void> {
  if (!fileUrl) return;

  const query = new URLSearchParams({
    fields: "id,file_url",
    limit: "-1",
  });
  query.set("filter[file_url][_eq]", fileUrl);

  const response = await directusFetch<
    DirectusListResponse<Pick<AdminResource, "id" | "file_url">>
  >(`/items/resources?${query.toString()}`);

  for (const resource of response.data) {
    await directusFetch<unknown>(`/items/resources/${resource.id}`, {
      method: "DELETE",
    });
  }
}

export async function updateAdminModuleItem(
  itemId: number,
  payload: Partial<
    Pick<
      AdminModuleItem,
      "title" | "item_type" | "sort_order" | "file_url"
    >
  >,
): Promise<void> {
  await directusFetch<DirectusItemResponse<AdminModuleItem>>(
    `/items/module_items/${itemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminModuleItem(itemId: number): Promise<void> {
  await directusFetch<unknown>(`/items/module_items/${itemId}`, {
    method: "DELETE",
  });
}

export async function getAdminModuleItem(
  itemId: number,
): Promise<AdminModuleItem | null> {
  try {
    const response = await directusFetch<DirectusItemResponse<AdminModuleItem>>(
      `/items/module_items/${itemId}?fields=id,module_id,item_type,title,sort_order,duration,file_url`,
    );
    const mount = await getMiniAppMount("standard_module_item", itemId);
    const item = {
      ...response.data,
      miniAppMount: mount,
    };
    return item;
  } catch {
    return null;
  }
}

export async function uploadDirectusFile(
  file: File,
  title: string,
): Promise<string> {
  const headers = await getDirectusAuthHeaders();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);

  const response = await fetch(`${DIRECTUS_URL}/files`, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Directus file upload failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  const fileId = json?.data?.id as string | undefined;
  if (!fileId) {
    throw new Error("Missing Directus file id");
  }

  return buildPublicDirectusAssetUrl(fileId);
}

export async function deleteDirectusFileByAssetUrl(
  fileUrl?: string | null,
): Promise<void> {
  if (!fileUrl) return;

  const match = fileUrl.match(/\/(?:directus\/)?assets\/([^/?]+)/);
  if (!match) return;

  await directusFetch<unknown>(`/files/${match[1]}`, {
    method: "DELETE",
  });
}

export function buildPublicDirectusAssetUrl(fileId: string): string {
  return buildAppAssetUrl(fileId);
}

export async function reindexAdminUnits(): Promise<void> {
  const units = await listAdminUnits();
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const desiredIndex = index + 1;
    if (unit.unit_index !== desiredIndex) {
      await updateAdminUnit(unit.id, { unit_index: desiredIndex });
    }
  }
}

export async function reindexAdminCourses(): Promise<void> {
  const courses = await listAdminCourses();
  for (let index = 0; index < courses.length; index += 1) {
    const course = courses[index];
    const desiredIndex = index + 1;
    if (course.course_index !== desiredIndex) {
      await updateAdminCourse(course.id, { course_index: desiredIndex });
    }
  }
}

export async function reindexAdminUnitsByCourse(
  courseId: number,
): Promise<void> {
  const units = await listAdminUnitsByCourse(courseId);
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const desiredIndex = index + 1;
    if (unit.unit_index !== desiredIndex) {
      await updateAdminUnit(unit.id, { unit_index: desiredIndex });
    }
  }
}

export async function reindexAdminLessons(unitId: number): Promise<void> {
  const lessons = await listAdminLessons(unitId);
  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index];
    const desiredIndex = index + 1;
    if (lesson.lesson_index !== desiredIndex) {
      await updateAdminLesson(lesson.id, { lesson_index: desiredIndex });
    }
  }
}

export async function reindexAdminModules(lessonId: number): Promise<void> {
  const modules = await listAdminModules(lessonId);
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    const desiredIndex = index + 1;
    if (module.module_index !== desiredIndex) {
      await updateAdminModule(module.id, { module_index: desiredIndex });
    }
  }
}

export async function deleteAdminModuleCascade(
  moduleId: number,
): Promise<void> {
  const items = await listAdminModuleItems(moduleId);
  const fileUrls = new Set<string>();

  for (const item of items) {
    await deleteAdminModuleItem(item.id);
    if (item.file_url) fileUrls.add(item.file_url);
  }

  for (const fileUrl of Array.from(fileUrls)) {
    if ((await countAdminModuleItemsByFileUrl(fileUrl)) === 0) {
      await deleteAdminResourcesByFileUrl(fileUrl);
      await deleteDirectusFileByAssetUrl(fileUrl);
    }
  }

  await deleteAdminModule(moduleId);
}

export async function deleteAdminLessonCascade(
  lessonId: number,
): Promise<void> {
  const lesson = await getAdminLesson(lessonId);
  const modules = await listAdminModules(lessonId);
  for (const module of modules) {
    await deleteAdminModuleCascade(module.id);
  }
  await deleteAdminLesson(lessonId);
  if (lesson) {
    await reindexAdminLessons(lesson.unit_id);
  }
}

export async function deleteAdminUnitCascade(unitId: number): Promise<void> {
  const units = await listAdminUnits();
  const unit = units.find((candidate) => candidate.id === unitId) || null;
  const lessons = await listAdminLessons(unitId);
  for (const lesson of lessons) {
    await deleteAdminLessonCascade(lesson.id);
  }
  await deleteAdminUnit(unitId);
  if (unit?.course_id) {
    await reindexAdminUnitsByCourse(unit.course_id);
  } else {
    await reindexAdminUnits();
  }
}

export async function deleteAdminCourseCascade(
  courseId: number,
): Promise<void> {
  const units = await listAdminUnitsByCourse(courseId);
  for (const unit of units) {
    await deleteAdminUnitCascade(unit.id);
  }
  await deleteAdminCourse(courseId);
  await reindexAdminCourses();
}

async function ensurePlaceholderCourseStructure(courseId: number): Promise<void> {
  const units = await listAdminUnitsByCourse(courseId);
  const unit =
    units[0] ||
    (await createAdminUnit({
      course_id: courseId,
      unit_index: 1,
      title: "待添加",
      description: "待添加",
    }));

  if (!units.length) {
    await reindexAdminUnitsByCourse(courseId);
  }

  const lessons = await listAdminLessons(unit.id);
  const lesson =
    lessons[0] ||
    (await createAdminLesson({
      unit_id: unit.id,
      lesson_index: 1,
      title: "待添加",
      description: "待添加",
    }));

  if (!lessons.length) {
    await reindexAdminLessons(unit.id);
  }

  const modules = await listAdminModules(lesson.id);
  if (modules.length === 0) {
    await createAdminModule({
      lesson_id: lesson.id,
      module_index: 1,
      module_name: "待添加",
      module_type: "待添加",
      description: "待添加",
      assignment_required: false,
      unlock_mode: "free",
      primary_item_id: null,
    });
    await reindexAdminModules(lesson.id);
  }
}

export async function ensureDefaultPlaceholderCourses(): Promise<void> {
  const existingCourses = await listAdminCourses();
  const courseByTitle = new Map(
    existingCourses.map((course) => [course.title.trim(), course]),
  );
  const knownIds = new Set<number>();

  for (const entry of COURSE_CATALOG) {
    let course = courseByTitle.get(entry.title);

    if (!course) {
      course = await createAdminCourse({
        course_index: entry.desiredIndex,
        title: entry.title,
        description: entry.description,
        status: "active",
      });
      courseByTitle.set(entry.title, course);
    } else if (!course.description?.trim() && entry.description) {
      await updateAdminCourse(course.id, {
        description: entry.description,
        status: course.status || "active",
      });
      course = {
        ...course,
        description: entry.description,
      };
      courseByTitle.set(entry.title, course);
    }

    knownIds.add(course.id);

    if (entry.ensurePlaceholderStructure) {
      await ensurePlaceholderCourseStructure(course.id);
    }
  }

  const allCourses = await listAdminCourses();
  const finalCourses = [
    ...COURSE_CATALOG.map((entry) => allCourses.find((course) => course.title.trim() === entry.title)).filter(
      (course): course is AdminCourse => Boolean(course),
    ),
    ...allCourses.filter((course) => !knownIds.has(course.id)),
  ];

  for (let index = 0; index < finalCourses.length; index += 1) {
    const course = finalCourses[index];
    const desiredIndex = index + 1;
    if (course.course_index !== desiredIndex) {
      await updateAdminCourse(course.id, { course_index: desiredIndex });
    }
  }
}
