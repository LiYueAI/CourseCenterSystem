import 'server-only';

import { query, queryOne } from '@/lib/db';

export interface OpenMaicCourseDraftRecord {
  id: number;
  auth_user_id: string;
  openmaic_job_id: string;
  openmaic_result_id: string | null;
  title: string;
  status: 'draft' | 'imported' | 'archived';
  scenes_count: number;
  source_url: string | null;
  stage_json: unknown;
  scenes_json: unknown;
  raw_result_json: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface SafeOpenMaicCourseDraft {
  id: number;
  jobId: string;
  resultId: string | null;
  title: string;
  status: string;
  scenesCount: number;
  sourceUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
}

let schemaInitialized = false;

export async function ensureOpenMaicCourseDraftTables() {
  if (schemaInitialized) return;

  await query(`
    create table if not exists openmaic_course_drafts (
      id serial primary key,
      auth_user_id uuid not null references auth_users(id) on delete cascade,
      openmaic_job_id varchar(100) not null,
      openmaic_result_id varchar(120),
      title text not null,
      status varchar(32) not null default 'draft',
      scenes_count integer not null default 0,
      source_url text,
      stage_json jsonb not null default '{}'::jsonb,
      scenes_json jsonb not null default '[]'::jsonb,
      raw_result_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (auth_user_id, openmaic_job_id)
    );

    create index if not exists idx_openmaic_course_drafts_user
      on openmaic_course_drafts (auth_user_id, updated_at desc, id desc);
  `);

  schemaInitialized = true;
}

export function toSafeOpenMaicCourseDraft(row: OpenMaicCourseDraftRecord): SafeOpenMaicCourseDraft {
  return {
    id: row.id,
    jobId: row.openmaic_job_id,
    resultId: row.openmaic_result_id,
    title: row.title,
    status: row.status,
    scenesCount: row.scenes_count,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getTitleFromResult(result: any): string {
  return (
    result?.stage?.name ||
    result?.stage?.title ||
    result?.scenes?.[0]?.title ||
    'OpenMAIC 课件草稿'
  ).toString();
}

export async function upsertOpenMaicCourseDraft(input: {
  authUserId: string;
  jobId: string;
  result: any;
}): Promise<OpenMaicCourseDraftRecord> {
  await ensureOpenMaicCourseDraftTables();

  const result = input.result || {};
  const scenes = Array.isArray(result.scenes) ? result.scenes : [];
  const stage = result.stage && typeof result.stage === 'object' ? result.stage : {};
  const title = getTitleFromResult(result).slice(0, 300);

  const row = await queryOne<OpenMaicCourseDraftRecord>(
    `
      insert into openmaic_course_drafts (
        auth_user_id,
        openmaic_job_id,
        openmaic_result_id,
        title,
        status,
        scenes_count,
        source_url,
        stage_json,
        scenes_json,
        raw_result_json,
        updated_at
      )
      values ($1, $2, $3, $4, 'draft', $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
      on conflict (auth_user_id, openmaic_job_id)
      do update set
        openmaic_result_id = excluded.openmaic_result_id,
        title = excluded.title,
        scenes_count = excluded.scenes_count,
        source_url = excluded.source_url,
        stage_json = excluded.stage_json,
        scenes_json = excluded.scenes_json,
        raw_result_json = excluded.raw_result_json,
        updated_at = now()
      returning
        id,
        auth_user_id,
        openmaic_job_id,
        openmaic_result_id,
        title,
        status,
        scenes_count,
        source_url,
        stage_json,
        scenes_json,
        raw_result_json,
        created_at,
        updated_at
    `,
    [
      input.authUserId,
      input.jobId,
      result.id || null,
      title,
      scenes.length || result.scenesCount || 0,
      result.url || null,
      JSON.stringify(stage),
      JSON.stringify(scenes),
      JSON.stringify(result),
    ]
  );

  if (!row) {
    throw new Error('保存 OpenMAIC 课件草稿失败');
  }

  return row;
}

export async function listOpenMaicCourseDrafts(authUserId: string): Promise<OpenMaicCourseDraftRecord[]> {
  await ensureOpenMaicCourseDraftTables();

  return query<OpenMaicCourseDraftRecord>(
    `
      select
        id,
        auth_user_id,
        openmaic_job_id,
        openmaic_result_id,
        title,
        status,
        scenes_count,
        source_url,
        stage_json,
        scenes_json,
        raw_result_json,
        created_at,
        updated_at
      from openmaic_course_drafts
      where auth_user_id = $1
      order by updated_at desc, id desc
      limit 50
    `,
    [authUserId]
  );
}

export async function getOpenMaicCourseDraft(
  authUserId: string,
  draftId: number,
): Promise<OpenMaicCourseDraftRecord | null> {
  await ensureOpenMaicCourseDraftTables();

  return queryOne<OpenMaicCourseDraftRecord>(
    `
      select
        id,
        auth_user_id,
        openmaic_job_id,
        openmaic_result_id,
        title,
        status,
        scenes_count,
        source_url,
        stage_json,
        scenes_json,
        raw_result_json,
        created_at,
        updated_at
      from openmaic_course_drafts
      where auth_user_id = $1
        and id = $2
    `,
    [authUserId, draftId],
  );
}

export async function markOpenMaicCourseDraftImported(
  authUserId: string,
  draftId: number,
): Promise<void> {
  await ensureOpenMaicCourseDraftTables();

  await query(
    `
      update openmaic_course_drafts
      set status = 'imported', updated_at = now()
      where auth_user_id = $1
        and id = $2
    `,
    [authUserId, draftId],
  );
}

export async function deleteOpenMaicCourseDraft(
  authUserId: string,
  draftId: number,
): Promise<SafeOpenMaicCourseDraft | null> {
  await ensureOpenMaicCourseDraftTables();

  const row = await queryOne<OpenMaicCourseDraftRecord>(
    `
      delete from openmaic_course_drafts
      where auth_user_id = $1
        and id = $2
      returning
        id,
        auth_user_id,
        openmaic_job_id,
        openmaic_result_id,
        title,
        status,
        scenes_count,
        source_url,
        stage_json,
        scenes_json,
        raw_result_json,
        created_at,
        updated_at
    `,
    [authUserId, draftId],
  );

  return row ? toSafeOpenMaicCourseDraft(row) : null;
}
