import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listOpenMaicCourseDrafts,
  toSafeOpenMaicCourseDraft,
} from '@/lib/openmaic-course-drafts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const drafts = await listOpenMaicCourseDrafts(currentUser.id);
  return NextResponse.json({ drafts: drafts.map(toSafeOpenMaicCourseDraft) });
}
