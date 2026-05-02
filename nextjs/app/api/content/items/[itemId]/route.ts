import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import {
  countAdminModuleItemsByFileUrl,
  deleteAdminModuleItem,
  deleteAdminResourcesByFileUrl,
  deleteDirectusFileByAssetUrl,
  getAdminModuleItem,
  updateAdminModuleItem,
} from '@/lib/directus-admin';
import { requireContentManager } from '@/lib/content-auth';
import { deleteMiniAppMount, upsertMiniAppMount } from '@/lib/miniapps';

function revalidateContentPages() {
  revalidatePath('/manage/content');
}

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    await requireContentManager();

    const itemId = Number(params.itemId);
    if (!itemId) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
    }

    const existingItem = await getAdminModuleItem(itemId);
    if (!existingItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    let title: string | undefined;
    let item_type: string | undefined;
    let miniAppId: number | null | undefined;
    let miniAppVersionId: number | null | undefined;
    let aspectRatio: string | undefined;
    let titleOverride: string | null | undefined;
    let miniAppParams: Record<string, unknown> | undefined;

    const body = await request.json();
    title = typeof body?.title === 'string' ? body.title.trim() : undefined;
    item_type = typeof body?.item_type === 'string' ? body.item_type.trim() : undefined;
    miniAppId =
      body?.miniAppId === undefined
        ? undefined
        : Number.isInteger(Number(body?.miniAppId)) && Number(body?.miniAppId) > 0
        ? Number(body?.miniAppId)
        : null;
    miniAppVersionId =
      body?.miniAppVersionId === undefined
        ? undefined
        : Number.isInteger(Number(body?.miniAppVersionId)) && Number(body?.miniAppVersionId) > 0
        ? Number(body?.miniAppVersionId)
        : null;
    aspectRatio =
      typeof body?.aspectRatio === 'string' && body.aspectRatio.trim().length > 0
        ? body.aspectRatio.trim()
        : undefined;
    titleOverride =
      body?.titleOverride === undefined
        ? undefined
        : typeof body?.titleOverride === 'string'
        ? body.titleOverride.trim() || null
        : null;
    if (body?.miniAppParams !== undefined) {
      if (
        body.miniAppParams &&
        typeof body.miniAppParams === 'object' &&
        !Array.isArray(body.miniAppParams)
      ) {
        miniAppParams = body.miniAppParams as Record<string, unknown>;
      } else {
        return NextResponse.json({ error: '小游戏参数必须是合法 JSON 对象' }, { status: 400 });
      }
    }

    if (!title || !item_type) {
      return NextResponse.json({ error: 'title and item_type are required' }, { status: 400 });
    }

    await updateAdminModuleItem(itemId, { title, item_type });

    if (item_type === 'miniapp') {
      const effectiveMiniAppId = miniAppId ?? existingItem.miniAppMount?.miniAppId ?? null;
      if (!effectiveMiniAppId) {
        return NextResponse.json({ error: '请选择要挂载的小游戏' }, { status: 400 });
      }

      await upsertMiniAppMount({
        ownerKind: 'standard_module_item',
        ownerId: itemId,
        miniAppId: effectiveMiniAppId,
        miniAppVersionId:
          miniAppVersionId !== undefined
            ? miniAppVersionId
            : existingItem.miniAppMount?.miniAppVersionId ?? null,
        aspectRatio: aspectRatio || existingItem.miniAppMount?.aspectRatio || '16:9',
        titleOverride:
          titleOverride !== undefined ? titleOverride : existingItem.miniAppMount?.titleOverride || null,
        coverUrl: existingItem.miniAppMount?.coverUrl || null,
        params: miniAppParams !== undefined ? miniAppParams : existingItem.miniAppMount?.params || {},
        mountStatus: existingItem.miniAppMount?.mountStatus || 'active',
      });
    } else if (existingItem.miniAppMount) {
      await deleteMiniAppMount('standard_module_item', itemId);
    }

    revalidateContentPages();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update module item error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    await requireContentManager();

    const itemId = Number(params.itemId);
    if (!itemId) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
    }

    const item = await getAdminModuleItem(itemId);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const fileUrl = item.file_url;
    await deleteAdminModuleItem(itemId);
    if (item.miniAppMount) {
      await deleteMiniAppMount('standard_module_item', itemId);
    }
    if ((await countAdminModuleItemsByFileUrl(fileUrl)) === 0) {
      await deleteAdminResourcesByFileUrl(fileUrl);
      await deleteDirectusFileByAssetUrl(fileUrl);
    }
    revalidateContentPages();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete module item error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
