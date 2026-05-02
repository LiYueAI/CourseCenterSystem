import "server-only";
import {
  query,
  queryOne,
  queryOneWithClient,
  queryWithClient,
  withTransaction,
} from "@/lib/db";
import { getMiniAppMount, listMiniAppMounts } from "@/lib/miniapps";
import type { MiniAppMountSummary } from "@/lib/miniapps.types";

export interface TeacherResourceRecord {
  id: number;
  auth_user_id: string;
  lesson_id: number;
  module_id: number;
  title: string;
  item_type: string;
  file_url: string | null;
  tts_audio_url: string | null;
  duration: number;
  review_status?: "draft" | "reviewed" | "published";
  version_number?: number;
  ai_generated?: boolean;
  source_model?: string | null;
  source_prompt?: string | null;
  source_payload?: Record<string, unknown> | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  is_shared?: boolean;
  access_scope?: "mine" | "shared";
  owner_name?: string | null;
  created_at?: string;
  updated_at?: string;
  miniAppMount?: MiniAppMountSummary | null;
}

export interface TeacherResourceMiniAppMountInput {
  miniAppId: number;
  miniAppVersionId?: number | null;
  launchMode?: "iframe";
  mountStatus?: "active" | "disabled";
  titleOverride?: string | null;
  coverUrl?: string | null;
  aspectRatio?: string | null;
  params?: Record<string, unknown>;
}

export type TeacherResourceReviewStatus = "draft" | "reviewed" | "published";

export interface TeacherResourceVersionRecord {
  id: number;
  resource_id: number;
  auth_user_id: string;
  version_number: number;
  title: string;
  item_type: string;
  file_url: string | null;
  tts_audio_url: string | null;
  duration: number;
  review_status: TeacherResourceReviewStatus;
  snapshot: Record<string, unknown>;
  created_at?: string;
}

export interface TeacherLessonPlanItemRecord {
  id: number;
  auth_user_id: string;
  lesson_id: number;
  module_id: number;
  source_type: "standard" | "teacher_resource";
  standard_item_id: number | null;
  teacher_resource_id: number | null;
  title: string;
  item_type: string;
  file_url: string | null;
  tts_audio_url: string | null;
  duration: number;
  sort_order: number;
  is_primary?: boolean;
  created_at?: string;
}

export interface TeacherLessonPlanItemInput {
  module_id: number;
  source_type: "standard" | "teacher_resource";
  standard_item_id?: number | null;
  teacher_resource_id?: number | null;
  title: string;
  item_type: string;
  file_url?: string | null;
  tts_audio_url?: string | null;
  duration?: number;
  sort_order: number;
  is_primary?: boolean;
}

