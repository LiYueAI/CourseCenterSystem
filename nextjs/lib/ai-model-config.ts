import 'server-only';

import { query, queryOne } from '@/lib/db';

export interface AiModelConfigRecord {
  id: number;
  auth_user_id: string;
  provider_name: string;
  base_url: string;
  api_key: string;
  model: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SafeAiModelConfig {
  id: number;
  providerName: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string;
  updatedAt?: string;
}

let aiModelConfigSchemaInitialized = false;

export async function ensureAiModelConfigTables() {
  if (aiModelConfigSchemaInitialized) {
    return;
  }

  await query(`
    create table if not exists ai_model_configs (
      id serial primary key,
      auth_user_id uuid not null references auth_users(id) on delete cascade,
      provider_name varchar(80) not null default 'OpenAI Compatible',
      base_url text not null,
      api_key text not null,
      model text not null,
      is_default boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_ai_model_configs_user
      on ai_model_configs (auth_user_id, is_default desc, updated_at desc);
  `);

  aiModelConfigSchemaInitialized = true;
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 12) {
    return `${trimmed.slice(0, 3)}***`;
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

export function toSafeAiModelConfig(row: AiModelConfigRecord): SafeAiModelConfig {
  return {
    id: row.id,
    providerName: row.provider_name,
    baseUrl: row.base_url,
    model: row.model,
    isDefault: row.is_default,
    hasApiKey: Boolean(row.api_key),
    apiKeyPreview: maskApiKey(row.api_key),
    updatedAt: row.updated_at,
  };
}

export async function getDefaultAiModelConfig(
  authUserId: string
): Promise<AiModelConfigRecord | null> {
  await ensureAiModelConfigTables();

  return queryOne<AiModelConfigRecord>(
    `
      select
        id,
        auth_user_id,
        provider_name,
        base_url,
        api_key,
        model,
        is_default,
        created_at,
        updated_at
      from ai_model_configs
      where auth_user_id = $1
      order by is_default desc, updated_at desc, id desc
      limit 1
    `,
    [authUserId]
  );
}

export async function upsertDefaultAiModelConfig(
  authUserId: string,
  input: {
    providerName?: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  }
): Promise<AiModelConfigRecord> {
  await ensureAiModelConfigTables();

  const providerName = input.providerName?.trim() || 'OpenAI Compatible';
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();

  if (!baseUrl) {
    throw new Error('请填写 Base URL');
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Base URL 必须以 http:// 或 https:// 开头');
  }
  if (!apiKey) {
    throw new Error('请填写 API Key');
  }
  if (!model) {
    throw new Error('请填写模型名称');
  }

  const existing = await getDefaultAiModelConfig(authUserId);

  if (existing) {
    const updated = await queryOne<AiModelConfigRecord>(
      `
        update ai_model_configs
        set
          provider_name = $2,
          base_url = $3,
          api_key = $4,
          model = $5,
          is_default = true,
          updated_at = now()
        where id = $1
        returning
          id,
          auth_user_id,
          provider_name,
          base_url,
          api_key,
          model,
          is_default,
          created_at,
          updated_at
      `,
      [existing.id, providerName, baseUrl, apiKey, model]
    );

    if (!updated) {
      throw new Error('保存模型配置失败');
    }

    return updated;
  }

  const created = await queryOne<AiModelConfigRecord>(
    `
      insert into ai_model_configs (
        auth_user_id,
        provider_name,
        base_url,
        api_key,
        model,
        is_default,
        updated_at
      )
      values ($1, $2, $3, $4, $5, true, now())
      returning
        id,
        auth_user_id,
        provider_name,
        base_url,
        api_key,
        model,
        is_default,
        created_at,
        updated_at
    `,
    [authUserId, providerName, baseUrl, apiKey, model]
  );

  if (!created) {
    throw new Error('保存模型配置失败');
  }

  return created;
}
