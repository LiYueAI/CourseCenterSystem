import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPassword, registerUser } from '@/lib/auth';
import {
  attachStudentToSchoolClassroom,
  attachTeacherToSchoolClassroom,
} from '@/lib/school-classroom';
import {
  query,
  queryOne,
  queryOneWithClient,
  queryWithClient,
  withTransaction,
} from '@/lib/db';

type AdminUserRole = 'admin' | 'teacher' | 'student';

type AdminUserSummary = {
  id: string;
  email?: string | null;
  phone?: string | null;
  role: AdminUserRole;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  school?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  className?: string | null;
  classCode?: string | null;
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown): AdminUserRole | null {
  return value === 'admin' || value === 'teacher' || value === 'student' ? value : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();
  if (!raw || raw.includes('@')) {
    return null;
  }

  const compact = raw.replace(/[\s\-()]/g, '');
  if (compact.startsWith('+')) {
    const digits = compact.slice(1);
    if (!digits || /[^0-9]/.test(digits)) {
      return null;
    }
    return `+${digits}`;
  }

  if (/[^0-9]/.test(compact)) {
    return null;
  }

  return compact;
}

function isValidPhone(value?: string | null): value is string {
  return Boolean(value && /^\+?\d{6,20}$/.test(value));
}

function normalizeClassCode(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return normalized || undefined;
}

async function requireAdmin() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== 'admin') {
    return null;
  }

  return currentUser;
}

async function listAdminUsers(): Promise<AdminUserSummary[]> {
  return query<AdminUserSummary>(`
    SELECT
      u.id,
      u.email,
      u.phone,
      u.role,
      u.is_active,
      u.created_at,
      COALESCE(t.name, s.name, a.name, u.email, u.phone, '未命名用户') as name,
      COALESCE(t.school, s.school) as school,
      t.subject as subject,
      COALESCE(t.grade_level, s.grade_level) as "gradeLevel",
      COALESCE(teacher_classroom.class_name, student_classroom.class_name, s.class_name) as "className",
      COALESCE(teacher_classroom.class_code, student_classroom.class_code) as "classCode"
    FROM auth_users u
    LEFT JOIN teachers t ON t.user_id = u.id
    LEFT JOIN school_classrooms teacher_classroom ON teacher_classroom.id = t.primary_school_classroom_id
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN school_classrooms student_classroom ON student_classroom.id = s.school_classroom_id
    LEFT JOIN admins a ON a.user_id = u.id
    WHERE u.role IN ('admin', 'teacher', 'student')
    ORDER BY u.created_at DESC
  `);
}

