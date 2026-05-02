-- ============================================
-- 学生进度系统
-- ============================================

-- 学生进度表
CREATE TABLE IF NOT EXISTS student_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL,
    completed_items INTEGER[] DEFAULT '{}',
    item_progress JSONB DEFAULT '{}',
    current_star_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, lesson_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_lesson_id ON student_progress(lesson_id);

-- 初始化学生测试进度（可选）
-- INSERT INTO student_progress (student_id, lesson_id, completed_items, current_star_count)
-- SELECT id, 1, ARRAY[1,2,3], 3 FROM auth_users WHERE email = 'student@test.com'
-- ON CONFLICT (student_id, lesson_id) DO NOTHING;