export interface TeacherStudentAssignmentRecord {
  id: number;
  auth_user_id: string;
  lesson_id: number;
  module_id: number;
  title: string;
  description: string;
  due_at: string | null;
  is_required: boolean;
  sort_order: number;
  is_primary?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TeacherStudentAssignmentInput {
  id?: number;
  module_id: number;
  title: string;
  description: string;
  due_at?: string | null;
  is_required?: boolean;
  sort_order: number;
}

export interface TeacherAssignmentMetadata {
  dueAt: string | null;
  isRequired: boolean;
}

export type TeacherLessonAssignmentSettingsMap = Record<
  string,
  TeacherAssignmentMetadata
>;

export interface TeacherLessonPlanTemplateRecord {
  id: number;
  auth_user_id: string;
  title: string;
  source_lesson_id: number;
  plan_items: TeacherLessonPlanItemInput[];
  student_assignments: TeacherStudentAssignmentInput[];
  assignment_settings: TeacherLessonAssignmentSettingsMap;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTeacherLessonPlanTemplateInput {
  title: string;
  sourceLessonId: number;
  planItems: TeacherLessonPlanItemInput[];
  studentAssignments: TeacherStudentAssignmentInput[];
  assignmentSettings: TeacherLessonAssignmentSettingsMap;
}

export interface TeacherLessonCustomizationData {
  teacherSelections: Record<string, number[]>;
  assignmentSettings: TeacherLessonAssignmentSettingsMap;
}

let initialized = false;

function normalizeMiniAppMountText(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeMiniAppMountUrl(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeMiniAppMountParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function teacherResourceMountToInput(
  mount: MiniAppMountSummary | null | undefined,
): TeacherResourceMiniAppMountInput | null {
  if (!mount) {
    return null;
  }

  return {
    miniAppId: mount.miniAppId,
    miniAppVersionId: mount.miniAppVersionId,
    launchMode: mount.launchMode,
    mountStatus: mount.mountStatus,
    titleOverride: mount.titleOverride,
    coverUrl: mount.coverUrl,
    aspectRatio: mount.aspectRatio,
    params: mount.params,
  };
}

async function attachMiniAppMountToTeacherResource(
  resource: TeacherResourceRecord | null,
): Promise<TeacherResourceRecord | null> {
  if (!resource) {
    return null;
  }

  const mount = await getMiniAppMount("teacher_resource", resource.id);
  return {
    ...resource,
    miniAppMount: mount,
  };
}

async function attachMiniAppMountsToTeacherResources(
  resources: TeacherResourceRecord[],
): Promise<TeacherResourceRecord[]> {
  const resourceIds = resources
    .map((resource) => resource.id)
    .filter(
      (resourceId): resourceId is number =>
        Number.isInteger(resourceId) && resourceId > 0,
    );

  if (resourceIds.length === 0) {
    return resources.map((resource) => ({
      ...resource,
      miniAppMount: null,
    }));
  }

  const mounts = await listMiniAppMounts("teacher_resource", resourceIds);
  const mountByResourceId = new Map(
    mounts.map((mount) => [mount.ownerId, mount]),
  );

  return resources.map((resource) => ({
    ...resource,
    miniAppMount: mountByResourceId.get(resource.id) || null,
  }));
}

async function upsertTeacherResourceMiniAppMountWithClient(
  client: Parameters<typeof queryWithClient>[0],
  resourceId: number,
  input: TeacherResourceMiniAppMountInput,
): Promise<void> {
  const app = await queryOneWithClient<{ publishedVersionId: number | null }>(
    client,
    `
      select published_version_id as "publishedVersionId"
      from mini_apps
      where id = $1
    `,
    [input.miniAppId],
  );

  if (!app) {
    throw new Error("小游戏不存在");
  }

  const resolvedVersionId =
    input.miniAppVersionId ?? app.publishedVersionId ?? null;
  if (!resolvedVersionId) {
    throw new Error("请先发布至少一个小游戏版本，或显式选择版本");
  }

  const version = await queryOneWithClient<{ id: number }>(
    client,
    `
      select id
      from mini_app_versions
      where id = $1
        and mini_app_id = $2
    `,
    [resolvedVersionId, input.miniAppId],
  );

  if (!version) {
    throw new Error("小游戏版本不存在");
  }

  await queryWithClient(
    client,
    `
      insert into content_miniapp_mounts (
        owner_kind,
        owner_id,
        mini_app_id,
        mini_app_version_id,
        launch_mode,
        mount_status,
        title_override,
        cover_url,
        aspect_ratio,
        params,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      on conflict (owner_kind, owner_id)
      do update set
        mini_app_id = excluded.mini_app_id,
        mini_app_version_id = excluded.mini_app_version_id,
        launch_mode = excluded.launch_mode,
        mount_status = excluded.mount_status,
        title_override = excluded.title_override,
        cover_url = excluded.cover_url,
        aspect_ratio = excluded.aspect_ratio,
        params = excluded.params,
        updated_at = now()
    `,
    [
      "teacher_resource",
      resourceId,
      input.miniAppId,
      resolvedVersionId,
      input.launchMode || "iframe",
      input.mountStatus || "active",
      normalizeMiniAppMountText(input.titleOverride),
      normalizeMiniAppMountUrl(input.coverUrl),
      normalizeMiniAppMountText(input.aspectRatio) || "16:9",
      JSON.stringify(normalizeMiniAppMountParams(input.params)),
    ],
  );
}

async function deleteTeacherResourceMiniAppMountWithClient(
  client: Parameters<typeof queryWithClient>[0],
  resourceId: number,
): Promise<void> {
  await queryWithClient(
    client,
    `
      delete from content_miniapp_mounts
      where owner_kind = $1
        and owner_id = $2
    `,
    ["teacher_resource", resourceId],
  );
}

function isAssignmentSettingsKey(key: string): boolean {
  return key.startsWith("standard:") || key.startsWith("teacher_custom:");
}

function normalizeTeacherSelectionsValue(
  value: unknown,
): Record<string, number[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, number[]> = {};
  for (const [moduleId, ids] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(ids)) {
      continue;
    }

    const validIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length > 0) {
      normalized[moduleId] = validIds;
    }
  }

  return normalized;
}

export function normalizeTeacherAssignmentDueAt(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function normalizeTeacherAssignmentIsRequired(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return true;
}

export function normalizeTeacherAssignmentMetadata(
  value: unknown,
): TeacherAssignmentMetadata {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    dueAt: normalizeTeacherAssignmentDueAt(
      candidate.dueAt ?? candidate.due_at ?? null,
    ),
    isRequired: normalizeTeacherAssignmentIsRequired(
      candidate.isRequired ?? candidate.is_required ?? true,
    ),
  };
}

export function normalizeTeacherLessonAssignmentSettingsMap(
  value: unknown,
): TeacherLessonAssignmentSettingsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: TeacherLessonAssignmentSettingsMap = {};

  for (const [assignmentKey, metadata] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!isAssignmentSettingsKey(assignmentKey)) {
      continue;
    }

    const normalizedMetadata = normalizeTeacherAssignmentMetadata(metadata);
    if (normalizedMetadata.dueAt === null && normalizedMetadata.isRequired) {
      continue;
    }

    normalized[assignmentKey] = normalizedMetadata;
  }

  return normalized;
}

export function parseTeacherLessonCustomizationData(
  value: string | null | undefined,
): TeacherLessonCustomizationData {
  if (!value) {
    return {
      teacherSelections: {},
      assignmentSettings: {},
    };
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        teacherSelections: {},
        assignmentSettings: {},
      };
    }

    const raw = parsed as Record<string, unknown>;
    const teacherSelectionsSource =
      raw.teacherSelections &&
      typeof raw.teacherSelections === "object" &&
      !Array.isArray(raw.teacherSelections)
        ? raw.teacherSelections
        : raw;

    return {
      teacherSelections: normalizeTeacherSelectionsValue(
        teacherSelectionsSource,
      ),
      assignmentSettings: normalizeTeacherLessonAssignmentSettingsMap(
        raw.assignmentSettings,
      ),
    };
  } catch {
    return {
      teacherSelections: {},
      assignmentSettings: {},
    };
  }
}

