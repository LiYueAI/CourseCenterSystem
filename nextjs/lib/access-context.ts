import 'server-only';

import { getCurrentUser, type AuthUser } from '@/lib/auth';
import {
  getTeacherCapabilitySnapshot,
  type TeacherCapabilityScopeLevel,
} from '@/lib/teacher-capabilities';

export interface AccessTeacherCapability {
  assignmentId: number;
  capabilityId: number;
  capabilityKey: string;
  capabilityName: string;
  capabilityDescription: string;
  assignedAt: string | null;
  assignedByUserId: string | null;
  scopeLevel: TeacherCapabilityScopeLevel;
  schoolId: number | null;
  schoolName: string | null;
  schoolClassroomId: number | null;
  className: string | null;
  classCode: string | null;
}

export interface AccessTeacherProfile {
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

export interface AccessContext {
  user: AuthUser;
  primaryRole: AuthUser['role'];
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  capabilityKeys: string[];
  teacherProfile: AccessTeacherProfile | null;
  teacherCapabilities: AccessTeacherCapability[];
}

function normalizeCapabilityKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildAccessContext(
  user: AuthUser,
  teacherProfile: AccessTeacherProfile | null,
  teacherCapabilities: AccessTeacherCapability[]
): AccessContext {
  return {
    user,
    primaryRole: user.role,
    isAdmin: user.role === 'admin',
    isTeacher: user.role === 'teacher',
    isStudent: user.role === 'student',
    capabilityKeys: Array.from(
      new Set(teacherCapabilities.map((item) => item.capabilityKey))
    ),
    teacherProfile,
    teacherCapabilities,
  };
}

export async function getCurrentAccessContext(): Promise<AccessContext | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  if (user.role !== 'teacher') {
    return buildAccessContext(user, null, []);
  }

  try {
    const snapshot = await getTeacherCapabilitySnapshot(user.id);
    const teacherCapabilities = snapshot.capabilities
      .filter(
        (item): item is typeof item & {
          assignmentId: number;
          scopeLevel: TeacherCapabilityScopeLevel;
        } => Boolean(item.assigned && item.assignmentId && item.scopeLevel)
      )
      .map((item) => ({
        assignmentId: item.assignmentId,
        capabilityId: item.id,
        capabilityKey: item.key,
        capabilityName: item.name,
        capabilityDescription: item.description,
        assignedAt: item.assignedAt,
        assignedByUserId: item.assignedByUserId,
        scopeLevel: item.scopeLevel,
        schoolId: item.schoolId,
        schoolName: item.schoolName,
        schoolClassroomId: item.schoolClassroomId,
        className: item.className,
        classCode: item.classCode,
      }));

    return buildAccessContext(user, snapshot.teacher, teacherCapabilities);
  } catch (error) {
    if (error instanceof Error && error.message === 'Teacher not found') {
      return buildAccessContext(user, null, []);
    }

    throw error;
  }
}

export function hasTeacherCapability(
  context: AccessContext | null | undefined,
  capabilityKey: string
): boolean {
  if (!context) {
    return false;
  }

  const normalizedCapabilityKey = normalizeCapabilityKey(capabilityKey);
  return context.teacherCapabilities.some(
    (item) => item.capabilityKey === normalizedCapabilityKey
  );
}

export function getTeacherCapabilityAssignments(
  context: AccessContext | null | undefined,
  capabilityKey: string
): AccessTeacherCapability[] {
  if (!context) {
    return [];
  }

  const normalizedCapabilityKey = normalizeCapabilityKey(capabilityKey);
  return context.teacherCapabilities.filter(
    (item) => item.capabilityKey === normalizedCapabilityKey
  );
}
