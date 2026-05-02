import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccessContext } from '@/lib/access-context';
import { getTeacherCurrentClassroomRoster } from '@/lib/school-classroom';
import {
  listAccessibleReviewTargets,
} from '@/lib/reviewer-access';

export const dynamic = 'force-dynamic';

function parseTeacherUserId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function GET(request: NextRequest) {
  try {
    const access = await getCurrentAccessContext();
    if (!access || (!access.isTeacher && !access.isAdmin)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    const currentUser = access.user;
    const requestedTeacherUserId = parseTeacherUserId(
      request.nextUrl.searchParams.get('teacherUserId')
    );
    const reviewTargets = await listAccessibleReviewTargets(access);
    const activeTarget =
      (requestedTeacherUserId
        ? reviewTargets.find((target) => target.userId === requestedTeacherUserId)
        : null) ||
      reviewTargets.find((target) => target.userId === currentUser.id) ||
      reviewTargets[0] ||
      null;

    if (!activeTarget) {
      return NextResponse.json({ error: '没有可查看的老师范围' }, { status: 403 });
    }

    const query = request.nextUrl.searchParams.get('query');
    const classroom = await getTeacherCurrentClassroomRoster(activeTarget.userId, { query });

    return NextResponse.json({
      classroom,
      students: classroom?.students || [],
      query: (query || '').trim(),
      reviewTargets,
      activeTargetTeacherUserId: activeTarget.userId,
      activeTargetTeacher: activeTarget,
    });
  } catch (error) {
    console.error('Failed to load teacher roster:', error);
    return NextResponse.json({ error: '获取老师名册失败' }, { status: 500 });
  }
}
