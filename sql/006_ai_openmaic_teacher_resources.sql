-- ============================================
-- AI 模型、OpenMaic 草稿、Mini Apps 与教师资源
-- ============================================

BEGIN;

-- ============================================
-- AI 模型配置
-- ============================================

CREATE TABLE IF NOT EXISTS ai_model_configs (
    id SERIAL PRIMARY KEY,
    auth_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    provider_name VARCHAR(80) NOT NULL DEFAULT 'OpenAI Compatible',
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_model_configs
    ADD COLUMN IF NOT EXISTS provider_name VARCHAR(80) NOT NULL DEFAULT 'OpenAI Compatible',
    ADD COLUMN IF NOT EXISTS base_url TEXT,
    ADD COLUMN IF NOT EXISTS api_key TEXT,
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE ai_model_configs
    ALTER COLUMN provider_name SET DEFAULT 'OpenAI Compatible',
    ALTER COLUMN is_default SET DEFAULT TRUE,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ai_model_configs_user
    ON ai_model_configs (auth_user_id, is_default DESC, updated_at DESC);

-- ============================================
-- OpenMaic 课程草稿
-- ============================================

CREATE TABLE IF NOT EXISTS openmaic_course_drafts (
    id SERIAL PRIMARY KEY,
    auth_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    openmaic_job_id VARCHAR(100) NOT NULL,
    openmaic_result_id VARCHAR(120),
    title TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    scenes_count INTEGER NOT NULL DEFAULT 0,
    source_url TEXT,
    stage_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    scenes_json JSONB NOT NULL DEFAULT '[]'::JSONB,
    raw_result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (auth_user_id, openmaic_job_id)
);

ALTER TABLE openmaic_course_drafts
    ADD COLUMN IF NOT EXISTS openmaic_result_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS scenes_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS stage_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS scenes_json JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS raw_result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE openmaic_course_drafts
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN scenes_count SET DEFAULT 0,
    ALTER COLUMN stage_json SET DEFAULT '{}'::JSONB,
    ALTER COLUMN scenes_json SET DEFAULT '[]'::JSONB,
    ALTER COLUMN raw_result_json SET DEFAULT '{}'::JSONB,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_openmaic_course_drafts_user_job_unique
    ON openmaic_course_drafts (auth_user_id, openmaic_job_id);

CREATE INDEX IF NOT EXISTS idx_openmaic_course_drafts_user
    ON openmaic_course_drafts (auth_user_id, updated_at DESC, id DESC);

-- ============================================
-- Mini Apps
-- ============================================

CREATE TABLE IF NOT EXISTS mini_apps (
    id SERIAL PRIMARY KEY,
    app_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon_url TEXT,
    cover_url TEXT,
    category TEXT,
    vendor_name TEXT,
    source_type VARCHAR(32) NOT NULL DEFAULT 'local',
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    published_version_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mini_apps
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS icon_url TEXT,
    ADD COLUMN IF NOT EXISTS cover_url TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS vendor_name TEXT,
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) NOT NULL DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS published_version_id INTEGER,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE mini_apps
    ALTER COLUMN description SET DEFAULT '',
    ALTER COLUMN source_type SET DEFAULT 'local',
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_mini_apps_app_key_unique
    ON mini_apps (app_key);

CREATE TABLE IF NOT EXISTS mini_app_versions (
    id SERIAL PRIMARY KEY,
    mini_app_id INTEGER NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    entry_url TEXT NOT NULL,
    source_type VARCHAR(32) NOT NULL DEFAULT 'local',
    manifest JSONB NOT NULL DEFAULT '{}'::JSONB,
    release_notes TEXT NOT NULL DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mini_app_id, version)
);

ALTER TABLE mini_app_versions
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) NOT NULL DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS manifest JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS release_notes TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE mini_app_versions
    ALTER COLUMN source_type SET DEFAULT 'local',
    ALTER COLUMN manifest SET DEFAULT '{}'::JSONB,
    ALTER COLUMN release_notes SET DEFAULT '',
    ALTER COLUMN is_published SET DEFAULT FALSE,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_mini_app_versions_app_version_unique
    ON mini_app_versions (mini_app_id, version);

CREATE INDEX IF NOT EXISTS idx_mini_app_versions_app
    ON mini_app_versions (mini_app_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS content_miniapp_mounts (
    id SERIAL PRIMARY KEY,
    owner_kind VARCHAR(64) NOT NULL,
    owner_id INTEGER NOT NULL,
    mini_app_id INTEGER NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
    mini_app_version_id INTEGER REFERENCES mini_app_versions(id) ON DELETE SET NULL,
    launch_mode VARCHAR(32) NOT NULL DEFAULT 'iframe',
    mount_status VARCHAR(32) NOT NULL DEFAULT 'active',
    title_override TEXT,
    cover_url TEXT,
    aspect_ratio TEXT,
    params JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_kind, owner_id)
);

ALTER TABLE content_miniapp_mounts
    ADD COLUMN IF NOT EXISTS launch_mode VARCHAR(32) NOT NULL DEFAULT 'iframe',
    ADD COLUMN IF NOT EXISTS mount_status VARCHAR(32) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS title_override TEXT,
    ADD COLUMN IF NOT EXISTS cover_url TEXT,
    ADD COLUMN IF NOT EXISTS aspect_ratio TEXT,
    ADD COLUMN IF NOT EXISTS params JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE content_miniapp_mounts
    ALTER COLUMN launch_mode SET DEFAULT 'iframe',
    ALTER COLUMN mount_status SET DEFAULT 'active',
    ALTER COLUMN params SET DEFAULT '{}'::JSONB,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_miniapp_mounts_owner_unique
    ON content_miniapp_mounts (owner_kind, owner_id);

