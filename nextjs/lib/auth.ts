import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import {
  query,
  queryOne,
  queryOneWithClient,
  queryWithClient,
  withTransaction,
} from './db';
import {
  attachStudentToSchoolClassroom,
  attachTeacherToSchoolClassroom,
} from './school-classroom';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'course-platform-jwt-secret-2026-change-in-production'
);

const COOKIE_NAME = 'auth_token';
const TOKEN_EXPIRY = '7d';
const VERIFICATION_CODE_TTL_MINUTES = Number(
  process.env.AUTH_VERIFICATION_CODE_TTL_MINUTES || 10
);
const VERIFICATION_CODE_RESEND_COOLDOWN_SECONDS = Number(
  process.env.AUTH_VERIFICATION_CODE_RESEND_COOLDOWN_SECONDS || 60
);
const SMS_PROVIDER = process.env.AUTH_SMS_PROVIDER?.trim() || 'debug';
const EXPOSE_DEBUG_VERIFICATION_CODE =
  process.env.AUTH_SMS_EXPOSE_CODE !== undefined
    ? ['1', 'true', 'yes', 'on'].includes(
        process.env.AUTH_SMS_EXPOSE_CODE.toLowerCase()
      )
    : process.env.NODE_ENV !== 'production';
const VERIFICATION_CODE_LENGTH = Number(
  process.env.AUTH_VERIFICATION_CODE_LENGTH || 6
);

// Types
export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  role: 'admin' | 'teacher' | 'student';
  name: string;
  is_active: boolean;
  created_at?: string;
}

export interface TokenPayload {
  sub: string;  // user id
  email: string;
  phone?: string | null;
  role: string;
  name: string;
}

export type VerificationScene = 'login' | 'register' | 'bind_phone';

interface AuthUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash?: string;
  role: 'admin' | 'teacher' | 'student';
  is_active: boolean;
  created_at?: string;
}

interface SendPhoneVerificationCodeOptions {
  phone: string;
  scene: VerificationScene;
}

interface SentPhoneVerificationCode {
  phone: string;
  scene: VerificationScene;
  provider: string;
  expiresAt: string;
  debugCode?: string;
}

let authSchemaInitialized = false;

