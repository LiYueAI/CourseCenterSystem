-- ============================================
-- 测试账号数据
-- ============================================

-- 教师账号: teacher@test.com / Teacher@2026
INSERT INTO auth_users (id, email, password_hash, role)
VALUES (
    gen_random_uuid(),
    'teacher@test.com',
    '$2b$12$zroI6Y3SRaK9RXzgFg4u0OT.Jj4x8hnHZSSU3WnEhFA8oiiKenpNS',
    'teacher'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO teachers (user_id, name, school, subject, grade_level)
SELECT id, '测试教师', '测试学校', '语文', '三年级'
FROM auth_users WHERE email = 'teacher@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- 学生账号: student@test.com / Student@2026
INSERT INTO auth_users (id, email, password_hash, role)
VALUES (
    gen_random_uuid(),
    'student@test.com',
    '$2b$12$.naJJ4BATPP.sRKKzjoEMuclcoqYGehkWR4.1iVK6wlLUF3mS9qaC',
    'student'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO students (user_id, name, class_name, grade_level)
SELECT id, '测试学生', '三年一班', '三年级'
FROM auth_users WHERE email = 'student@test.com'
ON CONFLICT (user_id) DO NOTHING;
