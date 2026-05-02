import 'server-only';

import {
  query,
  queryOne,
  queryOneWithClient,
  withTransaction,
} from '@/lib/db';

export interface TeacherCapabilityDefinition {
  id: number;
  key: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TeacherCapabilitySnapshotItem extends TeacherCapabilityDefinition {
  assigned: boolean;
  assignmentId: number | null;
  assignedAt: string | null;
  assignedByUserId: string | null;
  scopeLevel: TeacherCapabilityScopeLevel | null;
  schoolId: number | null;
  schoolName: string | null;
  schoolClassroomId: number | null;
  className: string | null;
  classCode: string | null;
}

export type TeacherCapabilityScopeLevel = 'platform' | 'school' | 'school_classroom';

export interface TeacherCapabilityTeacherSummary {
  userId: string;
  name: string;
  subject: string | null;
  school: string | null;
  schoolId: number | null;
  gradeLevel: string | null;
  className: string | null;
  classCode: string | null;
  primarySchoolClassroomId: number | null;
}

export interface TeacherCapabilitySnapshot {
  teacher: TeacherCapabilityTeacherSummary;
  capabilities: TeacherCapabilitySnapshotItem[];
}

export interface TeacherCapabilityAssignmentRecord {
  id: number;
  teacherUserId: string;
  capabilityId: number;
  capabilityKey: string;
  assignedAt: string;
  assignedByUserId: string | null;
  scopeLevel: TeacherCapabilityScopeLevel;
  schoolId: number | null;
  schoolClassroomId: number | null;
}

const DEFAULT_TEACHER_CAPABILITIES = [
  {
    key: 'teaching-researcher',
    name: '教研员',
    description: '参与课程教研、教学设计与教法共研。',
    sortOrder: 10,
  },
  {
    key: 'reviewer',
    name: '评审员',
    description: '参与课程、资源或成果的评审工作。',
    sortOrder: 20,
  },
  {
    key: 'demo-teacher',
    name: '示范课老师',
    description: '承担示范课展示、公开课示范与经验分享。',
    sortOrder: 30,
  },
  {
    key: 'resource-co-builder',
    name: '资源共建老师',
    description: '参与教学资源共建、整理与优化。',
    sortOrder: 40,
  },
  {
    key: 'mentor',
    name: '指导老师',
    description: '承担教师指导、陪伴支持与经验传递。',
    sortOrder: 50,
  },
] as const;

type TeacherSummaryRow = {
  userId: string;
  name: string;
  subject: string | null;
  school: string | null;
  schoolId: number | null;
  gradeLevel: string | null;
  className: string | null;
  classCode: string | null;
  primarySchoolClassroomId: number | null;
};

type CapabilitySnapshotRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  assignmentId: number | null;
  assignedAt: string | null;
  assignedByUserId: string | null;
  scopeLevel: TeacherCapabilityScopeLevel | null;
  schoolId: number | null;
  schoolName: string | null;
  schoolClassroomId: number | null;
  className: string | null;
  classCode: string | null;
};

type CapabilityDefinitionRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

let initialized = false;

function normalizeTeacherUserId(value: string): string {
  return value.trim();
}

function normalizeCapabilityKey(value: string): string {
  return value.trim().toLowerCase();
}

function mapDefinition(row: CapabilityDefinitionRow): TeacherCapabilityDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function mapAssignmentRecord(
  row: {
    id: number;
    teacherUserId: string;
    capabilityId: number;
    capabilityKey: string;
    assignedAt: string;
    assignedByUserId: string | null;
    scopeLevel: TeacherCapabilityScopeLevel;
    schoolId: number | null;
    schoolClassroomId: number | null;
  }
): TeacherCapabilityAssignmentRecord {
  return {
    id: row.id,
    teacherUserId: row.teacherUserId,
    capabilityId: row.capabilityId,
    capabilityKey: row.capabilityKey,
    assignedAt: row.assignedAt,
    assignedByUserId: row.assignedByUserId,
    scopeLevel: row.scopeLevel,
    schoolId: row.schoolId,
    schoolClassroomId: row.schoolClassroomId,
  };
}

async function seedDefaultTeacherCapabilities() {
  for (const capability of DEFAULT_TEACHER_CAPABILITIES) {
    await query(
      `
        insert into teacher_capability_definitions (
          capability_key,
          name,
          description,
          sort_order,
          is_active
        )
        values ($1, $2, $3, $4, true)
        on conflict (capability_key)
        do update set
          name = excluded.name,
          description = excluded.description,
          sort_order = excluded.sort_order,
          is_active = true,
          updated_at = now()
      `,
      [
        capability.key,
        capability.name,
        capability.description,
        capability.sortOrder,
      ]
    );
  }
}