async function getAdminUserById(userId: string): Promise<AdminUserSummary | null> {
  const users = await query<AdminUserSummary>(
    `
      SELECT
        u.id,
        u.email,
        u.phone,
        u.role,
        u.is_active,
        u.created_at,
        COALESCE(t.name, s.name, a.name, u.email, u.phone, '未命名用户') as name,
        COALESCE(t.school, s.school) as school,
        t.subject as subject,
        COALESCE(t.grade_level, s.grade_level) as "gradeLevel",
        COALESCE(teacher_classroom.class_name, student_classroom.class_name, s.class_name) as "className",
        COALESCE(teacher_classroom.class_code, student_classroom.class_code) as "classCode"
      FROM auth_users u
      LEFT JOIN teachers t ON t.user_id = u.id
      LEFT JOIN school_classrooms teacher_classroom ON teacher_classroom.id = t.primary_school_classroom_id
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN school_classrooms student_classroom ON student_classroom.id = s.school_classroom_id
      LEFT JOIN admins a ON a.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  return users[0] || null;
}

async function ensureUserIdentifierAvailable(params: {
  userId: string;
  email: string | null;
  phone: string | null;
  client?: Parameters<typeof queryOneWithClient>[0];
}) {
  if (params.email) {
    const existingEmail = params.client
      ? await queryOneWithClient<{ id: string }>(
          params.client,
          'SELECT id FROM auth_users WHERE lower(email) = $1 AND id <> $2',
          [params.email, params.userId]
        )
      : await queryOne<{ id: string }>(
          'SELECT id FROM auth_users WHERE lower(email) = $1 AND id <> $2',
          [params.email, params.userId]
        );

    if (existingEmail) {
      throw new Error('Email already exists');
    }
  }

  if (params.phone) {
    const existingPhone = params.client
      ? await queryOneWithClient<{ id: string }>(
          params.client,
          'SELECT id FROM auth_users WHERE phone = $1 AND id <> $2',
          [params.phone, params.userId]
        )
      : await queryOne<{ id: string }>(
          'SELECT id FROM auth_users WHERE phone = $1 AND id <> $2',
          [params.phone, params.userId]
        );

    if (existingPhone) {
      throw new Error('Phone already exists');
    }
  }
}

async function ensureAdminCanBeDisabledOrDeleted(params: {
  userId: string;
  nextAction: 'disable' | 'delete';
  client?: Parameters<typeof queryOneWithClient>[0];
}) {
  const activeAdmins = params.client
    ? await queryOneWithClient<{ count: string }>(
        params.client,
        `
          SELECT count(*)::text as count
          FROM auth_users
          WHERE role = 'admin'
            AND is_active = true
            AND id <> $1
        `,
        [params.userId]
      )
    : await queryOne<{ count: string }>(
        `
          SELECT count(*)::text as count
          FROM auth_users
          WHERE role = 'admin'
            AND is_active = true
            AND id <> $1
        `,
        [params.userId]
      );

  if (Number(activeAdmins?.count || 0) === 0) {
    throw new Error(
      params.nextAction === 'delete'
        ? 'At least one active admin must remain before delete'
        : 'At least one active admin must remain before disable'
    );
  }
}

export async function GET() {
  const currentUser = await requireAdmin();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = await listAdminUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const currentUser = await requireAdmin();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const {
      phone: rawPhone,
      email: rawEmail,
      password: rawPassword,
      role: rawRole,
      name: rawName,
      school: rawSchool,
      subject: rawSubject,
      class_name: rawClassName,
      grade_level: rawGradeLevel,
      class_code: rawClassCode,
    } = body;
    const phone = normalizeOptionalString(rawPhone);
    const email = normalizeOptionalString(rawEmail);
    const password = typeof rawPassword === 'string' ? rawPassword : '';
    const role = normalizeRole(rawRole);
    const name = normalizeOptionalString(rawName);
    const school = normalizeOptionalString(rawSchool);
    const subject = normalizeOptionalString(rawSubject);
    const class_name = normalizeOptionalString(rawClassName);
    const grade_level = normalizeOptionalString(rawGradeLevel);
    const class_code = normalizeClassCode(rawClassCode);

    if (!password || !role || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (role === 'admin' && !email) {
      return NextResponse.json({ error: '管理员账号需要邮箱' }, { status: 400 });
    }

    if ((role === 'teacher' || role === 'student') && !phone && !email) {
      return NextResponse.json({ error: '请填写手机号，或提供兼容邮箱' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 });
    }

    if ((role === 'teacher' || role === 'student') && !class_code && (!school || !grade_level || !class_name)) {
      return NextResponse.json(
        { error: '请填写班级编码，或填写学校、年级和班级' },
        { status: 400 }
      );
    }

    const user = await registerUser({
      phone,
      email,
      password,
      role,
      name,
      school,
      subject,
      class_name,
      grade_level,
      class_code,
    });

    const summary = await getAdminUserById(user.id);

    return NextResponse.json(
      {
        success: true,
        user: summary || {
          id: user.id,
          email: user.email,
          phone: user.phone,
          role: user.role,
          name: user.name,
          is_active: true,
          created_at: user.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message === 'Invalid phone format') {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }
    if (error.message === 'Phone already exists') {
      return NextResponse.json({ error: '手机号已被使用' }, { status: 409 });
    }
    if (error.message === 'Email already exists') {
      return NextResponse.json({ error: '邮箱已被使用' }, { status: 409 });
    }
    if (error.message === 'Admin email is required') {
      return NextResponse.json({ error: '管理员账号需要邮箱' }, { status: 400 });
    }
    if (
      error.message === 'Teacher classroom info or class code is required' ||
      error.message === 'Student classroom info or class code is required'
    ) {
      return NextResponse.json(
        { error: '请填写班级编码，或填写学校、年级和班级' },
        { status: 400 }
      );
    }
    if (error.message === 'Teacher classroom info is required') {
      return NextResponse.json(
        { error: '教师账号需要填写学科，以及班级编码或学校/年级/班级' },
        { status: 400 }
      );
    }
    if (error.message === 'Classroom code not found') {
      return NextResponse.json(
        { error: '班级编码不存在，请核对后再试' },
        { status: 400 }
      );
    }
    console.error('Failed to create user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const currentUser = await requireAdmin();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const payload = body as {
      id?: string;
      name?: string;
      phone?: string;
      email?: string;
      password?: string;
      role?: string;
      school?: string;
      subject?: string;
      class_name?: string;
      grade_level?: string;
      class_code?: string;
    };
    const userId = normalizeRequiredString(payload.id);
    const name = normalizeRequiredString(payload.name);
    const phone = normalizePhone(payload.phone);
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === 'string' ? payload.password.trim() : '';
    const role = normalizeRole(payload.role);
    const school = normalizeOptionalString(payload.school);
    const subject = normalizeOptionalString(payload.subject);
    const className = normalizeOptionalString(payload.class_name);
    const gradeLevel = normalizeOptionalString(payload.grade_level);
    const classCode = normalizeClassCode(payload.class_code);

    if (!userId || !name) {
      return NextResponse.json({ error: '用户 ID 和姓名不能为空' }, { status: 400 });
    }

    if (payload.phone && !phone) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }

    if (password && password.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 });
    }

    const updatedUser = await withTransaction(async (client) => {
      const existingUser = await queryOneWithClient<{
        id: string;
        role: AdminUserRole;
      }>(
        client,
        `
          SELECT id, role
          FROM auth_users
          WHERE id = $1
          LIMIT 1
        `,
        [userId]
      );

      if (!existingUser) {
        throw new Error('User not found');
      }

      if (role && role !== existingUser.role) {
        throw new Error('Role change is not supported');
      }

      if (existingUser.role === 'admin' && !email) {
        throw new Error('Admin email is required');
      }

      if ((existingUser.role === 'teacher' || existingUser.role === 'student') && !phone && !email) {
        throw new Error('Phone or email is required');
      }

      if (!isValidPhone(phone) && phone !== null) {
        throw new Error('Invalid phone format');
      }

      await ensureUserIdentifierAvailable({ userId, email, phone, client });

      const passwordHash = password ? await hashPassword(password) : null;
      await queryWithClient(
        client,
        `
          UPDATE auth_users
          SET
            email = $2,
            phone = $3,
            password_hash = COALESCE($4, password_hash),
            updated_at = NOW()
          WHERE id = $1
        `,
        [userId, email, phone, passwordHash]
      );

      if (existingUser.role === 'admin') {
        await queryWithClient(
          client,
          `
            INSERT INTO admins (user_id, name)
            VALUES ($1, $2)
            ON CONFLICT (user_id)
            DO UPDATE SET
              name = EXCLUDED.name,
              updated_at = NOW()
          `,
          [userId, name]
        );
      }

      if (existingUser.role === 'teacher') {
        if (!classCode && (!school || !gradeLevel || !className)) {
          throw new Error('Teacher classroom info or class code is required');
        }

        await attachTeacherToSchoolClassroom({
          client,
          userId,
          name,
          school: school || '',
          gradeLevel: gradeLevel || '',
          className: className || '',
          subject,
          classCode,
        });
      }

      if (existingUser.role === 'student') {
        if (!classCode && (!school || !gradeLevel || !className)) {
          throw new Error('Student classroom info or class code is required');
        }

        await attachStudentToSchoolClassroom({
          client,
          userId,
          name,
          school: school || '',
          gradeLevel: gradeLevel || '',
          className: className || '',
          classCode,
        });
      }

      const summary = await queryOneWithClient<AdminUserSummary>(
        client,
        `
          SELECT
            u.id,
            u.email,
            u.phone,
            u.role,
            u.is_active,
            u.created_at,
            COALESCE(t.name, s.name, a.name, u.email, u.phone, '未命名用户') as name,
            COALESCE(t.school, s.school) as school,
            t.subject as subject,
            COALESCE(t.grade_level, s.grade_level) as "gradeLevel",
            COALESCE(teacher_classroom.class_name, student_classroom.class_name, s.class_name) as "className",
            COALESCE(teacher_classroom.class_code, student_classroom.class_code) as "classCode"
          FROM auth_users u
          LEFT JOIN teachers t ON t.user_id = u.id
          LEFT JOIN school_classrooms teacher_classroom ON teacher_classroom.id = t.primary_school_classroom_id
          LEFT JOIN students s ON s.user_id = u.id
          LEFT JOIN school_classrooms student_classroom ON student_classroom.id = s.school_classroom_id
          LEFT JOIN admins a ON a.user_id = u.id
          WHERE u.id = $1
          LIMIT 1
        `,
        [userId]
      );

      if (!summary) {
        throw new Error('User not found');
      }

      return summary;
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'User not found') {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (message === 'Role change is not supported') {
      return NextResponse.json({ error: '当前版本暂不支持直接修改用户角色' }, { status: 400 });
    }
    if (message === 'Phone or email is required') {
      return NextResponse.json({ error: '请填写手机号，或提供兼容邮箱' }, { status: 400 });
    }
    if (message === 'Admin email is required') {
      return NextResponse.json({ error: '管理员账号需要邮箱' }, { status: 400 });
    }
    if (message === 'Invalid phone format') {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }
    if (message === 'Phone already exists') {
      return NextResponse.json({ error: '手机号已被使用' }, { status: 409 });
    }
    if (message === 'Email already exists') {
      return NextResponse.json({ error: '邮箱已被使用' }, { status: 409 });
    }
    if (
      message === 'Teacher classroom info or class code is required' ||
      message === 'Student classroom info or class code is required'
    ) {
      return NextResponse.json(
        { error: '请填写班级编码，或填写学校、年级和班级' },
        { status: 400 }
      );
    }
    if (message === 'Classroom code not found') {
      return NextResponse.json({ error: '班级编码不存在，请核对后再试' }, { status: 400 });
    }

    console.error('Failed to update user:', error);
    return NextResponse.json({ error: '更新用户失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const currentUser = await requireAdmin();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { id, is_active } = body as { id?: string; is_active?: boolean };

    if (typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be boolean' }, { status: 400 });
    }

    if (id === currentUser.id && is_active === false) {
      return NextResponse.json({ error: '不能禁用当前登录的管理员账号' }, { status: 400 });
    }

    const existingUsers = await query<{ id: string; role: AdminUserRole; is_active: boolean }>(
      'SELECT id, role, is_active FROM auth_users WHERE id = $1',
      [id]
    );
    const targetUser = existingUsers[0];

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'admin' && is_active === false) {
      await ensureAdminCanBeDisabledOrDeleted({ userId: id, nextAction: 'disable' });
    }

    await query(
      'UPDATE auth_users SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [is_active, id.trim()]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'At least one active admin must remain before disable') {
      return NextResponse.json({ error: '至少需要保留一个启用的管理员账号' }, { status: 400 });
    }

    console.error('Failed to update user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const currentUser = await requireAdmin();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const userId = normalizeRequiredString((body as { id?: string } | null)?.id);

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    if (userId === currentUser.id) {
      return NextResponse.json({ error: '不能删除当前登录的管理员账号' }, { status: 400 });
    }

    await withTransaction(async (client) => {
      const targetUser = await queryOneWithClient<{
        id: string;
        role: AdminUserRole;
        is_active: boolean;
      }>(
        client,
        `
          SELECT id, role, is_active
          FROM auth_users
          WHERE id = $1
          LIMIT 1
        `,
        [userId]
      );

      if (!targetUser) {
        throw new Error('User not found');
      }

      if (targetUser.role === 'admin' && targetUser.is_active) {
        await ensureAdminCanBeDisabledOrDeleted({ userId, nextAction: 'delete', client });
      }

      await queryWithClient(
        client,
        `
          DELETE FROM "lessonCustomizations"
          WHERE auth_user_id = $1
        `,
        [userId]
      );

      await queryWithClient(
        client,
        `
          DELETE FROM auth_users
          WHERE id = $1
        `,
        [userId]
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'User not found') {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (message === 'At least one active admin must remain before delete') {
      return NextResponse.json({ error: '至少需要保留一个启用的管理员账号' }, { status: 400 });
    }

    console.error('Failed to delete user:', error);
    return NextResponse.json({ error: '删除用户失败' }, { status: 500 });
  }
}
