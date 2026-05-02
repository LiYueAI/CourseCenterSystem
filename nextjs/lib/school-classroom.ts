import 'server-only';

import { randomInt } from 'crypto';
import {
  query,
  queryOne,
  queryOneWithClient,
  queryWithClient,
  withTransaction,
} from '@/lib/db';
import type { PoolClient } from 'pg';

type SchoolRecord = {
  id: number;
  name: string;
};

type ClassroomRecord = {
  id: number;
  school_id: number;
  grade_level: string;
  class_name: string;
  class_code: string;
  class_code_enabled: boolean;
  region_code: string | null;
  stage_code: string | null;
  grade_number: number | null;
  class_number: number | null;
  classroom_uid: string | null;
};

type ClassroomWithSchoolRecord = ClassroomRecord & {
  school_name: string;
};

type ClassCodeStatus = 'enabled' | 'disabled';

export interface ClassroomStudentRecord {
  userId: string;
  name: string;
}

export interface TeacherCurrentClassroomSummary {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  classCodeEnabled: boolean;
  classCodeStatus: ClassCodeStatus;
  studentCount: number;
  students: ClassroomStudentRecord[];
}

export interface TeacherRosterSubmissionStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  lastSubmittedAt: string | null;
}

export interface TeacherCurrentClassroomRosterStudentRecord {
  userId: string;
  name: string;
  email: string;
  phone: string;
  submissionStats: TeacherRosterSubmissionStats;
}

export interface TeacherCurrentClassroomRoster {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  classCodeEnabled: boolean;
  classCodeStatus: ClassCodeStatus;
  studentCount: number;
  students: TeacherCurrentClassroomRosterStudentRecord[];
}