export function serializeTeacherLessonCustomizationData(
  input: Partial<TeacherLessonCustomizationData>,
): string {
  return JSON.stringify({
    teacherSelections: normalizeTeacherSelectionsValue(input.teacherSelections),
    assignmentSettings: normalizeTeacherLessonAssignmentSettingsMap(
      input.assignmentSettings,
    ),
  });
}

export async function ensureTeacherPlanTables() {
  if (initialized) {
    return;
  }

  await query(`
    create table if not exists teacher_resources (
      id serial primary key,
      auth_user_id varchar(255) not null,
      lesson_id integer not null,
      module_id integer not null,
      title text not null,
      item_type varchar(50) not null,
      file_url text,
      tts_audio_url text,
      duration integer not null default 0,
      review_status varchar(20) not null default 'draft',
      version_number integer not null default 1,
      ai_generated boolean not null default false,
      source_model text,
      source_prompt text,
      source_payload jsonb,
      reviewed_at timestamptz,
      published_at timestamptz,
      is_shared boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table teacher_resources
      add column if not exists review_status varchar(20) not null default 'draft',
      add column if not exists version_number integer not null default 1,
      add column if not exists ai_generated boolean not null default false,
      add column if not exists source_model text,
      add column if not exists source_prompt text,
      add column if not exists source_payload jsonb,
      add column if not exists reviewed_at timestamptz,
      add column if not exists published_at timestamptz,
      add column if not exists is_shared boolean not null default false;

    alter table teacher_resources
      drop constraint if exists teacher_resources_review_status_check;

    alter table teacher_resources
      add constraint teacher_resources_review_status_check
      check (review_status in ('draft', 'reviewed', 'published'));

    create index if not exists idx_teacher_resources_owner_lesson
      on teacher_resources (auth_user_id, lesson_id, module_id, created_at desc);

    create table if not exists teacher_resource_versions (
      id serial primary key,
      resource_id integer not null,
      auth_user_id varchar(255) not null,
      version_number integer not null,
      title text not null,
      item_type varchar(50) not null,
      file_url text,
      tts_audio_url text,
      duration integer not null default 0,
      review_status varchar(20) not null default 'draft',
      snapshot jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      unique (resource_id, version_number)
    );

    create index if not exists idx_teacher_resource_versions_resource
      on teacher_resource_versions (auth_user_id, resource_id, version_number desc);

    create table if not exists teacher_lesson_plan_items (
      id serial primary key,
      auth_user_id varchar(255) not null,
      lesson_id integer not null,
      module_id integer not null,
      source_type varchar(50) not null,
      standard_item_id integer,
      teacher_resource_id integer,
      title text not null,
      item_type varchar(50) not null,
      file_url text,
      tts_audio_url text,
      duration integer not null default 0,
      sort_order integer not null,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_teacher_lesson_plan_owner_lesson
      on teacher_lesson_plan_items (auth_user_id, lesson_id, sort_order asc);

    create table if not exists teacher_student_assignments (
      id serial primary key,
      auth_user_id varchar(255) not null,
      lesson_id integer not null,
      module_id integer not null,
      title text not null,
      description text not null default '',
      due_at timestamptz,
      is_required boolean not null default true,
      sort_order integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_teacher_student_assignments_owner_lesson
      on teacher_student_assignments (auth_user_id, lesson_id, module_id, sort_order asc);

    alter table teacher_student_assignments
      add column if not exists due_at timestamptz;

    alter table teacher_student_assignments
      add column if not exists is_required boolean not null default true;

    update teacher_student_assignments
    set is_required = true
    where is_required is null;

    create table if not exists teacher_lesson_plan_templates (
      id serial primary key,
      auth_user_id varchar(255) not null,
      title text not null,
      source_lesson_id integer not null,
      plan_items jsonb not null default '[]'::jsonb,
      student_assignments jsonb not null default '[]'::jsonb,
      assignment_settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_teacher_plan_templates_owner_updated
      on teacher_lesson_plan_templates (auth_user_id, updated_at desc, id desc);
  `);

  initialized = true;
}

export async function listTeacherResources(
  authUserId: string,
  filters: {
    lessonId: number;
    moduleId?: number | null;
  },
): Promise<TeacherResourceRecord[]> {
  await ensureTeacherPlanTables();

  const params: Array<string | number> = [authUserId, filters.lessonId];
  let sql = `
    select
      id,
      auth_user_id,
      lesson_id,
      module_id,
      title,
      item_type,
      file_url,
      tts_audio_url,
      duration,
      review_status,
      version_number,
      ai_generated,
      source_model,
      source_prompt,
      source_payload,
      reviewed_at,
      published_at,
      is_shared,
      'mine'::text as access_scope,
      null::text as owner_name,
      created_at,
      updated_at
    from teacher_resources
    where auth_user_id = $1
      and lesson_id = $2
  `;

  if (filters.moduleId) {
    params.push(filters.moduleId);
    sql += ` and module_id = $${params.length}`;
  }

  sql += " order by created_at desc, id desc";

  const resources = await query<TeacherResourceRecord>(sql, params);
  return attachMiniAppMountsToTeacherResources(resources);
}

