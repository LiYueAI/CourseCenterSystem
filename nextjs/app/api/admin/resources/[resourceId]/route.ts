import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import {
  createAdminModuleItem,
  deleteDirectusFileByAssetUrl,
  listAdminModuleItems,
} from '@/lib/directus-admin';

type ResourceRow = {
  id: number;
  title: string;
  type: string;
  file_url: string;
  status: string;
};

function revalidateAdminResourcePages() {
  revalidatePath('/manage/resources');
  revalidatePath('/manage/content');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const resourceId = Number(params.resourceId);
    const body = await request.json();
    const status = typeof body?.status === 'string' ? body.status : '';
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

    if (!resourceId) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    if (title) {
      await query('update resources set title = $1 where id = $2', [title, resourceId]);
    }

    if (status && ['approved', 'rejected', 'pending'].includes(status)) {
      await query('update resources set status = $1 where id = $2', [status, resourceId]);
    }

    if (!title && !status) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    revalidateAdminResourcePages();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update resource status failed:', error);
    return NextResponse.json({ error: '更新资源状态失败' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const resourceId = Number(params.resourceId);
    if (!resourceId) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    const resource = await queryOne<ResourceRow>(
      'select id, title, type, file_url, status from resources where id = $1',
      [resourceId]
    );

    if (!resource) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 });
    }

    await query(
      'delete from module_items where file_url = $1 and title = $2',
      [resource.file_url, resource.title]
    );
    await query('delete from resources where id = $1', [resourceId]);

    const fileReferenceCount = await queryOne<{ count: string }>(
      `
        select (
          (select count(*) from resources where file_url = $1) +
          (select count(*) from module_items where file_url = $1) +
          (select count(*) from teacher_resources where file_url = $1)
        )::text as count
      `,
      [resource.file_url]
    );

    if (Number(fileReferenceCount?.count || 0) === 0) {
      await deleteDirectusFileByAssetUrl(resource.file_url);
    }

    revalidateAdminResourcePages();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete resource failed:', error);
    return NextResponse.json({ error: '删除资源失败' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const resourceId = Number(params.resourceId);
    const body = await request.json().catch(() => ({}));
    const moduleId = Number(body?.moduleId);

    if (!resourceId || !moduleId) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    const resource = await queryOne<ResourceRow>(
      'select id, title, type, file_url, status from resources where id = $1',
      [resourceId]
    );

    if (!resource) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 });
    }

    if (resource.status !== 'approved') {
      return NextResponse.json({ error: '请先审核通过，再执行发布' }, { status: 400 });
    }

    const existingItems = await listAdminModuleItems(moduleId);
    const alreadyPublished = existingItems.some(
      (item) => item.file_url === resource.file_url && item.title === resource.title
    );

    if (alreadyPublished) {
      return NextResponse.json({ error: '该资源已发布到当前模块' }, { status: 409 });
    }

    const item = await createAdminModuleItem({
      module_id: moduleId,
      item_type: resource.type,
      title: resource.title,
      file_url: resource.file_url,
      sort_order: existingItems.length + 1,
      duration: 0,
    });

    revalidateAdminResourcePages();

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Publish admin resource failed:', error);
    return NextResponse.json({ error: '发布资源失败' }, { status: 500 });
  }
}
