-- ============================================
-- 学生作业与老师自定义作业
-- ============================================

CREATE TABLE IF NOT EXISTS teacher_student_assignments (
    id SERIAL PRIMARY KEY,
    auth_user_id VARCHAR(255) NOT NULL,
    lesson_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_student_assignments_owner_lesson
    ON teacher_student_assignments (auth_user_id, lesson_id, module_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS student_assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    teacher_auth_user_id VARCHAR(255),
    lesson_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    assignment_key TEXT NOT NULL,
    assignment_source VARCHAR(50) NOT NULL,
    standard_item_id INTEGER,
    teacher_assignment_id INTEGER,
    response_text TEXT NOT NULL DEFAULT '',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, assignment_key)
);

CREATE INDEX IF NOT EXISTS idx_student_assignment_submissions_student_lesson
    ON student_assignment_submissions (student_id, lesson_id, module_id);