export async function getTeacherResource(
  authUserId: string,
  resourceId: number,
): Promise<TeacherResourceRecord | null> {
  await ensureTeacherPlanTables();

  const resource = await queryOne<TeacherResourceRecord>(
    `
      select
        id,
        auth_user_id,
        lesson_id,
        module_id,
        title,
        item_type,
        file_url,
        tts_audio_url,
        duration,
        review_status,
        version_number,
        ai_generated,
        source_model,
        source_prompt,
        source_payload,
        reviewed_at,
        published_at,
        is_shared,
        'mine'::text as access_scope,
        null::text as owner_name,
        created_at,
        updated_at
      from teacher_resources
      where auth_user_id = $1
        and id = $2
    `,
    [authUserId, resourceId],
  );

  return attachMiniAppMountToTeacherResource(resource);
}

export async function listSharedTeacherResources(
  authUserId: string,
  filters: {
    lessonId: number;
    moduleId?: number | null;
  },
): Promise<TeacherResourceRecord[]> {
  await ensureTeacherPlanTables();

  const params: Array<string | number> = [authUserId, filters.lessonId];
  let sql = `
    select
      tr.id,
      tr.auth_user_id,
      tr.lesson_id,
      tr.module_id,
      tr.title,
      tr.item_type,
      tr.file_url,
      tr.tts_audio_url,
      tr.duration,
      tr.review_status,
      tr.version_number,
      tr.ai_generated,
      tr.source_model,
      tr.source_prompt,
      tr.source_payload,
      tr.reviewed_at,
      tr.published_at,
      tr.is_shared,
      'shared'::text as access_scope,
      teachers.name as owner_name,
      tr.created_at,
      tr.updated_at
    from teacher_resources tr
    left join teachers
      on teachers.user_id = tr.auth_user_id::uuid
    where tr.auth_user_id <> $1
      and tr.lesson_id = $2
      and tr.is_shared = true
      and tr.review_status = 'published'
  `;

  if (filters.moduleId) {
    params.push(filters.moduleId);
    sql += ` and tr.module_id = $${params.length}`;
  }

  sql +=
    " order by coalesce(tr.published_at, tr.updated_at, tr.created_at) desc, tr.id desc";

  const resources = await query<TeacherResourceRecord>(sql, params);
  return attachMiniAppMountsToTeacherResources(resources);
}

export async function getAccessibleTeacherResource(
  authUserId: string,
  resourceId: number,
): Promise<TeacherResourceRecord | null> {
  await ensureTeacherPlanTables();

  const resource = await queryOne<TeacherResourceRecord>(
    `
      select
        tr.id,
        tr.auth_user_id,
        tr.lesson_id,
        tr.module_id,
        tr.title,
        tr.item_type,
        tr.file_url,
        tr.tts_audio_url,
        tr.duration,
        tr.review_status,
        tr.version_number,
        tr.ai_generated,
        tr.source_model,
        tr.source_prompt,
        tr.source_payload,
        tr.reviewed_at,
        tr.published_at,
        tr.is_shared,
        case when tr.auth_user_id = $1 then 'mine' else 'shared' end as access_scope,
        teachers.name as owner_name,
        tr.created_at,
        tr.updated_at
      from teacher_resources tr
      left join teachers
        on teachers.user_id = tr.auth_user_id::uuid
      where tr.id = $2
        and (
          tr.auth_user_id = $1
          or (tr.is_shared = true and tr.review_status = 'published')
        )
    `,
    [authUserId, resourceId],
  );

  return attachMiniAppMountToTeacherResource(resource);
}

export async function deleteTeacherResource(
  authUserId: string,
  resourceId: number,
): Promise<TeacherResourceRecord | null> {
  await ensureTeacherPlanTables();

  const resource = await getTeacherResource(authUserId, resourceId);
  if (!resource) {
    return null;
  }

  await withTransaction(async (client) => {
    await queryWithClient(
      client,
      `
        delete from teacher_lesson_plan_items
        where auth_user_id = $1
          and teacher_resource_id = $2
      `,
      [authUserId, resourceId],
    );

    await deleteTeacherResourceMiniAppMountWithClient(client, resourceId);

    await queryWithClient(
      client,
      `
        delete from teacher_resources
        where auth_user_id = $1
          and id = $2
      `,
      [authUserId, resourceId],
    );
  });

  return resource;
}

