import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const incomingForm = await request.formData().catch(() => null);
  const pdf = incomingForm?.get('pdf');
  if (!(pdf instanceof File) || pdf.size === 0) {
    return NextResponse.json({ error: '请上传 PDF 文件' }, { status: 400 });
  }
  if (!pdf.name.toLowerCase().endsWith('.pdf') && pdf.type !== 'application/pdf') {
    return NextResponse.json({ error: '只支持 PDF 文件' }, { status: 400 });
  }
  if (pdf.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF 文件不能超过 30MB' }, { status: 400 });
  }

  const formData = new FormData();
  formData.set('pdf', pdf, pdf.name);
  formData.set('providerId', String(incomingForm?.get('providerId') || 'unpdf'));
  for (const key of ['apiKey', 'baseUrl']) {
    const value = incomingForm?.get(key);
    if (typeof value === 'string' && value.trim()) {
      formData.set(key, value.trim());
    }
  }

  const headers = await buildOpenMaicHeaders(currentUser.id);
  delete headers['Content-Type'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}/api/parse-pdf`, {
      method: 'POST',
      headers,
      body: formData,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      return NextResponse.json(
        { error: payload?.error || `OpenMAIC PDF 解析失败：HTTP ${response.status}` },
        { status: response.status || 502 },
      );
    }
    return NextResponse.json({ success: true, data: payload.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OpenMAIC PDF 解析失败' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