async function getTeacherSummaryOrThrow(teacherUserId: string): Promise<TeacherCapabilityTeacherSummary> {
  const teacher = await queryOne<TeacherSummaryRow>(
    `
      select
        auth_users.id as "userId",
        coalesce(nullif(teachers.name, ''), nullif(auth_users.phone, ''), nullif(auth_users.email, ''), auth_users.id::text) as name,
        teachers.subject,
        teachers.school,
        teachers.school_id as "schoolId",
        teachers.grade_level as "gradeLevel",
        classrooms.class_name as "className",
        classrooms.class_code as "classCode",
        teachers.primary_school_classroom_id as "primarySchoolClassroomId"
      from auth_users
      left join teachers
        on teachers.user_id = auth_users.id
      left join school_classrooms classrooms
        on classrooms.id = teachers.primary_school_classroom_id
      where auth_users.id = $1
        and auth_users.role = 'teacher'
    `,
    [teacherUserId]
  );

  if (!teacher) {
    throw new Error('Teacher not found');
  }

  return teacher;
}

async function getCapabilityDefinitionOrThrow(capabilityKey: string): Promise<TeacherCapabilityDefinition> {
  const capability = await queryOne<CapabilityDefinitionRow>(
    `
      select
        id,
        capability_key as key,
        name,
        description,
        sort_order as "sortOrder",
        is_active as "isActive"
      from teacher_capability_definitions
      where capability_key = $1
        and is_active = true
    `,
    [capabilityKey]
  );

  if (!capability) {
    throw new Error('Capability not found');
  }

  return mapDefinition(capability);
}

export async function ensureTeacherCapabilityTables() {
  if (initialized) {
    return;
  }

  await query(`
    create table if not exists teacher_capability_definitions (
      id serial primary key,
      capability_key varchar(100) not null unique,
      name varchar(100) not null,
      description text not null default '',
      sort_order integer not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists teacher_capability_assignments (
      id serial primary key,
      teacher_user_id uuid not null references auth_users(id) on delete cascade,
      capability_id integer not null references teacher_capability_definitions(id) on delete cascade,
      scope_level varchar(32) not null default 'platform',
      school_id integer references schools(id) on delete set null,
      school_classroom_id integer references school_classrooms(id) on delete set null,
      assigned_by_user_id uuid references auth_users(id) on delete set null,
      assigned_at timestamptz not null default now(),
      revoked_by_user_id uuid references auth_users(id) on delete set null,
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    );

    alter table teacher_capability_definitions
      add column if not exists description text not null default '';

    alter table teacher_capability_definitions
      add column if not exists sort_order integer not null default 0;

    alter table teacher_capability_definitions
      add column if not exists is_active boolean not null default true;

    alter table teacher_capability_assignments
      add column if not exists scope_level varchar(32) not null default 'platform';

    alter table teacher_capability_assignments
      add column if not exists school_id integer references schools(id) on delete set null;

    alter table teacher_capability_assignments
      add column if not exists school_classroom_id integer references school_classrooms(id) on delete set null;

    alter table teacher_capability_assignments
      add column if not exists assigned_by_user_id uuid references auth_users(id) on delete set null;

    alter table teacher_capability_assignments
      add column if not exists revoked_by_user_id uuid references auth_users(id) on delete set null;

    alter table teacher_capability_assignments
      add column if not exists revoked_at timestamptz;

    create index if not exists idx_teacher_capability_definitions_active
      on teacher_capability_definitions (is_active, sort_order asc, id asc);

    create index if not exists idx_teacher_capability_assignments_teacher
      on teacher_capability_assignments (teacher_user_id, assigned_at desc, id desc);

    create unique index if not exists idx_teacher_capability_assignments_active_unique
      on teacher_capability_assignments (teacher_user_id, capability_id)
      where revoked_at is null;
  `);

  await seedDefaultTeacherCapabilities();
  initialized = true;
}

export async function listTeacherCapabilityDefinitions(): Promise<TeacherCapabilityDefinition[]> {
  await ensureTeacherCapabilityTables();

  const rows = await query<CapabilityDefinitionRow>(
    `
      select
        id,
        capability_key as key,
        name,
        description,
        sort_order as "sortOrder",
        is_active as "isActive"
      from teacher_capability_definitions
      where is_active = true
      order by sort_order asc, id asc
    `
  );

  return rows.map(mapDefinition);
}

