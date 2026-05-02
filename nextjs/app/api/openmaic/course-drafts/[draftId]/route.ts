import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteOpenMaicCourseDraft } from '@/lib/openmaic-course-drafts';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { draftId: string } },
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const draftId = parsePositiveInt(params.draftId);
    if (!draftId) {
      return NextResponse.json({ error: '无效的草稿 ID' }, { status: 400 });
    }

    const deleted = await deleteOpenMaicCourseDraft(currentUser.id, draftId);
    if (!deleted) {
      return NextResponse.json({ error: '草稿不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('Failed to delete OpenMAIC course draft:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除 OpenMAIC 草稿失败' },
      { status: 500 },
    );
  }
}
