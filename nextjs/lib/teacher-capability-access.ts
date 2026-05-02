import 'server-only';

import type { AccessContext, AccessTeacherCapability } from '@/lib/access-context';
import { query } from '@/lib/db';

export interface ScopedTeacherTarget {
  userId: string;
  name: string;
  subject: string | null;
  schoolName: string | null;
  schoolId: number | null;
  gradeLevel: string | null;
  className: string | null;
  classCode: string | null;
  schoolClassroomId: number | null;
  isSelf: boolean;
}

type ScopedTeacherTargetRow = Omit<ScopedTeacherTarget, 'isSelf'>;

function normalizeCapabilityKey(value: string): string {
  return value.trim().toLowerCase();
}

export function getScopedTeacherCapabilityAssignments(
  access: AccessContext,
  capabilityKey: string
): AccessTeacherCapability[] {
  const normalizedCapabilityKey = normalizeCapabilityKey(capabilityKey);
  return access.teacherCapabilities.filter(
    (capability) => capability.capabilityKey === normalizedCapabilityKey
  );
}

export function hasScopedTeacherCapabilityAccess(
  access: AccessContext,
  capabilityKey: string
): boolean {
  return access.isAdmin || getScopedTeacherCapabilityAssignments(access, capabilityKey).length > 0;
}

export async function listAccessibleScopedTeacherTargets(
  access: AccessContext,
  capabilityKey: string
): Promise<ScopedTeacherTarget[]> {
  if (!access.isTeacher && !access.isAdmin) {
    return [];
  }

  const scopedAssignments = getScopedTeacherCapabilityAssignments(access, capabilityKey);
  const allowAllTeachers =
    access.isAdmin ||
    scopedAssignments.some((capability) => capability.scopeLevel === 'platform');
  const schoolIds = Array.from(
    new Set(
      scopedAssignments
        .filter((capability) => capability.scopeLevel === 'school')
        .map((capability) => capability.schoolId)
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isInteger(value) && value > 0
        )
    )
  );
  const classroomIds = Array.from(
    new Set(
      scopedAssignments
        .filter((capability) => capability.scopeLevel === 'school_classroom')
        .map((capability) => capability.schoolClassroomId)
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isInteger(value) && value > 0
        )
    )
  );

  const rows = await query<ScopedTeacherTargetRow>(
    `
      select
        auth_users.id as "userId",
        coalesce(
          nullif(teachers.name, ''),
          nullif(auth_users.phone, ''),
          nullif(auth_users.email, ''),
          auth_users.id::text
        ) as name,
        teachers.subject,
        schools.name as "schoolName",
        teachers.school_id as "schoolId",
        teachers.grade_level as "gradeLevel",
        classrooms.class_name as "className",
        classrooms.class_code as "classCode",
        teachers.primary_school_classroom_id as "schoolClassroomId"
      from auth_users
      left join teachers
        on teachers.user_id = auth_users.id
      left join school_classrooms classrooms
        on classrooms.id = teachers.primary_school_classroom_id
      left join schools
        on schools.id = teachers.school_id
      where auth_users.role = 'teacher'
        and auth_users.is_active = true
        and (
          auth_users.id = $1
          or $2::boolean = true
          or teachers.school_id = any($3::int[])
          or teachers.primary_school_classroom_id = any($4::int[])
        )
      order by
        case when auth_users.id = $1 then 0 else 1 end,
        coalesce(schools.name, '') asc,
        coalesce(classrooms.grade_level, '') asc,
        coalesce(classrooms.class_name, '') asc,
        name asc
    `,
    [access.user.id, allowAllTeachers, schoolIds, classroomIds]
  );

  return rows.map((row) => ({
    ...row,
    isSelf: row.userId === access.user.id,
  }));
}

export async function getAccessibleScopedTeacherTarget(
  access: AccessContext,
  capabilityKey: string,
  targetTeacherUserId: string
): Promise<ScopedTeacherTarget | null> {
  const normalizedTargetTeacherUserId = targetTeacherUserId.trim();
  if (!normalizedTargetTeacherUserId) {
    return null;
  }

  const targets = await listAccessibleScopedTeacherTargets(access, capabilityKey);
  return (
    targets.find((target) => target.userId === normalizedTargetTeacherUserId) ||
    null
  );
}