export async function getTeacherCapabilitySnapshot(
  teacherUserId: string
): Promise<TeacherCapabilitySnapshot> {
  await ensureTeacherCapabilityTables();

  const normalizedTeacherUserId = normalizeTeacherUserId(teacherUserId);
  const teacher = await getTeacherSummaryOrThrow(normalizedTeacherUserId);
  const capabilityRows = await query<CapabilitySnapshotRow>(
    `
      select
        definitions.id,
        definitions.capability_key as key,
        definitions.name,
        definitions.description,
        definitions.sort_order as "sortOrder",
        definitions.is_active as "isActive",
        assignments.id as "assignmentId",
        assignments.assigned_at as "assignedAt",
        assignments.assigned_by_user_id as "assignedByUserId",
        assignments.scope_level as "scopeLevel",
        assignments.school_id as "schoolId",
        schools.name as "schoolName",
        assignments.school_classroom_id as "schoolClassroomId",
        classrooms.class_name as "className",
        classrooms.class_code as "classCode"
      from teacher_capability_definitions definitions
      left join teacher_capability_assignments assignments
        on assignments.capability_id = definitions.id
       and assignments.teacher_user_id = $1
       and assignments.revoked_at is null
      left join schools
        on schools.id = assignments.school_id
      left join school_classrooms classrooms
        on classrooms.id = assignments.school_classroom_id
      where definitions.is_active = true
      order by definitions.sort_order asc, definitions.id asc
    `,
    [normalizedTeacherUserId]
  );

  return {
    teacher,
    capabilities: capabilityRows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description || '',
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      assigned: Boolean(row.assignmentId),
      assignmentId: row.assignmentId,
      assignedAt: row.assignedAt,
      assignedByUserId: row.assignedByUserId,
      scopeLevel: row.scopeLevel,
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      schoolClassroomId: row.schoolClassroomId,
      className: row.className,
      classCode: row.classCode,
    })),
  };
}