export async function createTeacherResource(
  authUserId: string,
  payload: Omit<
    TeacherResourceRecord,
    | "id"
    | "auth_user_id"
    | "access_scope"
    | "owner_name"
    | "created_at"
    | "updated_at"
    | "miniAppMount"
    | "tts_audio_url"
  > & {
    tts_audio_url?: string | null;
    miniAppMount?: TeacherResourceMiniAppMountInput | null;
  },
): Promise<TeacherResourceRecord> {
  await ensureTeacherPlanTables();

  if (payload.item_type === "miniapp" && !payload.miniAppMount) {
    throw new Error("请选择要挂载的小游戏");
  }

  const resource = await withTransaction(async (client) => {
    const created = await queryOneWithClient<TeacherResourceRecord>(
      client,
      `
        insert into teacher_resources (
          auth_user_id,
          lesson_id,
          module_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          source_model,
          source_prompt,
          source_payload,
          is_shared
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
        returning
          id,
          auth_user_id,
          lesson_id,
          module_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          review_status,
          version_number,
          ai_generated,
          source_model,
          source_prompt,
          source_payload,
          reviewed_at,
          published_at,
          is_shared,
          'mine'::text as access_scope,
          null::text as owner_name,
          created_at,
          updated_at
      `,
      [
        authUserId,
        payload.lesson_id,
        payload.module_id,
        payload.title,
        payload.item_type,
        payload.file_url || null,
        payload.tts_audio_url || null,
        payload.duration || 0,
        payload.source_model || null,
        payload.source_prompt || null,
        payload.source_payload ? JSON.stringify(payload.source_payload) : null,
        payload.is_shared === true,
      ],
    );

    if (!created) {
      throw new Error("Failed to create teacher resource");
    }

    if (payload.item_type === "miniapp" && payload.miniAppMount) {
      await upsertTeacherResourceMiniAppMountWithClient(
        client,
        created.id,
        payload.miniAppMount,
      );
    }

    return created;
  });

  const createdResource = await getTeacherResource(authUserId, resource.id);
  if (!createdResource) {
    throw new Error("Failed to create teacher resource");
  }

  return createdResource;
}

export async function createTeacherPrivateResource(payload: {
  authUserId: string;
  lessonId: number;
  moduleId: number;
  title: string;
  itemType: string;
  fileUrl?: string | null;
  duration?: number;
  isShared?: boolean;
}): Promise<TeacherResourceRecord> {
  return createTeacherResource(payload.authUserId, {
    lesson_id: payload.lessonId,
    module_id: payload.moduleId,
    title: payload.title,
    item_type: payload.itemType,
    file_url: payload.fileUrl || null,
    duration: payload.duration || 0,
    is_shared: payload.isShared === true,
  });
}

function buildTeacherResourceSnapshot(resource: TeacherResourceRecord): Record<string, unknown> {
  return {
    title: resource.title,
    item_type: resource.item_type,
    file_url: resource.file_url,
    tts_audio_url: resource.tts_audio_url,
    duration: resource.duration,
    review_status: resource.review_status || "draft",
    version_number: resource.version_number || 1,
    is_shared: resource.is_shared === true,
    miniAppMount: teacherResourceMountToInput(resource.miniAppMount),
  };
}

async function snapshotTeacherResourceVersionWithClient(
  client: Parameters<typeof queryWithClient>[0],
  resource: TeacherResourceRecord,
): Promise<void> {
  await queryWithClient(
    client,
    `
      insert into teacher_resource_versions (
        resource_id,
        auth_user_id,
        version_number,
        title,
        item_type,
        file_url,
        tts_audio_url,
        duration,
        review_status,
        snapshot
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, $10::jsonb)
      on conflict (resource_id, version_number) do nothing
    `,
    [
      resource.id,
      resource.auth_user_id,
      resource.version_number || 1,
      resource.title,
      resource.item_type,
      resource.file_url,
      resource.tts_audio_url,
      resource.duration || 0,
      resource.review_status || "draft",
      JSON.stringify(buildTeacherResourceSnapshot(resource)),
    ],
  );
}

export async function listTeacherResourceVersions(
  authUserId: string,
  resourceId: number,
): Promise<TeacherResourceVersionRecord[]> {
  await ensureTeacherPlanTables();

  return query<TeacherResourceVersionRecord>(
    `
      select
        id,
        resource_id,
        auth_user_id,
        version_number,
        title,
        item_type,
        file_url,
        tts_audio_url,
        duration,
        review_status,
        snapshot,
        created_at
      from teacher_resource_versions
      where auth_user_id = $1
        and resource_id = $2
      order by version_number desc, id desc
    `,
    [authUserId, resourceId],
  );
}


