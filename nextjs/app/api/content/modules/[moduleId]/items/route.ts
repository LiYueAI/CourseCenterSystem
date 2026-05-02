import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminModuleItem,
  listAdminModuleItems,
  updateAdminModuleItem,
  uploadDirectusFile,
} from '@/lib/directus-admin';
import { requireContentManager } from '@/lib/content-auth';
import { upsertMiniAppMount } from '@/lib/miniapps';

function revalidateContentPages() {
  revalidatePath('/manage/content');
}

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  try {
    await requireContentManager();

    const moduleId = Number(params.moduleId);
    if (!moduleId) {
      return NextResponse.json({ error: 'Invalid module id' }, { status: 400 });
    }

    const formData = await request.formData();
    const title = String(formData.get('title') || '').trim();
    const itemType = String(formData.get('item_type') || '').trim();
    const file = formData.get('file');
    const miniAppId = Number(formData.get('miniAppId') || 0);
    const miniAppVersionId = Number(formData.get('miniAppVersionId') || 0);
    const aspectRatio = String(formData.get('aspectRatio') || '').trim() || '16:9';
    const titleOverride = String(formData.get('titleOverride') || '').trim() || null;
    const rawMiniAppParams = String(formData.get('miniAppParams') || '').trim();
    let miniAppParams: Record<string, unknown> = {};

    if (!title || !itemType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (itemType === 'miniapp') {
      if (!Number.isInteger(miniAppId) || miniAppId <= 0) {
        return NextResponse.json({ error: '请选择要挂载的小游戏' }, { status: 400 });
      }

      if (rawMiniAppParams) {
        try {
          const parsed = JSON.parse(rawMiniAppParams) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('invalid');
          }
          miniAppParams = parsed as Record<string, unknown>;
        } catch {
          return NextResponse.json({ error: '小游戏参数必须是合法 JSON 对象' }, { status: 400 });
        }
      }
    }

    let fileUrl: string | null = null;
    if (file instanceof File && file.size > 0) {
      fileUrl = await uploadDirectusFile(file, title);
    }

    if (!fileUrl && !['interactive', 'miniapp'].includes(itemType)) {
      return NextResponse.json({ error: 'File is required for this item type' }, { status: 400 });
    }

    const existingItems = await listAdminModuleItems(moduleId);

    const item = await createAdminModuleItem({
      module_id: moduleId,
      item_type: itemType,
      title,
      file_url: fileUrl,
      sort_order: existingItems.length + 1,
      duration: 0,
    });

    if (itemType === 'miniapp') {
      await upsertMiniAppMount({
        ownerKind: 'standard_module_item',
        ownerId: item.id,
        miniAppId,
        miniAppVersionId:
          Number.isInteger(miniAppVersionId) && miniAppVersionId > 0
            ? miniAppVersionId
            : null,
        aspectRatio,
        titleOverride,
        params: miniAppParams,
      });
    }

    revalidateContentPages();

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Create module item error:', error);
    return NextResponse.json({ error: 'Failed to create module item' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  try {
    await requireContentManager();

    const moduleId = Number(params.moduleId);
    if (!moduleId) {
      return NextResponse.json({ error: 'Invalid module id' }, { status: 400 });
    }

    const body = await request.json();
    const itemIds: number[] = Array.isArray(body?.itemIds)
      ? body.itemIds.map(Number).filter(Boolean)
      : [];
    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'itemIds are required' }, { status: 400 });
    }

    const existingItems = await listAdminModuleItems(moduleId);
    const existingIds = new Set(existingItems.map((item) => item.id));
    if (
      itemIds.length !== existingItems.length ||
      itemIds.some((itemId: number) => !existingIds.has(itemId))
    ) {
      return NextResponse.json({ error: 'Invalid item order' }, { status: 400 });
    }

    await Promise.all(
      itemIds.map((itemId, index) =>
        updateAdminModuleItem(itemId, { sort_order: index + 1 })
      )
    );

    revalidateContentPages();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder module items error:', error);
    return NextResponse.json({ error: 'Failed to reorder items' }, { status: 500 });
  }
}