type TeacherCurrentClassroomRosterStudentRow = {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type TeacherCurrentClassroomRosterStudentWithStatsRow =
  TeacherCurrentClassroomRosterStudentRow & {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    lastSubmittedAt: string | null;
  };

export interface ClassroomDirectoryRecord {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  classCodeEnabled: boolean;
  classCodeStatus: ClassCodeStatus;
  teacherCount: number;
  studentCount: number;
  teachers: Array<{
    userId: string;
    name: string;
  }>;
}

export interface StudentClassroomMembershipRecord {
  userId: string;
  name: string;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
}

export interface TeacherClassroomMembershipRecord {
  userId: string;
  name: string;
  subject: string | null;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
}

export interface AdminClassroomMutationInput {
  schoolName: string;
  gradeLevel: string;
  className: string;
}

let initialized = false;

function normalizeText(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function normalizeClassCode(value?: string | null): string {
  return (value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isManagedClassCode(value?: string | null): boolean {
  return /^[A-HJ-NP-Z2356789]{16}$/.test(normalizeClassCode(value));
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function buildClassroomUidCandidate(): string {
  return `${padNumber(randomInt(0, 100000000), 8)}${padNumber(randomInt(0, 100000000), 8)}`;
}

function toClassCodeStatus(enabled: boolean): ClassCodeStatus {
  return enabled ? 'enabled' : 'disabled';
}

function buildClassCodeCandidate(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ2356789';
  let code = '';

  for (let index = 0; index < 16; index += 1) {
    const randomIndex = randomInt(0, alphabet.length);
    code += alphabet[randomIndex];
  }

  return code;
}

function isUniqueViolation(error: unknown, constraints?: string[]): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as { code?: string; constraint?: string };
  if (pgError.code !== '23505') {
    return false;
  }

  if (!constraints || constraints.length === 0) {
    return true;
  }

  return constraints.includes(pgError.constraint || '');
}

export async function ensureSchoolClassroomTables() {
  if (initialized) {
    return;
  }

  await query(`
    create table if not exists schools (
      id serial primary key,
      name text not null unique,
      created_at timestamptz not null default now()
    );

    create table if not exists school_classrooms (
      id serial primary key,
      school_id integer not null references schools(id) on delete cascade,
      grade_level varchar(50) not null,
      class_name varchar(100) not null,
      class_code varchar(32),
      class_code_enabled boolean not null default true,
      region_code varchar(4),
      stage_code varchar(2),
      grade_number integer,
      class_number integer,
      classroom_uid varchar(16),
      created_at timestamptz not null default now(),
      unique (school_id, grade_level, class_name)
    );

    create table if not exists teacher_school_classrooms (
      id serial primary key,
      teacher_user_id uuid not null references auth_users(id) on delete cascade,
      school_classroom_id integer not null references school_classrooms(id) on delete cascade,
      is_primary boolean not null default true,
      created_at timestamptz not null default now(),
      unique (teacher_user_id, school_classroom_id)
    );

    alter table school_classrooms
      add column if not exists class_code varchar(32);

    alter table school_classrooms
      add column if not exists class_code_enabled boolean not null default true;

    alter table school_classrooms
      add column if not exists region_code varchar(4);

    alter table school_classrooms
      add column if not exists stage_code varchar(2);

    alter table school_classrooms
      add column if not exists grade_number integer;

    alter table school_classrooms
      add column if not exists class_number integer;

    alter table school_classrooms
      add column if not exists classroom_uid varchar(16);

    alter table school_classrooms
      drop constraint if exists school_classrooms_school_id_grade_level_class_name_key;

    alter table teachers add column if not exists school_id integer references schools(id);
    alter table teachers add column if not exists primary_school_classroom_id integer references school_classrooms(id);
    alter table students add column if not exists school varchar(200);
    alter table students add column if not exists school_id integer references schools(id);
    alter table students add column if not exists school_classroom_id integer references school_classrooms(id);

    update school_classrooms
    set class_code_enabled = true
    where class_code_enabled is null;

    create index if not exists idx_school_classrooms_school_grade_class
      on school_classrooms (school_id, grade_level, class_name);
    create unique index if not exists idx_school_classrooms_class_code
      on school_classrooms (class_code);
    create unique index if not exists idx_school_classrooms_classroom_uid
      on school_classrooms (classroom_uid);
    create index if not exists idx_teacher_school_classrooms_teacher
      on teacher_school_classrooms (teacher_user_id, school_classroom_id);
    create index if not exists idx_students_school_classroom_id
      on students (school_classroom_id);
  `);

  const classroomsMissingUid = await query<{ id: number }>(
    `
      select id
      from school_classrooms
      where classroom_uid is null
         or length(btrim(classroom_uid)) <> 16
    `
  );

  for (const classroom of classroomsMissingUid) {
    await withTransaction(async (client) => {
      const uid = await generateUniqueClassroomUid(client);
      await queryWithClient(
        client,
        `
          update school_classrooms
          set classroom_uid = $2
          where id = $1
        `,
        [classroom.id, uid]
      );
    });
  }

  const classroomsMissingManagedCode = await query<{ id: number }>(
    `
      select id
      from school_classrooms
      where class_code is null
         or btrim(class_code) = ''
         or upper(btrim(class_code)) !~ '^[A-HJ-NP-Z2356789]{16}$'
    `
  );

  for (const classroom of classroomsMissingManagedCode) {
    await withTransaction(async (client) => {
      await assignGeneratedClassCodeToClassroom(client, classroom.id);
    });
  }

  initialized = true;
}

async function getOrCreateSchool(client: PoolClient, schoolName: string): Promise<SchoolRecord> {
  const normalizedName = normalizeText(schoolName);
  if (!normalizedName) {
    throw new Error('School is required');
  }

  const record = await queryOneWithClient<SchoolRecord>(
    client,
    `
      insert into schools (name)
      values ($1)
      on conflict (name)
      do update set name = excluded.name
      returning id, name
    `,
    [normalizedName]
  );

  if (!record) {
    throw new Error('Failed to create school');
  }

  return record;
}

async function generateUniqueClassCode(client: PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = buildClassCodeCandidate();
    const existing = await queryOneWithClient<{ id: number }>(
      client,
      `
        select id
        from school_classrooms
        where class_code = $1
        limit 1
      `,
      [candidate]
    );

    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Failed to generate unique classroom code');
}

async function generateUniqueClassroomUid(client: PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = buildClassroomUidCandidate();
    const existing = await queryOneWithClient<{ id: number }>(
      client,
      `
        select id
        from school_classrooms
        where classroom_uid = $1
        limit 1
      `,
      [candidate]
    );

    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Failed to generate unique classroom uid');
}

async function assignGeneratedClassCodeToClassroom(
  client: PoolClient,
  classroomId: number
): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const nextClassCode = await generateUniqueClassCode(client);

    try {
      const updated = await queryOneWithClient<{ id: number }>(
        client,
        `
          update school_classrooms
          set
            class_code = $2,
            class_code_enabled = true
          where id = $1
          returning id
        `,
        [classroomId, nextClassCode]
      );

      if (updated) {
        return nextClassCode;
      }
    } catch (error) {
      if (isUniqueViolation(error, ['idx_school_classrooms_class_code'])) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to generate unique classroom code');
}

async function resolveClassroomByCode(
  client: PoolClient,
  classCode: string
): Promise<ClassroomWithSchoolRecord | null> {
  const normalizedCode = normalizeClassCode(classCode);
  if (!normalizedCode) {
    return null;
  }

  return queryOneWithClient<ClassroomWithSchoolRecord>(
    client,
    `
      select
        classrooms.id,
        classrooms.school_id,
        classrooms.grade_level,
        classrooms.class_name,
        classrooms.class_code,
        classrooms.class_code_enabled,
        schools.name as school_name
      from school_classrooms classrooms
      join schools
        on schools.id = classrooms.school_id
      where classrooms.class_code = $1
        and classrooms.class_code_enabled = true
      limit 1
    `,
    [normalizedCode]
  );
}

async function createClassroom(
  client: PoolClient,
  schoolId: number,
  gradeLevel: string,
  className: string
): Promise<ClassroomRecord> {
  const normalizedGrade = normalizeText(gradeLevel);
  const normalizedClass = normalizeText(className);

  if (!normalizedGrade || !normalizedClass) {
    throw new Error('Grade level and class name are required');
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const nextClassCode = await generateUniqueClassCode(client);
    const nextClassroomUid = await generateUniqueClassroomUid(client);

    try {
      const record = await queryOneWithClient<ClassroomRecord>(
        client,
        `
          insert into school_classrooms (school_id, grade_level, class_name, class_code, classroom_uid)
          values ($1, $2, $3, $4, $5)
          returning
            id,
            school_id,
            grade_level,
            class_name,
            class_code,
            class_code_enabled,
            region_code,
            stage_code,
            grade_number,
            class_number,
            classroom_uid
        `,
        [schoolId, normalizedGrade, normalizedClass, nextClassCode, nextClassroomUid]
      );

      if (record) {
        return record;
      }
    } catch (error) {
      if (
        isUniqueViolation(error, [
          'idx_school_classrooms_class_code',
          'idx_school_classrooms_classroom_uid',
        ])
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to create classroom');
}

async function findDuplicateClassroom(
  client: PoolClient,
  input: {
    schoolId: number;
    gradeLevel: string;
    className: string;
    excludeId?: number;
  }
): Promise<{ id: number } | null> {
  const normalizedGrade = normalizeText(input.gradeLevel);
  const normalizedClass = normalizeText(input.className);

  return queryOneWithClient<{ id: number }>(
    client,
    `
      select id
      from school_classrooms
      where school_id = $1
        and lower(btrim(grade_level)) = lower($2)
        and lower(btrim(class_name)) = lower($3)
        and ($4::int is null or id <> $4)
      limit 1
    `,
    [input.schoolId, normalizedGrade, normalizedClass, input.excludeId || null]
  );
}

async function syncClassroomDenormalizedFieldsWithClient(
  client: PoolClient,
  classroomId: number,
  schoolId: number,
  schoolName: string,
  gradeLevel: string,
  className: string
): Promise<void> {
  await queryWithClient(
    client,
    `
      update students
      set
        school = $2,
        school_id = $3,
        grade_level = $4,
        class_name = $5,
        updated_at = now()
      where school_classroom_id = $1
    `,
    [classroomId, schoolName, schoolId, gradeLevel, className]
  );

  await queryWithClient(
    client,
    `
      update teachers
      set
        school = $2,
        school_id = $3,
        grade_level = $4,
        updated_at = now()
      where primary_school_classroom_id = $1
    `,
    [classroomId, schoolName, schoolId, gradeLevel]
  );

  const teacherCapabilityAssignmentsTable = await queryOneWithClient<{
    relation_name: string | null;
  }>(
    client,
    `
      select to_regclass('public.teacher_capability_assignments')::text as relation_name
    `
  );

  if (teacherCapabilityAssignmentsTable?.relation_name) {
    await queryWithClient(
      client,
      `
        update teacher_capability_assignments
        set school_id = $2
        where school_classroom_id = $1
      `,
      [classroomId, schoolId]
    );
  }
}

async function cleanupSchoolIfUnused(client: PoolClient, schoolId: number): Promise<void> {
  await queryWithClient(
    client,
    `
      delete from schools
      where id = $1
        and not exists (
          select 1
          from school_classrooms
          where school_id = $1
        )
    `,
    [schoolId]
  );
}

export async function attachTeacherToSchoolClassroom(input: {
  userId: string;
  school: string;
  gradeLevel: string;
  className: string;
  name: string;
  subject?: string;
  classCode?: string;
  client?: PoolClient;
}) {
  await ensureSchoolClassroomTables();

  const run = async (client: PoolClient) => {
    const existingClassroom = input.classCode
      ? await resolveClassroomByCode(client, input.classCode)
      : null;
    if (input.classCode && !existingClassroom) {
      throw new Error('Classroom code not found');
    }
    const school = existingClassroom
      ? { id: existingClassroom.school_id, name: existingClassroom.school_name }
      : await getOrCreateSchool(client, input.school);
    const classroom = existingClassroom
      ? existingClassroom
      : await createClassroom(client, school.id, input.gradeLevel, input.className);

    await queryWithClient(
      client,
      `
        insert into teachers (user_id, name, school, subject, grade_level, school_id, primary_school_classroom_id)
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (user_id)
        do update set
          name = excluded.name,
          school = excluded.school,
          subject = excluded.subject,
          grade_level = excluded.grade_level,
          school_id = excluded.school_id,
          primary_school_classroom_id = excluded.primary_school_classroom_id,
          updated_at = now()
      `,
      [
        input.userId,
        input.name,
        school.name,
        normalizeText(input.subject) || null,
        classroom.grade_level,
        school.id,
        classroom.id,
      ]
    );

    await queryWithClient(
      client,
      `
        insert into teacher_school_classrooms (teacher_user_id, school_classroom_id, is_primary)
        values ($1, $2, true)
        on conflict (teacher_user_id, school_classroom_id)
        do nothing
      `,
      [input.userId, classroom.id]
    );

    await queryWithClient(
      client,
      `
        update teacher_school_classrooms
        set is_primary = false
        where teacher_user_id = $1
      `,
      [input.userId]
    );

    await queryWithClient(
      client,
      `
        update teacher_school_classrooms
        set is_primary = true
        where teacher_user_id = $1
          and school_classroom_id = $2
      `,
      [input.userId, classroom.id]
    );

    return { school, classroom };
  };

  if (input.client) {
    return run(input.client);
  }

  return withTransaction(run);
}

export async function attachStudentToSchoolClassroom(input: {
  userId: string;
  school: string;
  gradeLevel: string;
  className: string;
  name: string;
  classCode?: string;
  client?: PoolClient;
}) {
  await ensureSchoolClassroomTables();

  const run = async (client: PoolClient) => {
    const existingClassroom = input.classCode
      ? await resolveClassroomByCode(client, input.classCode)
      : null;
    if (input.classCode && !existingClassroom) {
      throw new Error('Classroom code not found');
    }
    const school = existingClassroom
      ? { id: existingClassroom.school_id, name: existingClassroom.school_name }
      : await getOrCreateSchool(client, input.school);
    const classroom = existingClassroom
      ? existingClassroom
      : await createClassroom(client, school.id, input.gradeLevel, input.className);

    await queryWithClient(
      client,
      `
        insert into students (user_id, name, school, class_name, grade_level, school_id, school_classroom_id)
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (user_id)
        do update set
          name = excluded.name,
          school = excluded.school,
          class_name = excluded.class_name,
          grade_level = excluded.grade_level,
          school_id = excluded.school_id,
          school_classroom_id = excluded.school_classroom_id,
          updated_at = now()
      `,
      [
        input.userId,
        input.name,
        school.name,
        classroom.class_name,
        classroom.grade_level,
        school.id,
        classroom.id,
      ]
    );

    return { school, classroom };
  };

  if (input.client) {
    return run(input.client);
  }

  return withTransaction(run);
}

export async function resolvePrimaryTeacherForStudent(studentUserId: string): Promise<string | null> {
  await ensureSchoolClassroomTables();

  const results = await query<{ teacher_user_id: string }>(
    `
      select distinct tsc.teacher_user_id
      from students s
      join teacher_school_classrooms tsc on tsc.school_classroom_id = s.school_classroom_id
      where s.user_id = $1
      order by tsc.teacher_user_id asc
      limit 1
    `,
    [studentUserId]
  );

  return results[0]?.teacher_user_id || null;
}

async function getTeacherPrimaryClassroomRow(
  teacherUserId: string,
  client?: PoolClient
): Promise<{
  id: number;
  school_name: string;
  grade_level: string;
  class_name: string;
  class_code: string;
  class_code_enabled: boolean;
  region_code: string | null;
  stage_code: string | null;
  grade_number: number | null;
  class_number: number | null;
} | null> {
  const sql = `
    select
      classrooms.id,
      schools.name as school_name,
      classrooms.grade_level,
      classrooms.class_name,
      classrooms.class_code,
      classrooms.class_code_enabled,
      classrooms.region_code,
      classrooms.stage_code,
      classrooms.grade_number,
      classrooms.class_number
    from teacher_school_classrooms teacher_links
    join school_classrooms classrooms
      on classrooms.id = teacher_links.school_classroom_id
    join schools
      on schools.id = classrooms.school_id
    where teacher_links.teacher_user_id = $1
      and teacher_links.is_primary = true
    order by teacher_links.id asc
    limit 1
  `;

  if (client) {
    return queryOneWithClient<{
      id: number;
      school_name: string;
      grade_level: string;
      class_name: string;
      class_code: string;
      class_code_enabled: boolean;
      region_code: string | null;
      stage_code: string | null;
      grade_number: number | null;
      class_number: number | null;
    }>(client, sql, [teacherUserId]);
  }

  return queryOne<{
    id: number;
    school_name: string;
    grade_level: string;
    class_name: string;
    class_code: string;
    class_code_enabled: boolean;
    region_code: string | null;
    stage_code: string | null;
    grade_number: number | null;
    class_number: number | null;
  }>(sql, [teacherUserId]);
}

async function getClassroomDirectoryRowById(
  classroomId: number,
  client?: PoolClient
): Promise<{
  id: number;
  school_name: string;
  grade_level: string;
  class_name: string;
  class_code: string;
  class_code_enabled: boolean;
} | null> {
  const sql = `
    select
      classrooms.id,
      schools.name as school_name,
      classrooms.grade_level,
      classrooms.class_name,
      classrooms.class_code,
      classrooms.class_code_enabled
    from school_classrooms classrooms
    join schools
      on schools.id = classrooms.school_id
    where classrooms.id = $1
    limit 1
  `;

  if (client) {
    return queryOneWithClient<{
      id: number;
      school_name: string;
      grade_level: string;
      class_name: string;
      class_code: string;
      class_code_enabled: boolean;
    }>(client, sql, [classroomId]);
  }

  return queryOne<{
    id: number;
    school_name: string;
    grade_level: string;
    class_name: string;
    class_code: string;
    class_code_enabled: boolean;
  }>(sql, [classroomId]);
}

async function buildTeacherCurrentClassroomSummary(
  teacherUserId: string,
  client?: PoolClient
): Promise<TeacherCurrentClassroomSummary | null> {
  const classroom = await getTeacherPrimaryClassroomRow(teacherUserId, client);

  if (!classroom) {
    return null;
  }

  const students = client
    ? await queryWithClient<{
        user_id: string;
        name: string;
      }>(
        client,
        `
          select
            user_id,
            name
          from students
          where school_classroom_id = $1
          order by name asc, id asc
        `,
        [classroom.id]
      )
    : await query<{
        user_id: string;
        name: string;
      }>(
        `
          select
            user_id,
            name
          from students
          where school_classroom_id = $1
          order by name asc, id asc
        `,
        [classroom.id]
      );

  return {
    id: classroom.id,
    schoolName: classroom.school_name,
    gradeLevel: classroom.grade_level,
    className: classroom.class_name,
    classCode: classroom.class_code,
    classCodeEnabled: classroom.class_code_enabled,
    classCodeStatus: toClassCodeStatus(classroom.class_code_enabled),
    studentCount: students.length,
    students: students.map((student) => ({
      userId: student.user_id,
      name: student.name,
    })),
  };
}

async function buildClassroomDirectoryRecordById(
  classroomId: number,
  client?: PoolClient
): Promise<ClassroomDirectoryRecord | null> {
  const classroom = await getClassroomDirectoryRowById(classroomId, client);
  if (!classroom) {
    return null;
  }

  const teachers = client
    ? await queryWithClient<{
        user_id: string;
        name: string;
      }>(
        client,
        `
          select
            teachers.user_id,
            teachers.name
          from teacher_school_classrooms teacher_links
          join teachers
            on teachers.user_id = teacher_links.teacher_user_id
          where teacher_links.school_classroom_id = $1
          order by teachers.name asc
        `,
        [classroomId]
      )
    : await query<{
        user_id: string;
        name: string;
      }>(
        `
          select
            teachers.user_id,
            teachers.name
          from teacher_school_classrooms teacher_links
          join teachers
            on teachers.user_id = teacher_links.teacher_user_id
          where teacher_links.school_classroom_id = $1
          order by teachers.name asc
        `,
        [classroomId]
      );

  const studentCountResult = client
    ? await queryOneWithClient<{ count: string }>(
        client,
        `
          select count(*)::text as count
          from students
          where school_classroom_id = $1
        `,
        [classroomId]
      )
    : await queryOne<{ count: string }>(
        `
          select count(*)::text as count
          from students
          where school_classroom_id = $1
        `,
        [classroomId]
      );

  return {
    id: classroom.id,
    schoolName: classroom.school_name,
    gradeLevel: classroom.grade_level,
    className: classroom.class_name,
    classCode: classroom.class_code,
    classCodeEnabled: classroom.class_code_enabled,
    classCodeStatus: toClassCodeStatus(classroom.class_code_enabled),
    teacherCount: teachers.length,
    studentCount: Number(studentCountResult?.count || 0),
    teachers: teachers.map((teacher) => ({
      userId: teacher.user_id,
      name: teacher.name,
    })),
  };
}

export async function getTeacherCurrentClassroomSummary(
  teacherUserId: string
): Promise<TeacherCurrentClassroomSummary | null> {
  await ensureSchoolClassroomTables();
  return buildTeacherCurrentClassroomSummary(teacherUserId);
}

export async function getTeacherCurrentClassroomRoster(
  teacherUserId: string,
  options?: {
    query?: string | null;
  }
): Promise<TeacherCurrentClassroomRoster | null> {
  await ensureSchoolClassroomTables();

  const classroom = await getTeacherPrimaryClassroomRow(teacherUserId);

  if (!classroom) {
    return null;
  }

  const normalizedQuery = normalizeText(options?.query);
  const submissionsTable = await queryOne<{ relation_name: string | null }>(
    `
      select to_regclass('public.student_assignment_submissions')::text as relation_name
    `
  );

  const students: TeacherCurrentClassroomRosterStudentRecord[] = submissionsTable?.relation_name
    ? (
        await query<TeacherCurrentClassroomRosterStudentWithStatsRow>(
        `
          with submission_stats as (
            select
              submissions.student_id,
              count(*) filter (where submissions.is_completed = true)::int as total,
              count(*) filter (
                where submissions.is_completed = true
                  and submissions.review_status = 'pending'
              )::int as pending,
              count(*) filter (
                where submissions.is_completed = true
                  and submissions.review_status = 'approved'
              )::int as approved,
              count(*) filter (
                where submissions.is_completed = true
                  and submissions.review_status = 'rejected'
              )::int as rejected,
              max(
                coalesce(submissions.completed_at, submissions.updated_at, submissions.created_at)
              ) filter (where submissions.is_completed = true) as "lastSubmittedAt"
            from student_assignment_submissions submissions
            where submissions.teacher_auth_user_id = $2
            group by submissions.student_id
          )
          select
            students.user_id as "userId",
            students.name,
            auth_users.email,
            auth_users.phone,
            coalesce(submission_stats.total, 0) as total,
            coalesce(submission_stats.pending, 0) as pending,
            coalesce(submission_stats.approved, 0) as approved,
            coalesce(submission_stats.rejected, 0) as rejected,
            submission_stats."lastSubmittedAt"
          from students
          left join auth_users
            on auth_users.id = students.user_id
          left join submission_stats
            on submission_stats.student_id = students.user_id
          where students.school_classroom_id = $1
            and (
              $3 = ''
              or students.name ilike '%' || $3 || '%'
              or coalesce(auth_users.phone, '') ilike '%' || $3 || '%'
              or coalesce(auth_users.email, '') ilike '%' || $3 || '%'
            )
          order by students.name asc, students.id asc
        `,
        [classroom.id, teacherUserId, normalizedQuery]
      )
      ).map((student) => ({
        userId: student.userId,
        name: student.name,
        email: student.email || '',
        phone: student.phone || '',
        submissionStats: {
          total: student.total,
          pending: student.pending,
          approved: student.approved,
          rejected: student.rejected,
          lastSubmittedAt: student.lastSubmittedAt,
        },
      }))
    : (
        await query<TeacherCurrentClassroomRosterStudentRow>(
        `
          select
            students.user_id as "userId",
            students.name,
            auth_users.email,
            auth_users.phone
          from students
          left join auth_users
            on auth_users.id = students.user_id
          where students.school_classroom_id = $1
            and (
              $2 = ''
              or students.name ilike '%' || $2 || '%'
              or coalesce(auth_users.phone, '') ilike '%' || $2 || '%'
              or coalesce(auth_users.email, '') ilike '%' || $2 || '%'
            )
          order by students.name asc, students.id asc
        `,
        [classroom.id, normalizedQuery]
      )
      ).map((student) => ({
        userId: student.userId,
        name: student.name,
        email: student.email || '',
        phone: student.phone || '',
        submissionStats: {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          lastSubmittedAt: null,
        },
      }));

  return {
    id: classroom.id,
    schoolName: classroom.school_name,
    gradeLevel: classroom.grade_level,
    className: classroom.class_name,
    classCode: classroom.class_code,
    classCodeEnabled: classroom.class_code_enabled,
    classCodeStatus: toClassCodeStatus(classroom.class_code_enabled),
    studentCount: students.length,
    students,
  };
}

export async function listClassroomDirectory(): Promise<ClassroomDirectoryRecord[]> {
  await ensureSchoolClassroomTables();

  const classrooms = await query<{
    id: number;
    school_name: string;
    grade_level: string;
    class_name: string;
    class_code: string;
    class_code_enabled: boolean;
  }>(
    `
      select
        classrooms.id,
        schools.name as school_name,
        classrooms.grade_level,
        classrooms.class_name,
        classrooms.class_code,
        classrooms.class_code_enabled
      from school_classrooms classrooms
      join schools
        on schools.id = classrooms.school_id
      order by schools.name asc, classrooms.grade_level asc, classrooms.class_name asc
    `
  );

  const [teachers, students] = await Promise.all([
    query<{
      classroom_id: number;
      user_id: string;
      name: string;
    }>(
      `
        select
          teacher_links.school_classroom_id as classroom_id,
          teachers.user_id,
          teachers.name
        from teacher_school_classrooms teacher_links
        join teachers
          on teachers.user_id = teacher_links.teacher_user_id
        order by teachers.name asc
      `
    ),
    query<{
      classroom_id: number;
      user_id: string;
      name: string;
    }>(
      `
        select
          school_classroom_id as classroom_id,
          user_id,
          name
        from students
        where school_classroom_id is not null
        order by name asc
      `
    ),
  ]);

  const teacherMap = new Map<number, Array<{ userId: string; name: string }>>();
  const studentCountMap = new Map<number, number>();

  for (const teacher of teachers) {
    const current = teacherMap.get(teacher.classroom_id) || [];
    current.push({ userId: teacher.user_id, name: teacher.name });
    teacherMap.set(teacher.classroom_id, current);
  }

  for (const student of students) {
    studentCountMap.set(student.classroom_id, (studentCountMap.get(student.classroom_id) || 0) + 1);
  }

  return classrooms.map((classroom) => ({
    id: classroom.id,
    schoolName: classroom.school_name,
    gradeLevel: classroom.grade_level,
    className: classroom.class_name,
    classCode: classroom.class_code,
    classCodeEnabled: classroom.class_code_enabled,
    classCodeStatus: toClassCodeStatus(classroom.class_code_enabled),
    teacherCount: (teacherMap.get(classroom.id) || []).length,
    studentCount: studentCountMap.get(classroom.id) || 0,
    teachers: teacherMap.get(classroom.id) || [],
  }));
}

export async function createClassroomByAdmin(
  input: AdminClassroomMutationInput
): Promise<ClassroomDirectoryRecord> {
  await ensureSchoolClassroomTables();

  return withTransaction(async (client) => {
    const school = await getOrCreateSchool(client, input.schoolName);
    const normalizedGrade = normalizeText(input.gradeLevel);
    const normalizedClass = normalizeText(input.className);

    if (!normalizedGrade || !normalizedClass) {
      throw new Error('Grade level and class name are required');
    }

    const duplicate = await findDuplicateClassroom(client, {
      schoolId: school.id,
      gradeLevel: normalizedGrade,
      className: normalizedClass,
    });

    if (duplicate) {
      throw new Error('Classroom already exists');
    }

    const classroom = await createClassroom(client, school.id, normalizedGrade, normalizedClass);
    const record = await buildClassroomDirectoryRecordById(classroom.id, client);

    if (!record) {
      throw new Error('Failed to create classroom');
    }

    return record;
  });
}

export async function updateClassroomById(
  classroomId: number,
  input: AdminClassroomMutationInput
): Promise<ClassroomDirectoryRecord> {
  await ensureSchoolClassroomTables();

  return withTransaction(async (client) => {
    const currentClassroom = await queryOneWithClient<{
      id: number;
      school_id: number;
    }>(
      client,
      `
        select id, school_id
        from school_classrooms
        where id = $1
        limit 1
      `,
      [classroomId]
    );

    if (!currentClassroom) {
      throw new Error('Classroom not found');
    }

    const school = await getOrCreateSchool(client, input.schoolName);
    const normalizedGrade = normalizeText(input.gradeLevel);
    const normalizedClass = normalizeText(input.className);

    if (!normalizedGrade || !normalizedClass) {
      throw new Error('Grade level and class name are required');
    }

    const duplicate = await findDuplicateClassroom(client, {
      schoolId: school.id,
      gradeLevel: normalizedGrade,
      className: normalizedClass,
      excludeId: classroomId,
    });

    if (duplicate) {
      throw new Error('Classroom already exists');
    }

    const updated = await queryOneWithClient<{ id: number }>(
      client,
      `
        update school_classrooms
        set
          school_id = $2,
          grade_level = $3,
          class_name = $4
        where id = $1
        returning id
      `,
      [classroomId, school.id, normalizedGrade, normalizedClass]
    );

    if (!updated) {
      throw new Error('Classroom not found');
    }

    await syncClassroomDenormalizedFieldsWithClient(
      client,
      classroomId,
      school.id,
      school.name,
      normalizedGrade,
      normalizedClass
    );
    await cleanupSchoolIfUnused(client, currentClassroom.school_id);

    const record = await buildClassroomDirectoryRecordById(classroomId, client);
    if (!record) {
      throw new Error('Classroom not found');
    }

    return record;
  });
}

export async function deleteClassroomById(classroomId: number): Promise<void> {
  await ensureSchoolClassroomTables();

  await withTransaction(async (client) => {
    const classroom = await queryOneWithClient<{
      id: number;
      school_id: number;
    }>(
      client,
      `
        select id, school_id
        from school_classrooms
        where id = $1
        limit 1
      `,
      [classroomId]
    );

    if (!classroom) {
      throw new Error('Classroom not found');
    }

    const counts = await queryOneWithClient<{
      teacher_count: string;
      student_count: string;
    }>(
      client,
      `
        select
          (select count(*)::text from teachers where primary_school_classroom_id = $1) as teacher_count,
          (select count(*)::text from students where school_classroom_id = $1) as student_count
      `,
      [classroomId]
    );

    if (Number(counts?.teacher_count || 0) > 0 || Number(counts?.student_count || 0) > 0) {
      throw new Error('Classroom has members');
    }

    await queryWithClient(
      client,
      `
        delete from school_classrooms
        where id = $1
      `,
      [classroomId]
    );

    await cleanupSchoolIfUnused(client, classroom.school_id);
  });
}

async function rotateClassroomCodeWithClient(
  client: PoolClient,
  classroomId: number
): Promise<ClassroomDirectoryRecord> {
  const nextClassCode = await generateUniqueClassCode(client);
  const updated = await queryOneWithClient<{ id: number }>(
    client,
    `
      update school_classrooms
      set
        class_code = $2,
        class_code_enabled = true
      where id = $1
      returning id
    `,
    [classroomId, nextClassCode]
  );

  if (!updated) {
    throw new Error('Classroom not found');
  }

  const classroom = await buildClassroomDirectoryRecordById(classroomId, client);
  if (!classroom) {
    throw new Error('Classroom not found');
  }

  return classroom;
}

async function setClassroomCodeEnabledWithClient(
  client: PoolClient,
  classroomId: number,
  enabled: boolean
): Promise<ClassroomDirectoryRecord> {
  const updated = await queryOneWithClient<{ id: number }>(
    client,
    `
      update school_classrooms
      set class_code_enabled = $2
      where id = $1
      returning id
    `,
    [classroomId, enabled]
  );

  if (!updated) {
    throw new Error('Classroom not found');
  }

  const classroom = await buildClassroomDirectoryRecordById(classroomId, client);
  if (!classroom) {
    throw new Error('Classroom not found');
  }

  return classroom;
}

async function mergeClassroomsWithClient(
  client: PoolClient,
  sourceClassroomId: number,
  targetClassroom: ClassroomWithSchoolRecord
): Promise<void> {
  if (sourceClassroomId === targetClassroom.id) {
    return;
  }

  await queryWithClient(
    client,
    `
      update students
      set
        school = $2,
        class_name = $3,
        grade_level = $4,
        school_id = $5,
        school_classroom_id = $6,
        updated_at = now()
      where school_classroom_id = $1
    `,
    [
      sourceClassroomId,
      targetClassroom.school_name,
      targetClassroom.class_name,
      targetClassroom.grade_level,
      targetClassroom.school_id,
      targetClassroom.id,
    ]
  );

  await queryWithClient(
    client,
    `
      update teachers
      set
        school = $2,
        grade_level = $3,
        school_id = $4,
        primary_school_classroom_id = $5,
        updated_at = now()
      where primary_school_classroom_id = $1
    `,
    [
      sourceClassroomId,
      targetClassroom.school_name,
      targetClassroom.grade_level,
      targetClassroom.school_id,
      targetClassroom.id,
    ]
  );

  await queryWithClient(
    client,
    `
      insert into teacher_school_classrooms (teacher_user_id, school_classroom_id, is_primary)
      select
        teacher_user_id,
        $2,
        bool_or(is_primary) as is_primary
      from teacher_school_classrooms
      where school_classroom_id = $1
      group by teacher_user_id
      on conflict (teacher_user_id, school_classroom_id)
      do update set
        is_primary = teacher_school_classrooms.is_primary or excluded.is_primary
    `,
    [sourceClassroomId, targetClassroom.id]
  );

  await queryWithClient(
    client,
    `
      delete from teacher_school_classrooms
      where school_classroom_id = $1
    `,
    [sourceClassroomId]
  );

  const teacherCapabilityAssignmentsTable = await queryOneWithClient<{
    relation_name: string | null;
  }>(
    client,
    `
      select to_regclass('public.teacher_capability_assignments')::text as relation_name
    `
  );

  if (teacherCapabilityAssignmentsTable?.relation_name) {
    await queryWithClient(
      client,
      `
        update teacher_capability_assignments
        set school_classroom_id = $2
        where school_classroom_id = $1
      `,
      [sourceClassroomId, targetClassroom.id]
    );
  }

  await queryWithClient(
    client,
    `
      delete from school_classrooms
      where id = $1
    `,
    [sourceClassroomId]
  );
}

export async function rotateTeacherCurrentClassroomCode(
  teacherUserId: string
): Promise<TeacherCurrentClassroomSummary | null> {
  await ensureSchoolClassroomTables();

  return withTransaction(async (client) => {
    const classroom = await getTeacherPrimaryClassroomRow(teacherUserId, client);
    if (!classroom) {
      return null;
    }

    await assignGeneratedClassCodeToClassroom(client, classroom.id);

    return buildTeacherCurrentClassroomSummary(teacherUserId, client);
  });
}

export async function setTeacherCurrentClassCode(
  teacherUserId: string,
  classCode: string
): Promise<TeacherCurrentClassroomSummary | null> {
  await ensureSchoolClassroomTables();

  const normalizedCode = normalizeClassCode(classCode);
  if (!isManagedClassCode(normalizedCode)) {
    throw new Error('Invalid classroom code format');
  }

  return withTransaction(async (client) => {
    const currentClassroom = await getTeacherPrimaryClassroomRow(teacherUserId, client);
    if (!currentClassroom) {
      return null;
    }

    const targetClassroom = await resolveClassroomByCode(client, normalizedCode);

    if (targetClassroom && targetClassroom.id !== currentClassroom.id) {
      await mergeClassroomsWithClient(client, currentClassroom.id, targetClassroom);

      return buildTeacherCurrentClassroomSummary(teacherUserId, client);
    }

    try {
      await queryWithClient(
        client,
        `
          update school_classrooms
          set
            class_code = $2,
            class_code_enabled = true
          where id = $1
        `,
        [currentClassroom.id, normalizedCode]
      );
    } catch (error) {
      if (isUniqueViolation(error, ['idx_school_classrooms_class_code'])) {
        const refreshedTargetClassroom = await resolveClassroomByCode(client, normalizedCode);

        if (refreshedTargetClassroom && refreshedTargetClassroom.id !== currentClassroom.id) {
          await mergeClassroomsWithClient(
            client,
            currentClassroom.id,
            refreshedTargetClassroom
          );

          return buildTeacherCurrentClassroomSummary(teacherUserId, client);
        }
      }

      throw error;
    }

    return buildTeacherCurrentClassroomSummary(teacherUserId, client);
  });
}

export async function setTeacherCurrentClassroomCodeEnabled(
  teacherUserId: string,
  enabled: boolean
): Promise<TeacherCurrentClassroomSummary | null> {
  await ensureSchoolClassroomTables();

  return withTransaction(async (client) => {
    const classroom = await getTeacherPrimaryClassroomRow(teacherUserId, client);
    if (!classroom) {
      return null;
    }

    await queryWithClient(
      client,
      `
        update school_classrooms
        set class_code_enabled = $2
        where id = $1
      `,
      [classroom.id, enabled]
    );

    return buildTeacherCurrentClassroomSummary(teacherUserId, client);
  });
}

export async function rotateClassroomCodeById(
  classroomId: number
): Promise<ClassroomDirectoryRecord> {
  await ensureSchoolClassroomTables();

  return withTransaction((client) => rotateClassroomCodeWithClient(client, classroomId));
}

export async function setClassroomCodeEnabledById(
  classroomId: number,
  enabled: boolean
): Promise<ClassroomDirectoryRecord> {
  await ensureSchoolClassroomTables();

  return withTransaction((client) => setClassroomCodeEnabledWithClient(client, classroomId, enabled));
}

export async function listStudentClassroomMemberships(): Promise<StudentClassroomMembershipRecord[]> {
  await ensureSchoolClassroomTables();

  return query<StudentClassroomMembershipRecord>(
    `
      select
        students.user_id as "userId",
        students.name,
        schools.name as "schoolName",
        classrooms.grade_level as "gradeLevel",
        classrooms.class_name as "className",
        classrooms.class_code as "classCode"
      from students
      join school_classrooms classrooms
        on classrooms.id = students.school_classroom_id
      join schools
        on schools.id = classrooms.school_id
      order by schools.name asc, classrooms.grade_level asc, classrooms.class_name asc, students.name asc
    `
  );
}

export async function listTeacherClassroomMemberships(): Promise<TeacherClassroomMembershipRecord[]> {
  await ensureSchoolClassroomTables();

  return query<TeacherClassroomMembershipRecord>(
    `
      select
        teachers.user_id as "userId",
        teachers.name,
        teachers.subject,
        schools.name as "schoolName",
        classrooms.grade_level as "gradeLevel",
        classrooms.class_name as "className",
        classrooms.class_code as "classCode"
      from teachers
      join school_classrooms classrooms
        on classrooms.id = teachers.primary_school_classroom_id
      join schools
        on schools.id = classrooms.school_id
      order by schools.name asc, classrooms.grade_level asc, classrooms.class_name asc, teachers.name asc
    `
  );
}

export async function reassignStudentToClassroom(params: {
  studentUserId: string;
  classCode: string;
}) {
  await ensureSchoolClassroomTables();

  return withTransaction(async (client) => {
    const classroom = await resolveClassroomByCode(client, params.classCode);
    if (!classroom) {
      throw new Error('Classroom code not found');
    }

    const updated = await queryOneWithClient<{
      userId: string;
      name: string;
    }>(
      client,
      `
        update students
        set
          school = $2,
          class_name = $3,
          grade_level = $4,
          school_id = $5,
          school_classroom_id = $6,
          updated_at = now()
        where user_id = $1
        returning
          user_id as "userId",
          name
      `,
      [
        params.studentUserId,
        classroom.school_name,
        classroom.class_name,
        classroom.grade_level,
        classroom.school_id,
        classroom.id,
      ]
    );

    if (!updated) {
      throw new Error('Student not found');
    }

    return updated;
  });
}

export async function reassignTeacherToClassroom(params: {
  teacherUserId: string;
  classCode: string;
}) {
  await ensureSchoolClassroomTables();

  return withTransaction(async (client) => {
    const classroom = await resolveClassroomByCode(client, params.classCode);
    if (!classroom) {
      throw new Error('Classroom code not found');
    }

    const updated = await queryOneWithClient<{
      userId: string;
      name: string;
    }>(
      client,
      `
        update teachers
        set
          school = $2,
          grade_level = $3,
          school_id = $4,
          primary_school_classroom_id = $5,
          updated_at = now()
        where user_id = $1
        returning
          user_id as "userId",
          name
      `,
      [
        params.teacherUserId,
        classroom.school_name,
        classroom.grade_level,
        classroom.school_id,
        classroom.id,
      ]
    );

    if (!updated) {
      throw new Error('Teacher not found');
    }

    await queryWithClient(
      client,
      `
        delete from teacher_school_classrooms
        where teacher_user_id = $1
      `,
      [params.teacherUserId]
    );

    await queryWithClient(
      client,
      `
        insert into teacher_school_classrooms (teacher_user_id, school_classroom_id, is_primary)
        values ($1, $2, true)
      `,
      [params.teacherUserId, classroom.id]
    );

    return updated;
  });
}