export async function restoreTeacherResourceVersion(
  authUserId: string,
  resourceId: number,
  versionNumber: number,
): Promise<TeacherResourceRecord | null> {
  await ensureTeacherPlanTables();

  const existing = await getTeacherResource(authUserId, resourceId);
  if (!existing) {
    return null;
  }

  const version = await queryOne<TeacherResourceVersionRecord>(
    `
      select
        id,
        resource_id,
        auth_user_id,
        version_number,
        title,
        item_type,
        file_url,
        tts_audio_url,
        duration,
        review_status,
        snapshot,
        created_at
      from teacher_resource_versions
      where auth_user_id = $1
        and resource_id = $2
        and version_number = $3
    `,
    [authUserId, resourceId, versionNumber],
  );

  if (!version) {
    return null;
  }

  const snapshot = version.snapshot || {};
  const restoredMount = snapshot.miniAppMount && typeof snapshot.miniAppMount === "object"
    ? (snapshot.miniAppMount as TeacherResourceMiniAppMountInput)
    : null;
  const restoredShared = snapshot.is_shared === true;

  const updated = await withTransaction(async (client) => {
    await snapshotTeacherResourceVersionWithClient(client, existing);

    const restored = await queryOneWithClient<TeacherResourceRecord>(
      client,
      `
        update teacher_resources
        set
          title = $3,
          item_type = $4,
          file_url = $5,
          tts_audio_url = $6,
          duration = $7,
          is_shared = $8,
          review_status = 'draft',
          reviewed_at = null,
          published_at = null,
          version_number = coalesce(version_number, 1) + 1,
          updated_at = now()
        where auth_user_id = $1
          and id = $2
        returning
          id,
          auth_user_id,
          lesson_id,
          module_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          review_status,
          version_number,
          ai_generated,
          source_model,
          source_prompt,
          source_payload,
          reviewed_at,
          published_at,
          is_shared,
          'mine'::text as access_scope,
          null::text as owner_name,
          created_at,
          updated_at
      `,
      [
        authUserId,
        resourceId,
        version.title,
        version.item_type,
        version.file_url,
        version.tts_audio_url,
        version.duration || 0,
        restoredShared,
      ],
    );

    if (!restored) {
      return null;
    }

    await queryWithClient(
      client,
      `
        update teacher_lesson_plan_items
        set
          title = $3,
          item_type = $4,
          file_url = $5,
          tts_audio_url = $6,
          duration = $7
        where auth_user_id = $1
          and teacher_resource_id = $2
      `,
      [authUserId, resourceId, restored.title, restored.item_type, restored.file_url, restored.tts_audio_url, restored.duration],
    );

    if (restored.item_type === "miniapp" && restoredMount) {
      await upsertTeacherResourceMiniAppMountWithClient(client, resourceId, restoredMount);
    } else {
      await deleteTeacherResourceMiniAppMountWithClient(client, resourceId);
    }

    return restored;
  });

  if (!updated) {
    return null;
  }

  return getTeacherResource(authUserId, resourceId);
}


export async function updateTeacherResourceReviewStatus(
  authUserId: string,
  resourceId: number,
  status: TeacherResourceReviewStatus,
): Promise<TeacherResourceRecord | null> {
  await ensureTeacherPlanTables();

  if (!["draft", "reviewed", "published"].includes(status)) {
    throw new Error("资源状态无效");
  }

  const resource = await queryOne<TeacherResourceRecord>(
    `
      update teacher_resources
      set
        review_status = $3::varchar,
        reviewed_at = case when $3::varchar in ('reviewed', 'published') then coalesce(reviewed_at, now()) else null end,
        published_at = case when $3::varchar = 'published' then coalesce(published_at, now()) else null end,
        updated_at = now()
      where auth_user_id = $1
        and id = $2
      returning
        id,
        auth_user_id,
        lesson_id,
        module_id,
        title,
        item_type,
        file_url,
        tts_audio_url,
        duration,
        review_status,
        version_number,
        ai_generated,
        source_model,
        source_prompt,
        source_payload,
        reviewed_at,
        published_at,
        is_shared,
        'mine'::text as access_scope,
        null::text as owner_name,
        created_at,
        updated_at
    `,
    [authUserId, resourceId, status],
  );

  return attachMiniAppMountToTeacherResource(resource);
}

export interface UpdateTeacherResourceInput {
  title?: string;
  moduleId?: number;
  itemType?: string;
  fileUrl?: string | null;
  ttsAudioUrl?: string | null;
  duration?: number;
  isShared?: boolean;
  miniAppMount?: TeacherResourceMiniAppMountInput | null;
}