async function ensureAuthSchema() {
  if (authSchemaInitialized) {
    return;
  }

  await query(`
    alter table auth_users
      add column if not exists phone varchar(32);

    alter table auth_users
      alter column email drop not null;

    create table if not exists auth_verification_codes (
      id uuid primary key default gen_random_uuid(),
      phone varchar(32) not null,
      code varchar(10) not null,
      scene varchar(20) not null check (scene in ('login', 'register', 'bind_phone')),
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );

    create unique index if not exists idx_auth_users_phone_unique
      on auth_users (phone)
      where phone is not null;

    create index if not exists idx_auth_users_phone
      on auth_users (phone);

    create index if not exists idx_auth_verification_codes_lookup
      on auth_verification_codes (phone, scene, created_at desc);

    create index if not exists idx_auth_verification_codes_expires_at
      on auth_verification_codes (expires_at);
  `);

  authSchemaInitialized = true;
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizePhone(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  if (raw.includes('@')) {
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

function createVerificationCode(): string {
  const max = 10 ** VERIFICATION_CODE_LENGTH;
  const min = 10 ** (VERIFICATION_CODE_LENGTH - 1);
  return String(Math.floor(Math.random() * (max - min)) + min);
}

function mapAuthUser(row: AuthUserRow, name: string): AuthUser {
  return {
    id: row.id,
    email: row.email || '',
    phone: row.phone || null,
    role: row.role,
    name,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

// Password utilities
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT utilities
export async function createToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// Cookie utilities
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  // Use Secure in production HTTPS, allow HTTP in development
  const isSecure = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https');
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

// Get current user from token
export async function getCurrentUser(): Promise<AuthUser | null> {
  await ensureAuthSchema();

  const token = await getAuthToken();
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Check if user still exists and is active
  const user = await queryOne<AuthUserRow>(
    'SELECT id, email, phone, role, is_active FROM auth_users WHERE id = $1',
    [payload.sub]
  );

  if (!user || !user.is_active) return null;
  if (!['admin', 'teacher', 'student'].includes(user.role)) return null;

  // Get role-specific name
  const name = await getUserName(user.id, user.role);
  return mapAuthUser(user, name);
}

async function getUserName(userId: string, role: string): Promise<string> {
  const tableMap: Record<string, string> = {
    teacher: 'teachers',
    student: 'students',
    admin: 'admins',
  };

  const table = tableMap[role];
  if (!table) return 'Unknown';

  const result = await queryOne<{ name: string }>(
    `SELECT name FROM ${table} WHERE user_id = $1`,
    [userId]
  );

  return result?.name || 'Unknown';
}

// Register new user
export async function registerUser(data: {
  email?: string;
  phone?: string;
  password: string;
  role: 'teacher' | 'student' | 'admin';
  name: string;
  school?: string;
  subject?: string;
  class_name?: string;
  grade_level?: string;
  class_code?: string;
}): Promise<AuthUser> {
  await ensureAuthSchema();

  return withTransaction(async (client) => {
    const normalizedEmail = normalizeEmail(data.email);
    const normalizedPhone = normalizePhone(data.phone);

    if (normalizedPhone && !isValidPhone(normalizedPhone)) {
      throw new Error('Invalid phone format');
    }

    if (data.role === 'admin' && !normalizedEmail) {
      throw new Error('Admin email is required');
    }

    if (data.role !== 'admin' && !normalizedPhone && !normalizedEmail) {
      throw new Error('Phone or email is required');
    }

    if (normalizedEmail) {
      const existingEmail = await queryOneWithClient(
        client,
        'SELECT id FROM auth_users WHERE lower(email) = $1',
        [normalizedEmail]
      );

      if (existingEmail) {
        throw new Error('Email already exists');
      }
    }

    if (normalizedPhone) {
      const existingPhone = await queryOneWithClient(
        client,
        'SELECT id FROM auth_users WHERE phone = $1',
        [normalizedPhone]
      );

      if (existingPhone) {
        throw new Error('Phone already exists');
      }
    }

    const passwordHash = await hashPassword(data.password);
    const userResult = await queryOneWithClient<AuthUserRow>(
      client,
      `INSERT INTO auth_users (email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, phone, role, is_active, created_at`,
      [normalizedEmail, normalizedPhone, passwordHash, data.role]
    );

    if (!userResult) {
      throw new Error('Failed to create user');
    }

    const hasClassCode = Boolean(data.class_code?.trim());
    const hasClassroomFields = Boolean(
      data.school?.trim() && data.grade_level?.trim() && data.class_name?.trim()
    );
    const userId = userResult.id;

    switch (data.role) {
      case 'teacher':
        if (!hasClassroomFields || !data.subject?.trim()) {
          throw new Error('Teacher classroom info is required');
        }
        await attachTeacherToSchoolClassroom({
          client,
          userId,
          name: data.name,
          school: data.school || '',
          gradeLevel: data.grade_level || '',
          className: data.class_name || '',
          subject: data.subject,
          classCode: data.class_code,
        });
        break;
      case 'student':
        if (!hasClassCode && !hasClassroomFields) {
          throw new Error('Student classroom info or class code is required');
        }
        await attachStudentToSchoolClassroom({
          client,
          userId,
          name: data.name,
          school: data.school || '',
          gradeLevel: data.grade_level || '',
          className: data.class_name || '',
          classCode: data.class_code,
        });
        break;
      case 'admin':
        await queryWithClient(
          client,
          `INSERT INTO admins (user_id, name)
           VALUES ($1, $2)`,
          [userId, data.name]
        );
        break;
    }

    return mapAuthUser(userResult, data.name);
  });
}

async function findAuthUserRowByIdentifier(
  identifier: string
): Promise<AuthUserRow | null> {
  await ensureAuthSchema();

  const normalizedEmail = normalizeEmail(identifier);
  const normalizedPhone = normalizePhone(identifier);
  const clauses: string[] = [];
  const params: string[] = [];

  if (normalizedEmail) {
    clauses.push(`lower(email) = $${params.length + 1}`);
    params.push(normalizedEmail);
  }

  if (normalizedPhone) {
    clauses.push(`phone = $${params.length + 1}`);
    params.push(normalizedPhone);
  }

  if (clauses.length === 0) {
    return null;
  }

  return queryOne<AuthUserRow>(
    `SELECT id, email, phone, password_hash, role, is_active
     FROM auth_users
     WHERE ${clauses.join(' OR ')}`,
    params
  );
}

export async function findUserByPhone(
  phone: string
): Promise<AuthUser | null> {
  await ensureAuthSchema();

  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) {
    return null;
  }

  const user = await queryOne<AuthUserRow>(
    `SELECT id, email, phone, role, is_active, created_at
     FROM auth_users
     WHERE phone = $1`,
    [normalizedPhone]
  );

  if (!user) {
    return null;
  }

  const name = await getUserName(user.id, user.role);
  return mapAuthUser(user, name);
}

export async function sendPhoneVerificationCode(
  options: SendPhoneVerificationCodeOptions
): Promise<SentPhoneVerificationCode> {
  await ensureAuthSchema();

  const normalizedPhone = normalizePhone(options.phone);
  if (!isValidPhone(normalizedPhone)) {
    throw new Error('Invalid phone format');
  }

  const recentCode = await queryOne<{ created_at: string }>(
    `SELECT created_at
     FROM auth_verification_codes
     WHERE phone = $1
       AND scene = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedPhone, options.scene]
  );

  if (recentCode) {
    const secondsSinceLastSend =
      (Date.now() - new Date(recentCode.created_at).getTime()) / 1000;

    if (secondsSinceLastSend < VERIFICATION_CODE_RESEND_COOLDOWN_SECONDS) {
      throw new Error('Verification code requested too frequently');
    }
  }

  const code = createVerificationCode();

  await query(
    `UPDATE auth_verification_codes
     SET used_at = NOW()
     WHERE phone = $1
       AND scene = $2
       AND used_at IS NULL`,
    [normalizedPhone, options.scene]
  );

  const inserted = await queryOne<{ expires_at: string }>(
    `INSERT INTO auth_verification_codes (phone, code, scene, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)
     RETURNING expires_at`,
    [normalizedPhone, code, options.scene, VERIFICATION_CODE_TTL_MINUTES]
  );

  console.info(
    `[auth:${SMS_PROVIDER}] phone verification code (${options.scene}) for ${normalizedPhone}: ${code}`
  );

  return {
    phone: normalizedPhone,
    scene: options.scene,
    provider: SMS_PROVIDER,
    expiresAt: inserted?.expires_at || new Date().toISOString(),
    debugCode: EXPOSE_DEBUG_VERIFICATION_CODE ? code : undefined,
  };
}

export async function consumePhoneVerificationCode(options: {
  phone: string;
  code: string;
  scene: VerificationScene;
}): Promise<boolean> {
  await ensureAuthSchema();

  const normalizedPhone = normalizePhone(options.phone);
  const normalizedCode = options.code?.trim();

  if (!isValidPhone(normalizedPhone) || !normalizedCode) {
    return false;
  }

  return withTransaction(async (client) => {
    const verification = await queryOneWithClient<{ id: string }>(
      client,
      `SELECT id
       FROM auth_verification_codes
       WHERE phone = $1
         AND scene = $2
         AND code = $3
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedPhone, options.scene, normalizedCode]
    );

    if (!verification) {
      return false;
    }

    await queryWithClient(
      client,
      `UPDATE auth_verification_codes
       SET used_at = NOW()
       WHERE id = $1`,
      [verification.id]
    );

    return true;
  });
}

export async function loginUserWithPhoneCode(
  phone: string,
  code: string
): Promise<AuthUser | null> {
  await ensureAuthSchema();

  const normalizedPhone = normalizePhone(phone);

  if (!isValidPhone(normalizedPhone)) {
    return null;
  }

  const user = await withTransaction<AuthUserRow | null>(async (client) => {
    const authUser = await queryOneWithClient<AuthUserRow>(
      client,
      `SELECT id, email, phone, role, is_active, created_at
       FROM auth_users
       WHERE phone = $1
         AND role IN ('teacher', 'student')
       LIMIT 1`,
      [normalizedPhone]
    );

    if (!authUser || !authUser.is_active) {
      return null;
    }

    const verification = await queryOneWithClient<{ id: string }>(
      client,
      `SELECT id
       FROM auth_verification_codes
       WHERE phone = $1
         AND scene = 'login'
         AND code = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedPhone, code.trim()]
    );

    if (!verification) {
      return null;
    }

    await queryWithClient(
      client,
      `UPDATE auth_verification_codes
       SET used_at = NOW()
       WHERE id = $1`,
      [verification.id]
    );

    return authUser;
  });

  if (!user) {
    return null;
  }

  const name = await getUserName(user.id, user.role);
  return mapAuthUser(user, name);
}

// Login user
export async function loginUser(
  identifier: string,
  password: string
): Promise<AuthUser | null> {
  const user = await findAuthUserRowByIdentifier(identifier);

  if (!user) return null;
  if (!user.is_active) return null;
  if (!user.password_hash) return null;

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  const name = await getUserName(user.id, user.role);
  return mapAuthUser(user, name);
}