export async function assignTeacherCapability(input: {
  teacherUserId: string;
  capabilityKey: string;
  assignedByUserId?: string | null;
  scopeLevel?: TeacherCapabilityScopeLevel;
  schoolId?: number | null;
  schoolClassroomId?: number | null;
}): Promise<{
  created: boolean;
  assignment: TeacherCapabilityAssignmentRecord;
  snapshot: TeacherCapabilitySnapshot;
}> {
  await ensureTeacherCapabilityTables();

  const teacherUserId = normalizeTeacherUserId(input.teacherUserId);
  const capabilityKey = normalizeCapabilityKey(input.capabilityKey);
  const scopeLevel = input.scopeLevel || 'platform';

  const result = await withTransaction(async (client) => {
    const teacher = await queryOneWithClient<TeacherSummaryRow>(
      client,
      `
        select
          auth_users.id as "userId",
          coalesce(nullif(teachers.name, ''), nullif(auth_users.phone, ''), nullif(auth_users.email, ''), auth_users.id::text) as name,
          teachers.subject,
          teachers.school,
          teachers.school_id as "schoolId",
          teachers.grade_level as "gradeLevel",
          classrooms.class_name as "className",
          classrooms.class_code as "classCode",
          teachers.primary_school_classroom_id as "primarySchoolClassroomId"
        from auth_users
        left join teachers
          on teachers.user_id = auth_users.id
        left join school_classrooms classrooms
          on classrooms.id = teachers.primary_school_classroom_id
        where auth_users.id = $1
          and auth_users.role = 'teacher'
      `,
      [teacherUserId]
    );

    if (!teacher) {
      throw new Error('Teacher not found');
    }

    const capability = await queryOneWithClient<{
      id: number;
    }>(
      client,
      `
        select id
        from teacher_capability_definitions
        where capability_key = $1
          and is_active = true
      `,
      [capabilityKey]
    );

    if (!capability) {
      throw new Error('Capability not found');
    }

    const resolvedSchoolId =
      scopeLevel === 'school' || scopeLevel === 'school_classroom'
        ? input.schoolId ?? teacher.schoolId
        : null;
    const resolvedSchoolClassroomId =
      scopeLevel === 'school_classroom'
        ? input.schoolClassroomId ?? teacher.primarySchoolClassroomId
        : null;

    if (scopeLevel === 'school' && !resolvedSchoolId) {
      throw new Error('School scope requires school');
    }

    if (scopeLevel === 'school_classroom' && !resolvedSchoolClassroomId) {
      throw new Error('Classroom scope requires classroom');
    }

    let assignment = await queryOneWithClient<{
      id: number;
      teacherUserId: string;
      capabilityId: number;
      capabilityKey: string;
      assignedAt: string;
      assignedByUserId: string | null;
      scopeLevel: TeacherCapabilityScopeLevel;
      schoolId: number | null;
      schoolClassroomId: number | null;
    }>(
      client,
      `
        select
          assignments.id,
          assignments.teacher_user_id as "teacherUserId",
          assignments.capability_id as "capabilityId",
          definitions.capability_key as "capabilityKey",
          assignments.assigned_at as "assignedAt",
          assignments.assigned_by_user_id as "assignedByUserId",
          assignments.scope_level as "scopeLevel",
          assignments.school_id as "schoolId",
          assignments.school_classroom_id as "schoolClassroomId"
        from teacher_capability_assignments assignments
        join teacher_capability_definitions definitions
          on definitions.id = assignments.capability_id
        where assignments.teacher_user_id = $1
          and assignments.capability_id = $2
          and assignments.revoked_at is null
      `,
      [teacherUserId, capability.id]
    );

    let created = false;

    if (!assignment) {
      try {
        assignment = await queryOneWithClient<{
          id: number;
          teacherUserId: string;
          capabilityId: number;
          capabilityKey: string;
          assignedAt: string;
          assignedByUserId: string | null;
          scopeLevel: TeacherCapabilityScopeLevel;
          schoolId: number | null;
          schoolClassroomId: number | null;
        }>(
          client,
          `
            insert into teacher_capability_assignments (
              teacher_user_id,
              capability_id,
              scope_level,
              school_id,
              school_classroom_id,
              assigned_by_user_id
            )
            values ($1, $2, $3, $4, $5, $6)
            returning
              id,
              teacher_user_id as "teacherUserId",
              capability_id as "capabilityId",
              $7::varchar as "capabilityKey",
              assigned_at as "assignedAt",
              assigned_by_user_id as "assignedByUserId",
              scope_level as "scopeLevel",
              school_id as "schoolId",
              school_classroom_id as "schoolClassroomId"
          `,
          [
            teacherUserId,
            capability.id,
            scopeLevel,
            resolvedSchoolId,
            resolvedSchoolClassroomId,
            input.assignedByUserId ?? null,
            capabilityKey,
          ]
        );
        created = true;
      } catch (error: any) {
        if (error?.code !== '23505') {
          throw error;
        }

        assignment = await queryOneWithClient<{
          id: number;
            teacherUserId: string;
            capabilityId: number;
            capabilityKey: string;
            assignedAt: string;
            assignedByUserId: string | null;
            scopeLevel: TeacherCapabilityScopeLevel;
            schoolId: number | null;
            schoolClassroomId: number | null;
          }>(
          client,
          `
            select
              assignments.id,
              assignments.teacher_user_id as "teacherUserId",
                  assignments.capability_id as "capabilityId",
                  definitions.capability_key as "capabilityKey",
                  assignments.assigned_at as "assignedAt",
                  assignments.assigned_by_user_id as "assignedByUserId",
                  assignments.scope_level as "scopeLevel",
                  assignments.school_id as "schoolId",
                  assignments.school_classroom_id as "schoolClassroomId"
                from teacher_capability_assignments assignments
            join teacher_capability_definitions definitions
              on definitions.id = assignments.capability_id
            where assignments.teacher_user_id = $1
              and assignments.capability_id = $2
              and assignments.revoked_at is null
          `,
          [teacherUserId, capability.id]
        );
      }
    }

    if (!assignment) {
      throw new Error('Failed to create assignment');
    }

    return {
      created,
      assignment: mapAssignmentRecord(assignment),
    };
  });

  const snapshot = await getTeacherCapabilitySnapshot(teacherUserId);
  return {
    ...result,
    snapshot,
  };
}

export async function revokeTeacherCapability(input: {
  teacherUserId: string;
  capabilityKey: string;
  revokedByUserId?: string | null;
}): Promise<{
  revoked: boolean;
  snapshot: TeacherCapabilitySnapshot;
}> {
  await ensureTeacherCapabilityTables();

  const teacherUserId = normalizeTeacherUserId(input.teacherUserId);
  const capabilityKey = normalizeCapabilityKey(input.capabilityKey);

  await getTeacherSummaryOrThrow(teacherUserId);
  const capability = await getCapabilityDefinitionOrThrow(capabilityKey);

  const revokedAssignment = await withTransaction(async (client) => {
    return queryOneWithClient<{ id: number }>(
      client,
      `
        update teacher_capability_assignments
        set
          revoked_at = now(),
          revoked_by_user_id = $3
        where teacher_user_id = $1
          and capability_id = $2
          and revoked_at is null
        returning id
      `,
      [teacherUserId, capability.id, input.revokedByUserId ?? null]
    );
  });

  const snapshot = await getTeacherCapabilitySnapshot(teacherUserId);
  return {
    revoked: Boolean(revokedAssignment),
    snapshot,
  };
}
