import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminResource, uploadDirectusFile } from '@/lib/directus-admin';

export const dynamic = 'force-dynamic';

function detectResourceType(file: File): string {
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
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const rawTitle = String(formData.get('title') || '').trim();

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: '没有可上传的文件' }, { status: 400 });
    }

    const title = rawTitle || file.name || '未命名资源';
    const fileUrl = await uploadDirectusFile(file, title);
    const type = detectResourceType(file);

    const resource = await createAdminResource({
      title,
      type,
      file_url: fileUrl,
      status: 'pending',
    });

    return NextResponse.json({ success: true, resource });
  } catch (error) {
    console.error('Create admin resource failed:', error);
    return NextResponse.json({ error: '资源上传失败' }, { status: 500 });
  }
}