export async function updateTeacherResource(
  authUserId: string,
  resourceId: number,
  payload: UpdateTeacherResourceInput,
): Promise<TeacherResourceRecord | null> {
  await ensureTeacherPlanTables();

  const existing = await getTeacherResource(authUserId, resourceId);
  if (!existing) {
    return null;
  }

  const nextModuleId =
    Number.isInteger(payload.moduleId) && Number(payload.moduleId) > 0
      ? Number(payload.moduleId)
      : existing.module_id;
  const nextTitle =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : existing.title;
  const nextItemType =
    typeof payload.itemType === "string" && payload.itemType.trim()
      ? payload.itemType.trim()
      : existing.item_type;
  const nextDuration =
    typeof payload.duration === "number" &&
    Number.isFinite(payload.duration) &&
    payload.duration >= 0
      ? Math.round(payload.duration)
      : existing.duration;
  const nextFileUrl =
    payload.fileUrl !== undefined ? payload.fileUrl || null : existing.file_url;
  const nextTtsAudioUrl =
    payload.ttsAudioUrl !== undefined
      ? payload.ttsAudioUrl || null
      : existing.tts_audio_url;
  const nextIsShared =
    typeof payload.isShared === "boolean"
      ? payload.isShared
      : existing.is_shared === true;
  const nextMiniAppMount =
    payload.miniAppMount === undefined
      ? teacherResourceMountToInput(existing.miniAppMount)
      : payload.miniAppMount;

  if (nextItemType === "miniapp" && !nextMiniAppMount) {
    throw new Error("请选择要挂载的小游戏");
  }

  const contentChanged =
    nextModuleId !== existing.module_id ||
    nextTitle !== existing.title ||
    nextItemType !== existing.item_type ||
    nextDuration !== existing.duration ||
    nextFileUrl !== existing.file_url ||
    nextTtsAudioUrl !== existing.tts_audio_url ||
    JSON.stringify(nextMiniAppMount || null) !==
      JSON.stringify(teacherResourceMountToInput(existing.miniAppMount) || null);

  if (!contentChanged && nextIsShared === (existing.is_shared === true)) {
    return existing;
  }

  if (!contentChanged) {
    const sharedOnlyUpdated = await queryOne<TeacherResourceRecord>(
      `
        update teacher_resources
        set
          is_shared = $3,
          updated_at = now()
        where auth_user_id = $1
          and id = $2
        returning
          id,
          auth_user_id,
          lesson_id,
          module_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          review_status,
          version_number,
          ai_generated,
          source_model,
          source_prompt,
          source_payload,
          reviewed_at,
          published_at,
          is_shared,
          'mine'::text as access_scope,
          null::text as owner_name,
          created_at,
          updated_at
      `,
      [authUserId, resourceId, nextIsShared],
    );

    return attachMiniAppMountToTeacherResource(sharedOnlyUpdated);
  }

  const updated = await withTransaction(async (client) => {
    await snapshotTeacherResourceVersionWithClient(client, existing);

    const updatedResource = await queryOneWithClient<TeacherResourceRecord>(
      client,
      `
        update teacher_resources
        set
          module_id = $3,
          title = $4,
          item_type = $5,
          file_url = $6,
          tts_audio_url = $7,
          duration = $8,
          is_shared = $9,
          version_number = coalesce(version_number, 1) + 1,
          review_status = 'draft',
          reviewed_at = null,
          published_at = null,
          updated_at = now()
        where auth_user_id = $1
          and id = $2
        returning
          id,
          auth_user_id,
          lesson_id,
          module_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          review_status,
          version_number,
          ai_generated,
          source_model,
          source_prompt,
          source_payload,
          reviewed_at,
          published_at,
          is_shared,
          'mine'::text as access_scope,
          null::text as owner_name,
          created_at,
          updated_at
      `,
      [
        authUserId,
        resourceId,
        nextModuleId,
        nextTitle,
        nextItemType,
        nextFileUrl,
        nextTtsAudioUrl,
        nextDuration,
        nextIsShared,
      ],
    );

    if (!updatedResource) {
      return null;
    }

    await queryWithClient(
      client,
      `
        update teacher_lesson_plan_items
        set
          module_id = $3,
          title = $4,
          item_type = $5,
          file_url = $6,
          tts_audio_url = $7,
          duration = $8
        where auth_user_id = $1
          and teacher_resource_id = $2
      `,
      [
        authUserId,
        resourceId,
        updatedResource.module_id,
        updatedResource.title,
        updatedResource.item_type,
        updatedResource.file_url,
        updatedResource.tts_audio_url,
        updatedResource.duration,
      ],
    );

    if (updatedResource.item_type === "miniapp" && nextMiniAppMount) {
      await upsertTeacherResourceMiniAppMountWithClient(
        client,
        resourceId,
        nextMiniAppMount,
      );
    } else {
      await deleteTeacherResourceMiniAppMountWithClient(client, resourceId);
    }

    return updatedResource;
  });

  if (!updated) {
    return null;
  }

  return getTeacherResource(authUserId, resourceId);
}

export async function listTeacherLessonPlanItems(
  authUserId: string,
  lessonId: number,
): Promise<TeacherLessonPlanItemRecord[]> {
  await ensureTeacherPlanTables();

  return query<TeacherLessonPlanItemRecord>(
    `
      select
        id,
        auth_user_id,
        lesson_id,
        module_id,
        source_type,
        standard_item_id,
        teacher_resource_id,
        title,
        item_type,
        file_url,
        tts_audio_url,
        duration,
        sort_order,
        is_primary,
        created_at
      from teacher_lesson_plan_items
      where auth_user_id = $1
        and lesson_id = $2
        and (
          source_type <> 'teacher_resource'
          or exists (
            select 1
            from teacher_resources tr
            where tr.id = teacher_lesson_plan_items.teacher_resource_id
              and tr.auth_user_id = teacher_lesson_plan_items.auth_user_id
              and tr.review_status = 'published'
          )
        )
      order by sort_order asc, id asc
    `,
    [authUserId, lessonId],
  );
}

export async function replaceTeacherLessonPlanItems(
  authUserId: string,
  lessonId: number,
  items: TeacherLessonPlanItemInput[],
): Promise<TeacherLessonPlanItemRecord[]> {
  await ensureTeacherPlanTables();

  await query(
    `
      delete from teacher_lesson_plan_items
      where auth_user_id = $1
        and lesson_id = $2
    `,
    [authUserId, lessonId],
  );

  const created: TeacherLessonPlanItemRecord[] = [];

  for (const item of items) {
    const record = await queryOne<TeacherLessonPlanItemRecord>(
      `
        insert into teacher_lesson_plan_items (
          auth_user_id,
          lesson_id,
          module_id,
          source_type,
          standard_item_id,
          teacher_resource_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          sort_order,
          is_primary
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning
          id,
          auth_user_id,
          lesson_id,
          module_id,
          source_type,
          standard_item_id,
          teacher_resource_id,
          title,
          item_type,
          file_url,
          tts_audio_url,
          duration,
          sort_order,
          is_primary,
          created_at
      `,
      [
        authUserId,
        lessonId,
        item.module_id,
        item.source_type,
        item.standard_item_id || null,
        item.teacher_resource_id || null,
        item.title,
        item.item_type,
        item.file_url || null,
        item.tts_audio_url || null,
        item.duration || 0,
        item.sort_order,
        Boolean(item.is_primary),
      ],
    );

    if (record) {
      created.push(record);
    }
  }

  return created;
}

