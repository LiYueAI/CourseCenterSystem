import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteDirectusFileByAssetUrl, uploadDirectusFile } from '@/lib/directus-admin';
import {
  createTeacherResource,
  listTeacherResources,
  listSharedTeacherResources,
  type TeacherResourceRecord,
} from '@/lib/teacher-plan';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: FormDataEntryValue | unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
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


function shouldPersistGeneratedAsset(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('/directus/assets/') || url.startsWith('/media/assets/')) return false;
  return url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://');
}

function getGeneratedAssetFilename(title: string, itemType: string | null, mimeType: string): string {
  const safeTitle = (title || 'ai-resource').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 80) || 'ai-resource';
  const extension = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? 'jpg'
    : mimeType.includes('mp4')
    ? 'mp4'
    : mimeType.includes('mpeg')
    ? 'mp3'
    : mimeType.includes('wav')
    ? 'wav'
    : itemType === 'video'
    ? 'mp4'
    : itemType === 'audio'
    ? 'mp3'
    : itemType === 'image'
    ? 'png'
    : 'html';
  return `${safeTitle}.${extension}`;
}

async function persistGeneratedAssetUrl(
  url: string | null,
  title: string,
  itemType: string | null,
): Promise<string | null> {
  if (!shouldPersistGeneratedAsset(url)) return url;

  const response = await fetch(url as string, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`AI 资源转存失败：HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || response.headers.get('content-type') || 'application/octet-stream';
  const file = new File([blob], getGeneratedAssetFilename(title, itemType, mimeType), { type: mimeType });
  return uploadDirectusFile(file, title || file.name || 'AI 生成资源');
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

type TeacherResourceResponse = TeacherResourceRecord & {
  miniappMount: TeacherResourceRecord['miniAppMount'] | null;
};

function toTeacherResourceResponse(resource: TeacherResourceRecord): TeacherResourceResponse {
  return {
    ...resource,
    miniappMount: resource.miniAppMount ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const lessonId = parsePositiveInt(request.nextUrl.searchParams.get('lessonId'));
    const moduleId = parsePositiveInt(request.nextUrl.searchParams.get('moduleId'));

    if (!lessonId) {
      return NextResponse.json({ error: '无效的课时 ID' }, { status: 400 });
    }

    const [ownResources, sharedResources] = await Promise.all([
      listTeacherResources(currentUser.id, {
        lessonId,
        moduleId,
      }),
      listSharedTeacherResources(currentUser.id, {
        lessonId,
        moduleId,
      }),
    ]);
    const resources = [...ownResources, ...sharedResources];

    return NextResponse.json({
      resources: resources.map(toTeacherResourceResponse),
    });
  } catch (error) {
    console.error('Failed to fetch teacher resources:', error);
    return NextResponse.json({ error: '获取老师资源失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let uploadedFileUrl: string | null = null;

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let lessonId: number | null = null;
    let moduleId: number | null = null;
    let title = '';
    let itemType: string | null = null;
    let fileUrl: string | null = null;
    let duration = 0;
    let miniAppId: number | null = null;
    let miniAppVersionId: number | null = null;
    let aspectRatio = '16:9';
    let titleOverride: string | null = null;
    let coverUrl: string | null = null;
    let mountStatus: 'active' | 'disabled' = 'active';
    let miniAppParams: Record<string, unknown> = {};
    let isShared = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      lessonId = parsePositiveInt(String(formData.get('lessonId') || ''));
      moduleId = parsePositiveInt(String(formData.get('moduleId') || ''));
      title = String(formData.get('title') || '').trim();

      const file = formData.get('file');
      const providedItemType = String(formData.get('itemType') || formData.get('item_type') || '').trim();
      isShared = String(formData.get('isShared') || formData.get('is_shared') || '') === 'true';
      itemType =
        providedItemType ||
        (file instanceof File && file.size > 0 ? detectItemType(file) : null);

      if (formData.has('duration')) {
        const parsedDuration = parseNonNegativeNumber(formData.get('duration'));
        if (parsedDuration === null) {
          return NextResponse.json({ error: '时长无效' }, { status: 400 });
        }
        duration = parsedDuration;
      }

      if (itemType === 'miniapp') {
        miniAppId = parsePositiveInt(String(formData.get('miniAppId') || ''));
        miniAppVersionId = parsePositiveInt(String(formData.get('miniAppVersionId') || ''));
        aspectRatio = String(formData.get('aspectRatio') || '').trim() || '16:9';
        titleOverride = String(formData.get('titleOverride') || '').trim() || null;
        coverUrl = String(formData.get('coverUrl') || '').trim() || null;
        mountStatus =
          String(formData.get('mountStatus') || '').trim() === 'disabled' ? 'disabled' : 'active';

        const parsedParams = parseJsonObject(formData.get('miniAppParams'));
        if (parsedParams === null) {
          return NextResponse.json({ error: '小游戏参数必须是合法 JSON 对象' }, { status: 400 });
        }
        miniAppParams = parsedParams;
      } else {
        if (!(file instanceof File) || file.size <= 0) {
          return NextResponse.json({ error: '请上传资源文件' }, { status: 400 });
        }

        uploadedFileUrl = await uploadDirectusFile(file, title || file.name || '未命名资源');
        fileUrl = uploadedFileUrl;
      }
    } else {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      lessonId = parsePositiveInt(String(body?.lessonId ?? ''));
      moduleId = parsePositiveInt(String(body?.moduleId ?? ''));
      title = typeof body?.title === 'string' ? body.title.trim() : '';
      itemType =
        typeof body?.itemType === 'string'
          ? body.itemType.trim()
          : typeof body?.item_type === 'string'
          ? body.item_type.trim()
          : null;
      isShared = body?.isShared === true || body?.is_shared === true;

      if (body?.duration !== undefined) {
        const parsedDuration = parseNonNegativeNumber(body.duration);
        if (parsedDuration === null) {
          return NextResponse.json({ error: '时长无效' }, { status: 400 });
        }
        duration = parsedDuration;
      }

      fileUrl =
        typeof body?.fileUrl === 'string'
          ? body.fileUrl.trim() || null
          : typeof body?.file_url === 'string'
          ? body.file_url.trim() || null
          : null;

      const rawMiniAppMount =
        body?.miniappMount && typeof body.miniappMount === 'object' && !Array.isArray(body.miniappMount)
          ? (body.miniappMount as Record<string, unknown>)
          : body?.miniAppMount &&
            typeof body.miniAppMount === 'object' &&
            !Array.isArray(body.miniAppMount)
          ? (body.miniAppMount as Record<string, unknown>)
          : body;

      miniAppId = parsePositiveInt(
        String(rawMiniAppMount?.miniAppId ?? rawMiniAppMount?.mini_app_id ?? '')
      );
      miniAppVersionId = parsePositiveInt(
        String(rawMiniAppMount?.miniAppVersionId ?? rawMiniAppMount?.mini_app_version_id ?? '')
      );
      aspectRatio =
        typeof rawMiniAppMount?.aspectRatio === 'string' && rawMiniAppMount.aspectRatio.trim()
          ? rawMiniAppMount.aspectRatio.trim()
          : typeof rawMiniAppMount?.aspect_ratio === 'string' && rawMiniAppMount.aspect_ratio.trim()
          ? rawMiniAppMount.aspect_ratio.trim()
          : '16:9';
      titleOverride =
        typeof rawMiniAppMount?.titleOverride === 'string'
          ? rawMiniAppMount.titleOverride.trim() || null
          : typeof rawMiniAppMount?.title_override === 'string'
          ? rawMiniAppMount.title_override.trim() || null
          : null;
      coverUrl =
        typeof rawMiniAppMount?.coverUrl === 'string'
          ? rawMiniAppMount.coverUrl.trim() || null
          : typeof rawMiniAppMount?.cover_url === 'string'
          ? rawMiniAppMount.cover_url.trim() || null
          : null;
      mountStatus =
        rawMiniAppMount?.mountStatus === 'disabled' || rawMiniAppMount?.mount_status === 'disabled'
          ? 'disabled'
          : 'active';

      const parsedParams = parseJsonObject(
        rawMiniAppMount?.params ?? rawMiniAppMount?.miniAppParams ?? rawMiniAppMount?.mini_app_params
      );
      if (parsedParams === null) {
        return NextResponse.json({ error: '小游戏参数必须是合法 JSON 对象' }, { status: 400 });
      }
      miniAppParams = parsedParams;
    }

    if (!lessonId) {
      return NextResponse.json({ error: '无效的课时 ID' }, { status: 400 });
    }

    if (!moduleId) {
      return NextResponse.json({ error: '无效的模块 ID' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: '资源标题不能为空' }, { status: 400 });
    }

    if (!itemType) {
      return NextResponse.json({ error: '资源类型无效' }, { status: 400 });
    }

    if (itemType === 'miniapp' && !miniAppId) {
      return NextResponse.json({ error: '请选择要挂载的小游戏' }, { status: 400 });
    }

    if (!contentType.includes('multipart/form-data') && itemType !== 'miniapp') {
      const persistedFileUrl = await persistGeneratedAssetUrl(fileUrl, title, itemType);
      if (persistedFileUrl !== fileUrl) {
        uploadedFileUrl = persistedFileUrl;
        fileUrl = persistedFileUrl;
      }
    }

    const resource = await createTeacherResource(currentUser.id, {
      lesson_id: lessonId,
      module_id: moduleId,
      title,
      item_type: itemType,
      file_url: itemType === 'miniapp' ? null : fileUrl,
      duration,
      is_shared: isShared,
      miniAppMount:
        itemType === 'miniapp' && miniAppId
          ? {
              miniAppId,
              miniAppVersionId,
              aspectRatio,
              titleOverride,
              coverUrl,
              mountStatus,
              params: miniAppParams,
            }
          : undefined,
    });

    return NextResponse.json({
      success: true,
      resource: toTeacherResourceResponse(resource),
    });
  } catch (error) {
    await deleteDirectusFileByAssetUrl(uploadedFileUrl);
    console.error('Failed to create teacher resource:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建老师资源失败' },
      { status: 500 }
    );
  }
}
