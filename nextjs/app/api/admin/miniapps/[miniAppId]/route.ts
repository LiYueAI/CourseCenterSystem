import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteMiniAppById, updateMiniApp } from '@/lib/miniapps';
import { removeMiniAppPublishedFiles } from '@/lib/miniapps-storage';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

function revalidateAdminMiniAppPages() {
  revalidatePath('/manage/resources');
  revalidatePath('/manage/content');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { miniAppId: string } },
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const miniAppId = Number(params.miniAppId);
    if (!Number.isInteger(miniAppId) || miniAppId <= 0) {
      return NextResponse.json({ error: '无效的小游戏 ID' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          name?: string;
          description?: string | null;
        }
      | null;

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description =
      body && Object.prototype.hasOwnProperty.call(body, 'description')
        ? typeof body.description === 'string'
          ? body.description
          : ''
        : undefined;

    if (!name && description === undefined) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    const updated = await updateMiniApp(miniAppId, {
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
    });

    if (!updated) {
      return NextResponse.json({ error: '小游戏不存在' }, { status: 404 });
    }

    revalidateAdminMiniAppPages();
    return NextResponse.json({ success: true, miniApp: updated });
  } catch (error) {
    console.error('Update miniapp failed:', error);
    return NextResponse.json({ error: '修改小游戏失败' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { miniAppId: string } },
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const miniAppId = Number(params.miniAppId);
    if (!Number.isInteger(miniAppId) || miniAppId <= 0) {
      return NextResponse.json({ error: '无效的小游戏 ID' }, { status: 400 });
    }

    const deleted = await deleteMiniAppById(miniAppId);
    if (!deleted) {
      return NextResponse.json({ error: '小游戏不存在' }, { status: 404 });
    }

    await removeMiniAppPublishedFiles(deleted.appKey).catch((error) => {
      console.error('Failed to remove miniapp published files:', error);
    });

    revalidateAdminMiniAppPages();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除小游戏失败';
    const status = message === 'Mini app is mounted' ? 409 : 500;

    return NextResponse.json(
      {
        error:
          status === 409
            ? '该小游戏已被课程内容或老师资源挂载，请先解除挂载后再删除'
            : '删除小游戏失败',
      },
      { status },
    );
  }
}
