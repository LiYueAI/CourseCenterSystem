export type StudentAssignmentReviewStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export type StudentAssignmentReviewPhase =
  | 'draft'
  | 'pending'
  | 'graded';

export function toStudentAssignmentReviewPhase(
  status: unknown
): StudentAssignmentReviewPhase {
  if (
    status === 'approved' ||
    status === 'rejected' ||
    status === 'graded' ||
    status === 'needs_revision' ||
    status === 'changes_requested'
  ) {
    return 'graded';
  }

  if (status === 'draft') {
    return 'draft';
  }

  return 'pending';
}
