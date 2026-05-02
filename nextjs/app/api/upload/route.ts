import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createAdminModuleItem,
  createAdminResource,
  listAdminModuleItems,
  uploadDirectusFile,
} from '@/lib/directus-admin';
import { createTeacherPrivateResource } from '@/lib/teacher-plan';

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

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const moduleId = formData.get('moduleId') as string;
    const lessonId = formData.get('lessonId') as string;
    const title = formData.get('title') as string || file?.name || '未命名';

    if (!file) {
      return NextResponse.json({ error: '没有文件' }, { status: 400 });
    }

    const parsedModuleId = Number(moduleId);
    if (!Number.isInteger(parsedModuleId) || parsedModuleId <= 0) {
      return NextResponse.json({ error: '模块ID无效' }, { status: 400 });
    }

    const fileUrl = await uploadDirectusFile(file, title);
    const itemType = detectItemType(file);

    if (currentUser.role === 'teacher') {
      const parsedLessonId = Number(lessonId);
      if (!Number.isInteger(parsedLessonId) || parsedLessonId <= 0) {
        return NextResponse.json({ error: '课时ID无效' }, { status: 400 });
      }

      const teacherResource = await createTeacherPrivateResource({
        authUserId: currentUser.id,
        lessonId: parsedLessonId,
        moduleId: parsedModuleId,
        title,
        itemType,
        fileUrl,
      });

      return NextResponse.json({
        success: true,
        teacherResource,
      });
    }

    const existingItems = await listAdminModuleItems(parsedModuleId);
    const item = await createAdminModuleItem({
      module_id: parsedModuleId,
      item_type: itemType,
      title,
      file_url: fileUrl,
      duration: 0,
      sort_order: existingItems.length + 1,
    });

    const resource = await createAdminResource({
      title,
      type: itemType,
      file_url: fileUrl,
      status: 'approved',
    });

    return NextResponse.json({
      success: true,
      item,
      resource,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