CREATE INDEX IF NOT EXISTS idx_content_miniapp_mounts_owner
    ON content_miniapp_mounts (owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS mini_app_events (
    id BIGSERIAL PRIMARY KEY,
    mini_app_id INTEGER NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
    mini_app_version_id INTEGER REFERENCES mini_app_versions(id) ON DELETE SET NULL,
    owner_kind VARCHAR(64),
    owner_id INTEGER,
    user_id VARCHAR(255),
    lesson_id INTEGER,
    event_type VARCHAR(64) NOT NULL,
    event_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mini_app_events
    ADD COLUMN IF NOT EXISTS mini_app_version_id INTEGER REFERENCES mini_app_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS owner_kind VARCHAR(64),
    ADD COLUMN IF NOT EXISTS owner_id INTEGER,
    ADD COLUMN IF NOT EXISTS user_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS lesson_id INTEGER,
    ADD COLUMN IF NOT EXISTS event_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE mini_app_events
    ALTER COLUMN event_payload SET DEFAULT '{}'::JSONB,
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mini_app_events_app
    ON mini_app_events (mini_app_id, created_at DESC);

-- ============================================
-- 教师资源、课时计划与模板
-- ============================================

CREATE TABLE IF NOT EXISTS teacher_resources (
    id SERIAL PRIMARY KEY,
    auth_user_id VARCHAR(255) NOT NULL,
    lesson_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    file_url TEXT,
    tts_audio_url TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    version_number INTEGER NOT NULL DEFAULT 1,
    ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    source_model TEXT,
    source_prompt TEXT,
    source_payload JSONB,
    reviewed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teacher_resources
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS source_model TEXT,
    ADD COLUMN IF NOT EXISTS source_prompt TEXT,
    ADD COLUMN IF NOT EXISTS source_payload JSONB,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE teacher_resources
    ALTER COLUMN duration SET DEFAULT 0,
    ALTER COLUMN review_status SET DEFAULT 'draft',
    ALTER COLUMN version_number SET DEFAULT 1,
    ALTER COLUMN ai_generated SET DEFAULT FALSE,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE teacher_resources
    DROP CONSTRAINT IF EXISTS teacher_resources_review_status_check;

ALTER TABLE teacher_resources
    ADD CONSTRAINT teacher_resources_review_status_check
    CHECK (review_status IN ('draft', 'reviewed', 'published'));

CREATE INDEX IF NOT EXISTS idx_teacher_resources_owner_lesson
    ON teacher_resources (auth_user_id, lesson_id, module_id, created_at DESC);

CREATE TABLE IF NOT EXISTS teacher_resource_versions (
    id SERIAL PRIMARY KEY,
    resource_id INTEGER NOT NULL,
    auth_user_id VARCHAR(255) NOT NULL,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    file_url TEXT,
    tts_audio_url TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (resource_id, version_number)
);

ALTER TABLE teacher_resource_versions
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE teacher_resource_versions
    ALTER COLUMN duration SET DEFAULT 0,
    ALTER COLUMN review_status SET DEFAULT 'draft',
    ALTER COLUMN snapshot SET DEFAULT '{}'::JSONB,
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_resource_versions_resource_version_unique
    ON teacher_resource_versions (resource_id, version_number);

CREATE INDEX IF NOT EXISTS idx_teacher_resource_versions_resource
    ON teacher_resource_versions (auth_user_id, resource_id, version_number DESC);

CREATE TABLE IF NOT EXISTS teacher_lesson_plan_items (
    id SERIAL PRIMARY KEY,
    auth_user_id VARCHAR(255) NOT NULL,
    lesson_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    standard_item_id INTEGER,
    teacher_resource_id INTEGER,
    title TEXT NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    file_url TEXT,
    tts_audio_url TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teacher_lesson_plan_items
    ADD COLUMN IF NOT EXISTS standard_item_id INTEGER,
    ADD COLUMN IF NOT EXISTS teacher_resource_id INTEGER,
    ADD COLUMN IF NOT EXISTS file_url TEXT,
    ADD COLUMN IF NOT EXISTS tts_audio_url TEXT,
    ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE teacher_lesson_plan_items
    ALTER COLUMN duration SET DEFAULT 0,
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_teacher_lesson_plan_owner_lesson
    ON teacher_lesson_plan_items (auth_user_id, lesson_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS teacher_student_assignments (
    id SERIAL PRIMARY KEY,
    auth_user_id VARCHAR(255) NOT NULL,
    lesson_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_at TIMESTAMPTZ,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teacher_student_assignments
    ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE teacher_student_assignments
SET is_required = TRUE
WHERE is_required IS NULL;

ALTER TABLE teacher_student_assignments
    ALTER COLUMN description SET DEFAULT '',
    ALTER COLUMN is_required SET DEFAULT TRUE,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_teacher_student_assignments_owner_lesson
    ON teacher_student_assignments (auth_user_id, lesson_id, module_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS teacher_lesson_plan_templates (
    id SERIAL PRIMARY KEY,
    auth_user_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    source_lesson_id INTEGER NOT NULL,
    plan_items JSONB NOT NULL DEFAULT '[]'::JSONB,
    student_assignments JSONB NOT NULL DEFAULT '[]'::JSONB,
    assignment_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teacher_lesson_plan_templates
    ADD COLUMN IF NOT EXISTS plan_items JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS student_assignments JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS assignment_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE teacher_lesson_plan_templates
    ALTER COLUMN plan_items SET DEFAULT '[]'::JSONB,
    ALTER COLUMN student_assignments SET DEFAULT '[]'::JSONB,
    ALTER COLUMN assignment_settings SET DEFAULT '{}'::JSONB,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_teacher_plan_templates_owner_updated
    ON teacher_lesson_plan_templates (auth_user_id, updated_at DESC, id DESC);

COMMIT;
