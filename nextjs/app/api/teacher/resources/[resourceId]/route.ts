import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteDirectusFileByAssetUrl, uploadDirectusFile } from '@/lib/directus-admin';
import {
  deleteTeacherResource,
  getTeacherResource,
  updateTeacherResource,
  updateTeacherResourceReviewStatus,
  type TeacherResourceRecord,
  type TeacherResourceReviewStatus,
} from '@/lib/teacher-plan';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: FormDataEntryValue | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function detectItemType(file: File): string {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  if (
    file.type.includes('powerpoint') ||
    file.name.endsWith('.ppt') ||
    file.name.endsWith('.pptx')
  ) {
    return 'ppt';
  }

  return 'doc';
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null || value === '') {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

type TeacherResourceResponse = TeacherResourceRecord & {
  miniappMount: TeacherResourceRecord['miniAppMount'] | null;
};

function toTeacherResourceResponse(resource: TeacherResourceRecord): TeacherResourceResponse {
  return {
    ...resource,
    miniappMount: resource.miniAppMount ?? null,
  };
}

function parseReviewStatus(value: unknown): TeacherResourceReviewStatus | null {
  if (value === 'draft' || value === 'reviewed' || value === 'published') {
    return value;
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  let uploadedFileUrl: string | null = null;

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const resourceId = parsePositiveInt(params.resourceId);
    if (!resourceId) {
      return NextResponse.json({ error: '无效的资源 ID' }, { status: 400 });
    }

    const existing = await getTeacherResource(currentUser.id, resourceId);
    if (!existing) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 });
    }

    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      const rawBody = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const requestedStatus = parseReviewStatus(rawBody?.reviewStatus ?? rawBody?.review_status);
      if (requestedStatus && Object.keys(rawBody || {}).every((key) => ['reviewStatus', 'review_status'].includes(key))) {
        const updatedStatus = await updateTeacherResourceReviewStatus(currentUser.id, resourceId, requestedStatus);
        if (!updatedStatus) {
          return NextResponse.json({ error: '资源不存在' }, { status: 404 });
        }
        return NextResponse.json({ success: true, resource: toTeacherResourceResponse(updatedStatus) });
      }

      request = new NextRequest(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(rawBody || {}),
      });
    }
    let title: string | undefined;
    let moduleId: number | undefined;
    let itemType: string | undefined;
    let fileUrl: string | null | undefined;
    let duration: number | undefined;
    let miniAppId: number | null | undefined;
    let miniAppVersionId: number | null | undefined;
    let aspectRatio: string | undefined;
    let titleOverride: string | null | undefined;
    let coverUrl: string | null | undefined;
    let mountStatus: 'active' | 'disabled' | undefined;
    let miniAppParams: Record<string, unknown> | undefined;
    let isShared: boolean | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const titleValue = String(formData.get('title') || '').trim();
      if (titleValue) {
        title = titleValue;
      } else if (formData.has('title')) {
        return NextResponse.json({ error: '资源标题不能为空' }, { status: 400 });
      }

      if (formData.has('moduleId')) {
        const parsedModuleId = parsePositiveInt(String(formData.get('moduleId') || ''));
        if (!parsedModuleId) {
          return NextResponse.json({ error: '模块ID无效' }, { status: 400 });
        }
        moduleId = parsedModuleId;
      }

      if (formData.has('isShared') || formData.has('is_shared')) {
        isShared = String(formData.get('isShared') || formData.get('is_shared') || '') === 'true';
      }

      if (formData.has('duration')) {
        const parsedDuration = parseNonNegativeNumber(formData.get('duration'));
        if (parsedDuration === null) {
          return NextResponse.json({ error: '时长无效' }, { status: 400 });
        }
        duration = parsedDuration;
      }

      const replacementFile = formData.get('file');
      const requestedItemType = String(formData.get('itemType') || formData.get('item_type') || '').trim();
      const replacementItemType =
        replacementFile instanceof File && replacementFile.size > 0
          ? detectItemType(replacementFile)
          : undefined;
      const effectiveItemType = replacementItemType || requestedItemType || existing.item_type;

      if (replacementFile instanceof File && replacementFile.size > 0) {
        const uploadTitle = title || existing.title || replacementFile.name || '未命名资源';
        uploadedFileUrl = await uploadDirectusFile(replacementFile, uploadTitle);
        fileUrl = uploadedFileUrl;
        itemType = replacementItemType;

        if (duration === undefined) {
          duration = 0;
        }
      }

      if (formData.has('itemType') || formData.has('item_type')) {
        itemType = effectiveItemType;
      }

      if (effectiveItemType === 'miniapp' || formData.has('miniAppId')) {
        if (formData.has('miniAppId')) {
          const parsedMiniAppId = parsePositiveInt(String(formData.get('miniAppId') || ''));
          if (!parsedMiniAppId) {
            return NextResponse.json({ error: '请选择要挂载的小游戏' }, { status: 400 });
          }
          miniAppId = parsedMiniAppId;
        }

        if (formData.has('miniAppVersionId')) {
          miniAppVersionId = parsePositiveInt(String(formData.get('miniAppVersionId') || ''));
        }

        if (formData.has('aspectRatio')) {
          aspectRatio = String(formData.get('aspectRatio') || '').trim() || '16:9';
        }

        if (formData.has('titleOverride')) {
          titleOverride = String(formData.get('titleOverride') || '').trim() || null;
        }

        if (formData.has('coverUrl')) {
          coverUrl = String(formData.get('coverUrl') || '').trim() || null;
        }

        if (formData.has('mountStatus')) {
          mountStatus =
            String(formData.get('mountStatus') || '').trim() === 'disabled' ? 'disabled' : 'active';
        }

        if (formData.has('miniAppParams')) {
          const parsedParams = parseJsonObject(formData.get('miniAppParams'));
          if (parsedParams === null) {
            return NextResponse.json({ error: '小游戏参数必须是合法 JSON 对象' }, { status: 400 });
          }
          miniAppParams = parsedParams;
        }

        if (replacementFile instanceof File && replacementFile.size > 0) {
          fileUrl = null;
        }
      }
    } else {
      const body = await request.json();

      if (body?.title !== undefined) {
        if (typeof body.title !== 'string' || !body.title.trim()) {
          return NextResponse.json({ error: '资源标题不能为空' }, { status: 400 });
        }
        title = body.title.trim();
      }

      if (body?.moduleId !== undefined) {
        const parsedModuleId = parsePositiveInt(String(body.moduleId));
        if (!parsedModuleId) {
          return NextResponse.json({ error: '模块ID无效' }, { status: 400 });
        }
        moduleId = parsedModuleId;
      }

      if (body?.isShared !== undefined || body?.is_shared !== undefined) {
        isShared = body?.isShared === true || body?.is_shared === true;
      }

      if (body?.duration !== undefined) {
        const parsedDuration = parseNonNegativeNumber(String(body.duration));
        if (parsedDuration === null) {
          return NextResponse.json({ error: '时长无效' }, { status: 400 });
        }
        duration = parsedDuration;
      }

      if (body?.itemType !== undefined || body?.item_type !== undefined) {
        const nextItemType =
          typeof body?.itemType === 'string'
            ? body.itemType.trim()
            : typeof body?.item_type === 'string'
            ? body.item_type.trim()
            : '';
        if (!nextItemType) {
          return NextResponse.json({ error: '资源类型无效' }, { status: 400 });
        }
        itemType = nextItemType;
      }

      const rawMiniAppMount =
        body?.miniappMount && typeof body.miniappMount === 'object' && !Array.isArray(body.miniappMount)
          ? (body.miniappMount as Record<string, unknown>)
          : body?.miniAppMount &&
            typeof body.miniAppMount === 'object' &&
            !Array.isArray(body.miniAppMount)
          ? (body.miniAppMount as Record<string, unknown>)
          : body;

      if (
        body?.miniappMount !== undefined ||
        body?.miniAppMount !== undefined ||
        body?.miniAppId !== undefined ||
        body?.mini_app_id !== undefined ||
        itemType === 'miniapp'
      ) {
        if (rawMiniAppMount?.miniAppId !== undefined || rawMiniAppMount?.mini_app_id !== undefined) {
          const parsedMiniAppId = parsePositiveInt(
            String(rawMiniAppMount?.miniAppId ?? rawMiniAppMount?.mini_app_id ?? '')
          );
          if (!parsedMiniAppId) {
            return NextResponse.json({ error: '请选择要挂载的小游戏' }, { status: 400 });
          }
          miniAppId = parsedMiniAppId;
        }

        if (
          rawMiniAppMount?.miniAppVersionId !== undefined ||
          rawMiniAppMount?.mini_app_version_id !== undefined
        ) {
          miniAppVersionId = parsePositiveInt(
            String(rawMiniAppMount?.miniAppVersionId ?? rawMiniAppMount?.mini_app_version_id ?? '')
          );
        }

        if (
          typeof rawMiniAppMount?.aspectRatio === 'string' ||
          typeof rawMiniAppMount?.aspect_ratio === 'string'
        ) {
          aspectRatio =
            (typeof rawMiniAppMount?.aspectRatio === 'string'
              ? rawMiniAppMount.aspectRatio
              : rawMiniAppMount?.aspect_ratio) || '16:9';
        }

        if (
          rawMiniAppMount?.titleOverride !== undefined ||
          rawMiniAppMount?.title_override !== undefined
        ) {
          titleOverride =
            typeof rawMiniAppMount?.titleOverride === 'string'
              ? rawMiniAppMount.titleOverride.trim() || null
              : typeof rawMiniAppMount?.title_override === 'string'
              ? rawMiniAppMount.title_override.trim() || null
              : null;
        }

        if (rawMiniAppMount?.coverUrl !== undefined || rawMiniAppMount?.cover_url !== undefined) {
          coverUrl =
            typeof rawMiniAppMount?.coverUrl === 'string'
              ? rawMiniAppMount.coverUrl.trim() || null
              : typeof rawMiniAppMount?.cover_url === 'string'
              ? rawMiniAppMount.cover_url.trim() || null
              : null;
        }

        if (rawMiniAppMount?.mountStatus !== undefined || rawMiniAppMount?.mount_status !== undefined) {
          mountStatus =
            rawMiniAppMount?.mountStatus === 'disabled' || rawMiniAppMount?.mount_status === 'disabled'
              ? 'disabled'
              : 'active';
        }

        if (
          rawMiniAppMount?.params !== undefined ||
          rawMiniAppMount?.miniAppParams !== undefined ||
          rawMiniAppMount?.mini_app_params !== undefined
        ) {
          const parsedParams = parseJsonObject(
            rawMiniAppMount?.params ??
              rawMiniAppMount?.miniAppParams ??
              rawMiniAppMount?.mini_app_params
          );
          if (parsedParams === null) {
            return NextResponse.json({ error: '小游戏参数必须是合法 JSON 对象' }, { status: 400 });
          }
          miniAppParams = parsedParams;
        }
      }
    }

    if (
      title === undefined &&
      moduleId === undefined &&
      itemType === undefined &&
      fileUrl === undefined &&
      duration === undefined &&
      miniAppId === undefined &&
      miniAppVersionId === undefined &&
      aspectRatio === undefined &&
      titleOverride === undefined &&
      coverUrl === undefined &&
      mountStatus === undefined &&
      miniAppParams === undefined &&
      isShared === undefined
    ) {
      return NextResponse.json({ error: '没有可更新的内容' }, { status: 400 });
    }

    if ((itemType || existing.item_type) === 'miniapp' && miniAppId === null) {
      return NextResponse.json({ error: '请选择要挂载的小游戏' }, { status: 400 });
    }

    const updated = await updateTeacherResource(currentUser.id, resourceId, {
      title,
      moduleId,
      itemType,
      fileUrl: (itemType || existing.item_type) === 'miniapp' ? null : fileUrl,
      duration,
      isShared,
      miniAppMount:
        itemType === 'miniapp' ||
        (itemType === undefined &&
          existing.item_type === 'miniapp' &&
          (miniAppId !== undefined ||
            miniAppVersionId !== undefined ||
            aspectRatio !== undefined ||
            titleOverride !== undefined ||
            coverUrl !== undefined ||
            mountStatus !== undefined ||
            miniAppParams !== undefined))
          ? {
              miniAppId: miniAppId ?? existing.miniAppMount?.miniAppId ?? 0,
              miniAppVersionId:
                miniAppVersionId !== undefined
                  ? miniAppVersionId
                  : existing.miniAppMount?.miniAppVersionId ?? null,
              aspectRatio: aspectRatio || existing.miniAppMount?.aspectRatio || '16:9',
              titleOverride:
                titleOverride !== undefined
                  ? titleOverride
                  : existing.miniAppMount?.titleOverride || null,
              coverUrl:
                coverUrl !== undefined ? coverUrl : existing.miniAppMount?.coverUrl || null,
              mountStatus: mountStatus || existing.miniAppMount?.mountStatus || 'active',
              params:
                miniAppParams !== undefined
                  ? miniAppParams
                  : existing.miniAppMount?.params || {},
            }
          : itemType !== undefined && itemType !== 'miniapp'
          ? null
          : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 });
    }

    if (fileUrl !== undefined && existing.file_url && existing.file_url !== updated.file_url) {
      await deleteDirectusFileByAssetUrl(existing.file_url);
    }

    return NextResponse.json({ success: true, resource: toTeacherResourceResponse(updated) });
  } catch (error) {
    await deleteDirectusFileByAssetUrl(uploadedFileUrl);
    console.error('Failed to update teacher resource:', error);
    return NextResponse.json({ error: '更新老师资源失败' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const resourceId = parsePositiveInt(params.resourceId);
    if (!resourceId) {
      return NextResponse.json({ error: '无效的资源 ID' }, { status: 400 });
    }

    const deleted = await deleteTeacherResource(currentUser.id, resourceId);
    if (!deleted) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 });
    }

    await deleteDirectusFileByAssetUrl(deleted.file_url);

    return NextResponse.json({ success: true, deleted: toTeacherResourceResponse(deleted) });
  } catch (error) {
    console.error('Failed to delete teacher resource:', error);
    return NextResponse.json({ error: '删除老师资源失败' }, { status: 500 });
  }
}
