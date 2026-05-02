-- ============================================
-- 自建用户系统 - 数据库迁移脚本
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 主用户表
CREATE TABLE IF NOT EXISTS auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(32),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE auth_users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(32);

ALTER TABLE auth_users
    ALTER COLUMN email DROP NOT NULL;

-- 教师表
CREATE TABLE IF NOT EXISTS teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    school VARCHAR(200),
    subject VARCHAR(100),
    grade_level VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 学生表
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    class_name VARCHAR(100),
    grade_level VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(32) NOT NULL,
    code VARCHAR(10) NOT NULL,
    scene VARCHAR(20) NOT NULL CHECK (scene IN ('login', 'register', 'bind_phone')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_phone_unique ON auth_users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_users_phone ON auth_users(phone);
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_verification_codes_lookup ON auth_verification_codes(phone, scene, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_verification_codes_expires_at ON auth_verification_codes(expires_at);

-- ============================================
-- 修改现有表，添加 auth_user_id 关联
-- ============================================

-- lesson_customizations 添加 auth_user_id
ALTER TABLE lesson_customizations ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth_users(id);

-- 创建初始管理员账号 (密码: Admin@2026)
-- bcrypt hash of 'Admin@2026' with 12 rounds
INSERT INTO auth_users (id, email, password_hash, role)
VALUES (
    gen_random_uuid(),
    'admin@course-platform.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.TM6F3XmKjQ3yJm',
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- 创建管理员profile
INSERT INTO admins (user_id, name)
SELECT id, '系统管理员' FROM auth_users WHERE email = 'admin@course-platform.com'
ON CONFLICT (user_id) DO NOTHING;
