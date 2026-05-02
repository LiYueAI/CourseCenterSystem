-- ============================================
-- 移除 expert 角色与 experts 表
-- ============================================

BEGIN;

-- 删除历史 expert 用户；若 experts 表仍存在，会通过外键级联删除
DELETE FROM auth_users
WHERE role = 'expert';

-- 清理旧 experts 表和索引
DROP TABLE IF EXISTS experts;
DROP INDEX IF EXISTS idx_experts_user_id;

-- 重建 auth_users.role 约束，不再允许 expert
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'auth_users'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%role%'
    LOOP
        EXECUTE format('ALTER TABLE auth_users DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE auth_users
    ADD CONSTRAINT auth_users_role_check
    CHECK (role IN ('admin', 'teacher', 'student'));

COMMIT;