export async function listTeacherStudentAssignments(
  authUserId: string,
  lessonId: number,
  moduleId?: number | null,
): Promise<TeacherStudentAssignmentRecord[]> {
  await ensureTeacherPlanTables();

  const params: Array<string | number> = [authUserId, lessonId];
  let sql = `
    select
      id,
      auth_user_id,
      lesson_id,
      module_id,
      title,
      description,
      due_at,
      is_required,
      sort_order,
      created_at,
      updated_at
    from teacher_student_assignments
    where auth_user_id = $1
      and lesson_id = $2
  `;

  if (moduleId) {
    params.push(moduleId);
    sql += ` and module_id = $${params.length}`;
  }

  sql += " order by module_id asc, sort_order asc, id asc";

  return query<TeacherStudentAssignmentRecord>(sql, params);
}

export async function replaceTeacherStudentAssignments(
  authUserId: string,
  lessonId: number,
  assignments: TeacherStudentAssignmentInput[],
): Promise<TeacherStudentAssignmentRecord[]> {
  await ensureTeacherPlanTables();

  const created: TeacherStudentAssignmentRecord[] = [];
  const retainedIds: number[] = [];

  for (const assignment of assignments) {
    const record = assignment.id
      ? await queryOne<TeacherStudentAssignmentRecord>(
          `
            update teacher_student_assignments
            set
              module_id = $3,
              title = $4,
              description = $5,
              due_at = $6,
              is_required = $7,
              sort_order = $8,
              updated_at = now()
            where auth_user_id = $1
              and lesson_id = $2
              and id = $9
            returning
              id,
              auth_user_id,
              lesson_id,
              module_id,
              title,
              description,
              due_at,
              is_required,
              sort_order,
              created_at,
              updated_at
          `,
          [
            authUserId,
            lessonId,
            assignment.module_id,
            assignment.title,
            assignment.description,
            assignment.due_at ?? null,
            assignment.is_required ?? true,
            assignment.sort_order,
            assignment.id,
          ],
        )
      : await queryOne<TeacherStudentAssignmentRecord>(
          `
            insert into teacher_student_assignments (
              auth_user_id,
              lesson_id,
              module_id,
              title,
              description,
              due_at,
              is_required,
              sort_order,
              updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, now())
            returning
              id,
              auth_user_id,
              lesson_id,
              module_id,
              title,
              description,
              due_at,
              is_required,
              sort_order,
              created_at,
              updated_at
          `,
          [
            authUserId,
            lessonId,
            assignment.module_id,
            assignment.title,
            assignment.description,
            assignment.due_at ?? null,
            assignment.is_required ?? true,
            assignment.sort_order,
          ],
        );

    if (record) {
      retainedIds.push(record.id);
      created.push(record);
    }
  }

  if (retainedIds.length > 0) {
    await query(
      `
        delete from teacher_student_assignments
        where auth_user_id = $1
          and lesson_id = $2
          and id <> all($3::int[])
      `,
      [authUserId, lessonId, retainedIds],
    );
  } else {
    await query(
      `
        delete from teacher_student_assignments
        where auth_user_id = $1
          and lesson_id = $2
      `,
      [authUserId, lessonId],
    );
  }

  return created;
}

export async function listTeacherLessonPlanTemplates(
  authUserId: string,
): Promise<TeacherLessonPlanTemplateRecord[]> {
  await ensureTeacherPlanTables();

  return query<TeacherLessonPlanTemplateRecord>(
    `
      select
        id,
        auth_user_id,
        title,
        source_lesson_id,
        plan_items,
        student_assignments,
        assignment_settings,
        created_at,
        updated_at
      from teacher_lesson_plan_templates
      where auth_user_id = $1
      order by updated_at desc, id desc
    `,
    [authUserId],
  );
}

export async function createTeacherLessonPlanTemplate(
  authUserId: string,
  input: CreateTeacherLessonPlanTemplateInput,
): Promise<TeacherLessonPlanTemplateRecord> {
  await ensureTeacherPlanTables();

  const template = await queryOne<TeacherLessonPlanTemplateRecord>(
    `
      insert into teacher_lesson_plan_templates (
        auth_user_id,
        title,
        source_lesson_id,
        plan_items,
        student_assignments,
        assignment_settings,
        updated_at
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, now())
      returning
        id,
        auth_user_id,
        title,
        source_lesson_id,
        plan_items,
        student_assignments,
        assignment_settings,
        created_at,
        updated_at
    `,
    [
      authUserId,
      input.title,
      input.sourceLessonId,
      JSON.stringify(input.planItems),
      JSON.stringify(input.studentAssignments),
      JSON.stringify(
        normalizeTeacherLessonAssignmentSettingsMap(input.assignmentSettings),
      ),
    ],
  );

  if (!template) {
    throw new Error("Failed to create teacher lesson plan template");
  }

  return template;
}
