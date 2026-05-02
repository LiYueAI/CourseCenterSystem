import 'server-only';

import { query, queryOne, withTransaction, queryWithClient, queryOneWithClient } from '@/lib/db';
import type {
  MiniAppLaunchMode,
  MiniAppMountOwnerKind,
  MiniAppMountSummary,
  MiniAppSourceType,
  MiniAppStatus,
  MiniAppSummary,
  MiniAppVersionSummary,
} from '@/lib/miniapps.types';

type MiniAppRow = {
  id: number;
  appKey: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  category: string | null;
  vendorName: string | null;
  sourceType: MiniAppSourceType;
  status: MiniAppStatus;
  publishedVersionId: number | null;
  createdAt: string;
  updatedAt: string;
};

type MiniAppVersionRow = {
  id: number;
  miniAppId: number;
  version: string;
  entryUrl: string;
  sourceType: MiniAppSourceType;
  manifest: Record<string, unknown> | null;
  releaseNotes: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

type MiniAppMountRow = {
  id: number;
  ownerKind: MiniAppMountOwnerKind;
  ownerId: number;
  miniAppId: number;
  miniAppVersionId: number | null;
  launchMode: MiniAppLaunchMode;
  mountStatus: 'active' | 'disabled';
  titleOverride: string | null;
  coverUrl: string | null;
  aspectRatio: string | null;
  params: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  appKey: string;
  appName: string;
  appDescription: string | null;
  appIconUrl: string | null;
  appCoverUrl: string | null;
  appCategory: string | null;
  appVendorName: string | null;
  appSourceType: MiniAppSourceType;
  appStatus: MiniAppStatus;
  appPublishedVersionId: number | null;
  versionEntryUrl: string | null;
  versionSourceType: MiniAppSourceType | null;
  versionManifest: Record<string, unknown> | null;
  versionReleaseNotes: string | null;
  versionIsPublished: boolean | null;
  versionVersion: string | null;
  versionCreatedAt: string | null;
  versionUpdatedAt: string | null;
};

type MiniAppIdentityRow = {
  id: number;
  appKey: string;
};

let initialized = false;

function normalizeMiniAppKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapMiniAppVersion(row: MiniAppVersionRow): MiniAppVersionSummary {
  return {
    id: row.id,
    miniAppId: row.miniAppId,
    version: row.version,
    entryUrl: row.entryUrl,
    sourceType: row.sourceType,
    manifest: normalizeJsonObject(row.manifest),
    releaseNotes: row.releaseNotes || '',
    isPublished: row.isPublished,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMiniApp(row: MiniAppRow, versions: MiniAppVersionSummary[]): MiniAppSummary {
  return {
    id: row.id,
    appKey: row.appKey,
    name: row.name,
    description: row.description || '',
    iconUrl: row.iconUrl,
    coverUrl: row.coverUrl,
    category: row.category,
    vendorName: row.vendorName,
    sourceType: row.sourceType,
    status: row.status,
    publishedVersionId: row.publishedVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    versions,
  };
}

function mapMiniAppMount(row: MiniAppMountRow): MiniAppMountSummary {
  return {
    id: row.id,
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    miniAppId: row.miniAppId,
    miniAppVersionId: row.miniAppVersionId,
    launchMode: row.launchMode,
    mountStatus: row.mountStatus,
    titleOverride: row.titleOverride,
    coverUrl: row.coverUrl,
    aspectRatio: row.aspectRatio,
    params: normalizeJsonObject(row.params),
    miniApp: {
      id: row.miniAppId,
      appKey: row.appKey,
      name: row.appName,
      description: row.appDescription || '',
      iconUrl: row.appIconUrl,
      coverUrl: row.appCoverUrl,
      category: row.appCategory,
      vendorName: row.appVendorName,
      sourceType: row.appSourceType,
      status: row.appStatus,
      publishedVersionId: row.appPublishedVersionId,
    },
    version:
      row.miniAppVersionId &&
      row.versionVersion &&
      row.versionEntryUrl &&
      row.versionSourceType &&
      row.versionCreatedAt &&
      row.versionUpdatedAt
        ? {
            id: row.miniAppVersionId,
            miniAppId: row.miniAppId,
            version: row.versionVersion,
            entryUrl: row.versionEntryUrl,
            sourceType: row.versionSourceType,
            manifest: normalizeJsonObject(row.versionManifest),
            releaseNotes: row.versionReleaseNotes || '',
            isPublished: row.versionIsPublished === true,
            createdAt: row.versionCreatedAt,
            updatedAt: row.versionUpdatedAt,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function ensureMiniAppTables() {
  if (initialized) {
    return;
  }

  await query(`
    create table if not exists mini_apps (
      id serial primary key,
      app_key text not null unique,
      name text not null,
      description text not null default '',
      icon_url text,
      cover_url text,
      category text,
      vendor_name text,
      source_type varchar(32) not null default 'local',
      status varchar(32) not null default 'draft',
      published_version_id integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists mini_app_versions (
      id serial primary key,
      mini_app_id integer not null references mini_apps(id) on delete cascade,
      version text not null,
      entry_url text not null,
      source_type varchar(32) not null default 'local',
      manifest jsonb not null default '{}'::jsonb,
      release_notes text not null default '',
      is_published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (mini_app_id, version)
    );

    create index if not exists idx_mini_app_versions_app
      on mini_app_versions (mini_app_id, created_at desc, id desc);

    create table if not exists content_miniapp_mounts (
      id serial primary key,
      owner_kind varchar(64) not null,
      owner_id integer not null,
      mini_app_id integer not null references mini_apps(id) on delete cascade,
      mini_app_version_id integer references mini_app_versions(id) on delete set null,
      launch_mode varchar(32) not null default 'iframe',
      mount_status varchar(32) not null default 'active',
      title_override text,
      cover_url text,
      aspect_ratio text,
      params jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (owner_kind, owner_id)
    );

    create index if not exists idx_content_miniapp_mounts_owner
      on content_miniapp_mounts (owner_kind, owner_id);

    create table if not exists mini_app_events (
      id bigserial primary key,
      mini_app_id integer not null references mini_apps(id) on delete cascade,
      mini_app_version_id integer references mini_app_versions(id) on delete set null,
      owner_kind varchar(64),
      owner_id integer,
      user_id varchar(255),
      lesson_id integer,
      event_type varchar(64) not null,
      event_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_mini_app_events_app
      on mini_app_events (mini_app_id, created_at desc);
  `);

  initialized = true;
}

export async function listMiniApps(): Promise<MiniAppSummary[]> {
  await ensureMiniAppTables();

  const [apps, versions] = await Promise.all([
    query<MiniAppRow>(
      `
        select
          id,
          app_key as "appKey",
          name,
          description,
          icon_url as "iconUrl",
          cover_url as "coverUrl",
          category,
          vendor_name as "vendorName",
          source_type as "sourceType",
          status,
          published_version_id as "publishedVersionId",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from mini_apps
        order by updated_at desc, id desc
      `
    ),
    query<MiniAppVersionRow>(
      `
        select
          id,
          mini_app_id as "miniAppId",
          version,
          entry_url as "entryUrl",
          source_type as "sourceType",
          manifest,
          release_notes as "releaseNotes",
          is_published as "isPublished",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from mini_app_versions
        order by created_at desc, id desc
      `
    ),
  ]);

  const versionsByAppId = new Map<number, MiniAppVersionSummary[]>();
  for (const version of versions) {
    const mapped = mapMiniAppVersion(version);
    const existing = versionsByAppId.get(version.miniAppId) || [];
    existing.push(mapped);
    versionsByAppId.set(version.miniAppId, existing);
  }

  return apps.map((app) => mapMiniApp(app, versionsByAppId.get(app.id) || []));
}

export async function createMiniApp(input: {
  appKey: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  coverUrl?: string | null;
  category?: string | null;
  vendorName?: string | null;
  sourceType?: MiniAppSourceType;
  status?: MiniAppStatus;
}): Promise<MiniAppSummary> {
  await ensureMiniAppTables();

  const appKey = normalizeMiniAppKey(input.appKey);
  if (!/^[a-z0-9-]{3,64}$/.test(appKey)) {
    throw new Error('小游戏标识只能包含小写字母、数字和中划线，长度 3-64');
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error('小游戏名称不能为空');
  }

  const created = await queryOne<MiniAppRow>(
    `
      insert into mini_apps (
        app_key,
        name,
        description,
        icon_url,
        cover_url,
        category,
        vendor_name,
        source_type,
        status,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      returning
        id,
        app_key as "appKey",
        name,
        description,
        icon_url as "iconUrl",
        cover_url as "coverUrl",
        category,
        vendor_name as "vendorName",
        source_type as "sourceType",
        status,
        published_version_id as "publishedVersionId",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      appKey,
      name,
      input.description?.trim() || '',
      normalizeUrl(input.iconUrl),
      normalizeUrl(input.coverUrl),
      normalizeText(input.category),
      normalizeText(input.vendorName),
      input.sourceType || 'local',
      input.status || 'draft',
    ]
  );

  if (!created) {
    throw new Error('创建小游戏失败');
  }

  return mapMiniApp(created, []);
}

export async function updateMiniApp(
  appId: number,
  input: Partial<{
    name: string;
    description: string | null;
    iconUrl: string | null;
    coverUrl: string | null;
    category: string | null;
    vendorName: string | null;
    sourceType: MiniAppSourceType;
    status: MiniAppStatus;
  }>
): Promise<MiniAppSummary | null> {
  await ensureMiniAppTables();

  const existing = await queryOne<MiniAppRow>(
    `
      select
        id,
        app_key as "appKey",
        name,
        description,
        icon_url as "iconUrl",
        cover_url as "coverUrl",
        category,
        vendor_name as "vendorName",
        source_type as "sourceType",
        status,
        published_version_id as "publishedVersionId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from mini_apps
      where id = $1
    `,
    [appId]
  );

  if (!existing) {
    return null;
  }

  const updated = await queryOne<MiniAppRow>(
    `
      update mini_apps
      set
        name = $2,
        description = $3,
        icon_url = $4,
        cover_url = $5,
        category = $6,
        vendor_name = $7,
        source_type = $8,
        status = $9,
        updated_at = now()
      where id = $1
      returning
        id,
        app_key as "appKey",
        name,
        description,
        icon_url as "iconUrl",
        cover_url as "coverUrl",
        category,
        vendor_name as "vendorName",
        source_type as "sourceType",
        status,
        published_version_id as "publishedVersionId",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      appId,
      input.name?.trim() || existing.name,
      input.description !== undefined ? input.description?.trim() || '' : existing.description || '',
      input.iconUrl !== undefined ? normalizeUrl(input.iconUrl) : existing.iconUrl,
      input.coverUrl !== undefined ? normalizeUrl(input.coverUrl) : existing.coverUrl,
      input.category !== undefined ? normalizeText(input.category) : existing.category,
      input.vendorName !== undefined ? normalizeText(input.vendorName) : existing.vendorName,
      input.sourceType || existing.sourceType,
      input.status || existing.status,
    ]
  );

  if (!updated) {
    return null;
  }

  const versions = await listMiniAppVersions(appId);
  return mapMiniApp(updated, versions);
}

export async function listMiniAppVersions(appId: number): Promise<MiniAppVersionSummary[]> {
  await ensureMiniAppTables();

  const versions = await query<MiniAppVersionRow>(
    `
      select
        id,
        mini_app_id as "miniAppId",
        version,
        entry_url as "entryUrl",
        source_type as "sourceType",
        manifest,
        release_notes as "releaseNotes",
        is_published as "isPublished",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from mini_app_versions
      where mini_app_id = $1
      order by created_at desc, id desc
    `,
    [appId]
  );

  return versions.map(mapMiniAppVersion);
}

export async function getMiniAppIdentity(appId: number): Promise<MiniAppIdentityRow | null> {
  await ensureMiniAppTables();

  return queryOne<MiniAppIdentityRow>(
    `
      select
        id,
        app_key as "appKey"
      from mini_apps
      where id = $1
    `,
    [appId]
  );
}

export async function deleteMiniAppById(
  appId: number,
): Promise<MiniAppIdentityRow | null> {
  await ensureMiniAppTables();

  return withTransaction(async (client) => {
    const identity = await queryOneWithClient<MiniAppIdentityRow>(
      client,
      `
        select
          id,
          app_key as "appKey"
        from mini_apps
        where id = $1
        limit 1
      `,
      [appId],
    );

    if (!identity) {
      return null;
    }

    const mountCount = await queryOneWithClient<{ count: string }>(
      client,
      `
        select count(*)::text as count
        from content_miniapp_mounts
        where mini_app_id = $1
      `,
      [appId],
    );

    if (Number(mountCount?.count || 0) > 0) {
      throw new Error('Mini app is mounted');
    }

    await queryWithClient(
      client,
      `
        delete from mini_apps
        where id = $1
      `,
      [appId],
    );

    return identity;
  });
}

export async function getMiniAppVersion(versionId: number): Promise<MiniAppVersionSummary | null> {
  await ensureMiniAppTables();

  const version = await queryOne<MiniAppVersionRow>(
    `
      select
        id,
        mini_app_id as "miniAppId",
        version,
        entry_url as "entryUrl",
        source_type as "sourceType",
        manifest,
        release_notes as "releaseNotes",
        is_published as "isPublished",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from mini_app_versions
      where id = $1
    `,
    [versionId]
  );

  return version ? mapMiniAppVersion(version) : null;
}

export async function createMiniAppVersion(input: {
  miniAppId: number;
  version: string;
  entryUrl: string;
  sourceType?: MiniAppSourceType;
  manifest?: Record<string, unknown>;
  releaseNotes?: string | null;
  publish?: boolean;
}): Promise<MiniAppVersionSummary> {
  await ensureMiniAppTables();

  const version = input.version.trim();
  const entryUrl = input.entryUrl.trim();
  if (!version) {
    throw new Error('版本号不能为空');
  }
  if (!entryUrl) {
    throw new Error('入口地址不能为空');
  }

  return withTransaction(async (client) => {
    const created = await queryOneWithClient<MiniAppVersionRow>(
      client,
      `
        insert into mini_app_versions (
          mini_app_id,
          version,
          entry_url,
          source_type,
          manifest,
          release_notes,
          is_published,
          updated_at
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, false, now())
        returning
          id,
          mini_app_id as "miniAppId",
          version,
          entry_url as "entryUrl",
          source_type as "sourceType",
          manifest,
          release_notes as "releaseNotes",
          is_published as "isPublished",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `,
      [
        input.miniAppId,
        version,
        entryUrl,
        input.sourceType || 'local',
        JSON.stringify(normalizeJsonObject(input.manifest)),
        input.releaseNotes?.trim() || '',
      ]
    );

    if (!created) {
      throw new Error('创建小游戏版本失败');
    }

    if (input.publish) {
      await publishMiniAppVersionWithClient(client, input.miniAppId, created.id);
      created.isPublished = true;
    }

    return mapMiniAppVersion(created);
  });
}

async function publishMiniAppVersionWithClient(
  client: Parameters<typeof queryWithClient>[0],
  miniAppId: number,
  versionId: number
) {
  const version = await queryOneWithClient<{ id: number }>(
    client,
    `
      select id
      from mini_app_versions
      where id = $1
        and mini_app_id = $2
    `,
    [versionId, miniAppId]
  );

  if (!version) {
    throw new Error('小游戏版本不存在');
  }

  await queryWithClient(
    client,
    `
      update mini_app_versions
      set
        is_published = case when id = $2 then true else false end,
        updated_at = now()
      where mini_app_id = $1
    `,
    [miniAppId, versionId]
  );

  await queryWithClient(
    client,
    `
      update mini_apps
      set
        published_version_id = $2,
        status = case when status = 'disabled' then status else 'published' end,
        updated_at = now()
      where id = $1
    `,
    [miniAppId, versionId]
  );
}

export async function publishMiniAppVersion(input: {
  versionId: number;
  miniAppId?: number | null;
}): Promise<void> {
  await ensureMiniAppTables();

  await withTransaction(async (client) => {
    const version = await queryOneWithClient<{ id: number; miniAppId: number }>(
      client,
      `
        select
          id,
          mini_app_id as "miniAppId"
        from mini_app_versions
        where id = $1
          and ($2::int is null or mini_app_id = $2)
      `,
      [input.versionId, input.miniAppId ?? null]
    );

    if (!version) {
      throw new Error('小游戏版本不存在');
    }

    await publishMiniAppVersionWithClient(client, version.miniAppId, version.id);
  });
}

export async function updateMiniAppVersion(
  versionId: number,
  input: Partial<{
    version: string;
    entryUrl: string;
    sourceType: MiniAppSourceType;
    manifest: Record<string, unknown>;
    releaseNotes: string | null;
    publish: boolean;
  }>
): Promise<MiniAppVersionSummary | null> {
  await ensureMiniAppTables();

  return withTransaction(async (client) => {
    const existing = await queryOneWithClient<MiniAppVersionRow>(
      client,
      `
        select
          id,
          mini_app_id as "miniAppId",
          version,
          entry_url as "entryUrl",
          source_type as "sourceType",
          manifest,
          release_notes as "releaseNotes",
          is_published as "isPublished",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from mini_app_versions
        where id = $1
      `,
      [versionId]
    );

    if (!existing) {
      return null;
    }

    const nextVersion = input.version !== undefined ? input.version.trim() : existing.version;
    if (!nextVersion) {
      throw new Error('版本号不能为空');
    }

    const updated = await queryOneWithClient<MiniAppVersionRow>(
      client,
      `
        update mini_app_versions
        set
          version = $2,
          entry_url = $3,
          source_type = $4,
          manifest = $5::jsonb,
          release_notes = $6,
          updated_at = now()
        where id = $1
        returning
          id,
          mini_app_id as "miniAppId",
          version,
          entry_url as "entryUrl",
          source_type as "sourceType",
          manifest,
          release_notes as "releaseNotes",
          is_published as "isPublished",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `,
      [
        versionId,
        nextVersion,
        input.entryUrl?.trim() || existing.entryUrl,
        input.sourceType || existing.sourceType,
        JSON.stringify(
          input.manifest !== undefined ? normalizeJsonObject(input.manifest) : normalizeJsonObject(existing.manifest)
        ),
        input.releaseNotes !== undefined ? input.releaseNotes?.trim() || '' : existing.releaseNotes || '',
      ]
    );

    if (!updated) {
      return null;
    }

    if (input.publish) {
      await publishMiniAppVersionWithClient(client, updated.miniAppId, updated.id);
      updated.isPublished = true;
    }

    return mapMiniAppVersion(updated);
  });
}

export async function upsertMiniAppMount(input: {
  ownerKind: MiniAppMountOwnerKind;
  ownerId: number;
  miniAppId: number;
  miniAppVersionId?: number | null;
  launchMode?: MiniAppLaunchMode;
  mountStatus?: 'active' | 'disabled';
  titleOverride?: string | null;
  coverUrl?: string | null;
  aspectRatio?: string | null;
  params?: Record<string, unknown>;
}): Promise<MiniAppMountSummary> {
  await ensureMiniAppTables();

  return withTransaction(async (client) => {
    const app = await queryOneWithClient<{ publishedVersionId: number | null }>(
      client,
      `
        select published_version_id as "publishedVersionId"
        from mini_apps
        where id = $1
      `,
      [input.miniAppId]
    );

    if (!app) {
      throw new Error('小游戏不存在');
    }

    const resolvedVersionId = input.miniAppVersionId ?? app.publishedVersionId ?? null;
    if (!resolvedVersionId) {
      throw new Error('请先发布至少一个小游戏版本，或显式选择版本');
    }

    const upserted = await queryOneWithClient<{ id: number }>(
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
        returning id
      `,
      [
        input.ownerKind,
        input.ownerId,
        input.miniAppId,
        resolvedVersionId,
        input.launchMode || 'iframe',
        input.mountStatus || 'active',
        normalizeText(input.titleOverride),
        normalizeUrl(input.coverUrl),
        normalizeText(input.aspectRatio),
        JSON.stringify(normalizeJsonObject(input.params)),
      ]
    );

    if (!upserted) {
      throw new Error('保存小游戏挂载失败');
    }

    const mount = await getMiniAppMountWithClient(client, input.ownerKind, input.ownerId);
    if (!mount) {
      throw new Error('读取小游戏挂载失败');
    }

    return mount;
  });
}

export async function deleteMiniAppMount(
  ownerKind: MiniAppMountOwnerKind,
  ownerId: number
): Promise<void> {
  await ensureMiniAppTables();
  await query(
    `
      delete from content_miniapp_mounts
      where owner_kind = $1
        and owner_id = $2
    `,
    [ownerKind, ownerId]
  );
}

export async function listMiniAppMounts(
  ownerKind: MiniAppMountOwnerKind,
  ownerIds: number[]
): Promise<MiniAppMountSummary[]> {
  await ensureMiniAppTables();

  const normalizedOwnerIds = Array.from(
    new Set(ownerIds.filter((ownerId) => Number.isInteger(ownerId) && ownerId > 0))
  );
  if (normalizedOwnerIds.length === 0) {
    return [];
  }

  const rows = await query<MiniAppMountRow>(
    `
      select
        mounts.id,
        mounts.owner_kind as "ownerKind",
        mounts.owner_id as "ownerId",
        mounts.mini_app_id as "miniAppId",
        mounts.mini_app_version_id as "miniAppVersionId",
        mounts.launch_mode as "launchMode",
        mounts.mount_status as "mountStatus",
        mounts.title_override as "titleOverride",
        mounts.cover_url as "coverUrl",
        mounts.aspect_ratio as "aspectRatio",
        mounts.params,
        mounts.created_at as "createdAt",
        mounts.updated_at as "updatedAt",
        apps.app_key as "appKey",
        apps.name as "appName",
        apps.description as "appDescription",
        apps.icon_url as "appIconUrl",
        apps.cover_url as "appCoverUrl",
        apps.category as "appCategory",
        apps.vendor_name as "appVendorName",
        apps.source_type as "appSourceType",
        apps.status as "appStatus",
        apps.published_version_id as "appPublishedVersionId",
        versions.entry_url as "versionEntryUrl",
        versions.source_type as "versionSourceType",
        versions.manifest as "versionManifest",
        versions.release_notes as "versionReleaseNotes",
        versions.is_published as "versionIsPublished",
        versions.version as "versionVersion",
        versions.created_at as "versionCreatedAt",
        versions.updated_at as "versionUpdatedAt"
      from content_miniapp_mounts mounts
      join mini_apps apps
        on apps.id = mounts.mini_app_id
      left join mini_app_versions versions
        on versions.id = mounts.mini_app_version_id
      where mounts.owner_kind = $1
        and mounts.owner_id = any($2::int[])
      order by mounts.owner_id asc, mounts.id asc
    `,
    [ownerKind, normalizedOwnerIds]
  );

  return rows.map(mapMiniAppMount);
}

async function getMiniAppMountWithClient(
  client: Parameters<typeof queryWithClient>[0],
  ownerKind: MiniAppMountOwnerKind,
  ownerId: number
): Promise<MiniAppMountSummary | null> {
  const rows = await queryWithClient<MiniAppMountRow>(
    client,
    `
      select
        mounts.id,
        mounts.owner_kind as "ownerKind",
        mounts.owner_id as "ownerId",
        mounts.mini_app_id as "miniAppId",
        mounts.mini_app_version_id as "miniAppVersionId",
        mounts.launch_mode as "launchMode",
        mounts.mount_status as "mountStatus",
        mounts.title_override as "titleOverride",
        mounts.cover_url as "coverUrl",
        mounts.aspect_ratio as "aspectRatio",
        mounts.params,
        mounts.created_at as "createdAt",
        mounts.updated_at as "updatedAt",
        apps.app_key as "appKey",
        apps.name as "appName",
        apps.description as "appDescription",
        apps.icon_url as "appIconUrl",
        apps.cover_url as "appCoverUrl",
        apps.category as "appCategory",
        apps.vendor_name as "appVendorName",
        apps.source_type as "appSourceType",
        apps.status as "appStatus",
        apps.published_version_id as "appPublishedVersionId",
        versions.entry_url as "versionEntryUrl",
        versions.source_type as "versionSourceType",
        versions.manifest as "versionManifest",
        versions.release_notes as "versionReleaseNotes",
        versions.is_published as "versionIsPublished",
        versions.version as "versionVersion",
        versions.created_at as "versionCreatedAt",
        versions.updated_at as "versionUpdatedAt"
      from content_miniapp_mounts mounts
      join mini_apps apps
        on apps.id = mounts.mini_app_id
      left join mini_app_versions versions
        on versions.id = mounts.mini_app_version_id
      where mounts.owner_kind = $1
        and mounts.owner_id = $2
      order by mounts.id asc
      limit 1
    `,
    [ownerKind, ownerId]
  );

  return rows[0] ? mapMiniAppMount(rows[0]) : null;
}

export async function getMiniAppMount(
  ownerKind: MiniAppMountOwnerKind,
  ownerId: number
): Promise<MiniAppMountSummary | null> {
  const mounts = await listMiniAppMounts(ownerKind, [ownerId]);
  return mounts[0] || null;
}

export async function recordMiniAppEvent(input: {
  miniAppId: number;
  miniAppVersionId?: number | null;
  ownerKind?: MiniAppMountOwnerKind | null;
  ownerId?: number | null;
  userId?: string | null;
  lessonId?: number | null;
  eventType: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> {
  await ensureMiniAppTables();

  await query(
    `
      insert into mini_app_events (
        mini_app_id,
        mini_app_version_id,
        owner_kind,
        owner_id,
        user_id,
        lesson_id,
        event_type,
        event_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.miniAppId,
      input.miniAppVersionId ?? null,
      input.ownerKind ?? null,
      input.ownerId ?? null,
      input.userId ?? null,
      input.lessonId ?? null,
      input.eventType.trim(),
      JSON.stringify(normalizeJsonObject(input.eventPayload)),
    ]
  );
}
