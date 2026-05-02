#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/nextjs/.env.host}"

log() { printf '[boundary-fixture] %s\n' "$*"; }
fail() { printf '[boundary-fixture][FAIL] %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || ENV_FILE="$ROOT_DIR/.env"
[[ -f "$ENV_FILE" ]] || fail "未找到环境文件"

node <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('/opt/course-platform/nextjs/node_modules/bcryptjs');
const { Client } = require('/opt/course-platform/nextjs/node_modules/pg');

const envFile = process.env.ENV_FILE || '/opt/course-platform/nextjs/.env.host';
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const index = line.indexOf('=');
  if (index < 0) continue;
  const key = line.slice(0, index).trim();
  let value = line.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const fixtureEmail = process.env.BOUNDARY_FIXTURE_TEACHER_EMAIL || 'hardening.permission.fixture@example.com';
  const passwordHash = await bcrypt.hash(process.env.BOUNDARY_FIXTURE_TEACHER_PASSWORD || 'Teacher@2026', 10);

  await client.query('begin');
  try {
    const current = await client.query(
      `select id from auth_users where lower(email)=lower($1) and role='teacher' limit 1`,
      ['teacher@test.com'],
    );
    if (current.rowCount === 0) throw new Error('缺少 teacher@test.com 测试教师');

    let userResult = await client.query(
      `select id from auth_users where lower(email)=lower($1) limit 1`,
      [fixtureEmail],
    );

    let authUserId;
    if (userResult.rowCount === 0) {
      authUserId = uuid();
      await client.query(
        `insert into auth_users (id, email, password_hash, role, is_active)
         values ($1, $2, $3, 'teacher', true)`,
        [authUserId, fixtureEmail, passwordHash],
      );
    } else {
      authUserId = userResult.rows[0].id;
      await client.query(
        `update auth_users set role='teacher', is_active=true, password_hash=$2, updated_at=now() where id=$1`,
        [authUserId, passwordHash],
      );
    }

    await client.query(
      `insert into teachers (user_id, name, school, subject, grade_level)
       values ($1, '权限边界夹具教师', '自动化测试学校', '信息科技', '七年级')
       on conflict (user_id) do update set
         name=excluded.name,
         school=excluded.school,
         subject=excluded.subject,
         grade_level=excluded.grade_level,
         updated_at=now()`,
      [authUserId],
    );

    const resource = await client.query(
      `insert into teacher_resources (
         auth_user_id, lesson_id, module_id, title, item_type, file_url, duration,
         review_status, ai_generated, source_model, source_prompt, source_payload, updated_at
       ) values (
         $1, 1, 1, '权限边界夹具资源', 'doc', null, 60,
         'draft', true, 'fixture', 'permission-boundary-fixture',
         $2::jsonb, now()
       )
       returning id`,
      [authUserId, JSON.stringify({ fixture: true, purpose: 'permission-boundary' })],
    );

    const jobId = `permission-boundary-fixture-${authUserId}`.slice(0, 100);
    const stage = { id: 'permission-boundary-stage', name: '权限边界夹具课件' };
    const scenes = [{ id: 'scene-1', title: '夹具场景', elements: [] }];
    const raw = { stage, scenes, fixture: true };
    const draft = await client.query(
      `insert into openmaic_course_drafts (
         auth_user_id, openmaic_job_id, openmaic_result_id, title, status,
         scenes_count, source_url, stage_json, scenes_json, raw_result_json, updated_at
       ) values ($1, $2, 'permission-boundary-result', '权限边界夹具草稿', 'draft', 1, null, $3::jsonb, $4::jsonb, $5::jsonb, now())
       on conflict (auth_user_id, openmaic_job_id) do update set
         title=excluded.title,
         status='draft',
         scenes_count=1,
         stage_json=excluded.stage_json,
         scenes_json=excluded.scenes_json,
         raw_result_json=excluded.raw_result_json,
         updated_at=now()
       returning id`,
      [authUserId, jobId, JSON.stringify(stage), JSON.stringify(scenes), JSON.stringify(raw)],
    );

    await client.query('commit');
    console.log(JSON.stringify({ authUserId, fixtureEmail, resourceId: resource.rows[0].id, draftId: draft.rows[0].id }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
NODE
