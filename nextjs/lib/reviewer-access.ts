import 'server-only';

import type { AccessContext } from '@/lib/access-context';
import {
  getAccessibleScopedTeacherTarget,
  hasScopedTeacherCapabilityAccess,
  listAccessibleScopedTeacherTargets,
  type ScopedTeacherTarget,
} from '@/lib/teacher-capability-access';

export type ReviewTargetTeacher = ScopedTeacherTarget;

export function canAccessCrossTeacherReview(access: AccessContext): boolean {
  return hasScopedTeacherCapabilityAccess(access, 'reviewer');
}

export async function listAccessibleReviewTargets(
  access: AccessContext
): Promise<ReviewTargetTeacher[]> {
  return listAccessibleScopedTeacherTargets(access, 'reviewer');
}

export async function getAccessibleReviewTarget(
  access: AccessContext,
  targetTeacherUserId: string
): Promise<ReviewTargetTeacher | null> {
  return getAccessibleScopedTeacherTarget(access, 'reviewer', targetTeacherUserId);
}
