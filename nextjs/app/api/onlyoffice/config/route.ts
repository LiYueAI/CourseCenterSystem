import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ONLYOFFICE_SECRET = new TextEncoder().encode(
  process.env.ONLYOFFICE_JWT_SECRET || 'course-platform-onlyoffice-secret-2026-change-in-production'
);

function getRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(':', '');
  return `${protocol}://${host}`;
}

function normalizeDocumentUrl(request: NextRequest, rawSrc: string): string | null {
  const src = rawSrc.trim();
  if (!src) {
    return null;
  }

  const requestOrigin = getRequestOrigin(request);

  try {
    const url = new URL(src, requestOrigin);
    const allowedOrigins = new Set([requestOrigin]);
    const sameOrigin = allowedOrigins.has(url.origin);
    const allowedPath =
      url.pathname.startsWith('/media/assets/') || url.pathname.startsWith('/resources/');

    if (!sameOrigin || !allowedPath) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function inferFileType(rawType: string | null, rawSrc: string, rawTitle: string): string {
  const explicit = (rawType || '').trim().toLowerCase();
  if (explicit === 'ppt') return 'pptx';
  if (explicit === 'doc') {
    const combined = `${rawSrc} ${rawTitle}`.toLowerCase();
    if (combined.includes('.docx')) return 'docx';
    if (combined.includes('.doc')) return 'doc';
    if (combined.includes('.xlsx')) return 'xlsx';
    if (combined.includes('.xls')) return 'xls';
    if (combined.includes('.odt')) return 'odt';
    if (combined.includes('.ods')) return 'ods';
    return 'docx';
  }

  const combined = `${rawSrc} ${rawTitle}`.toLowerCase();
  const match = combined.match(/\.(pptx|ppt|docx|doc|xlsx|xls|odt|ods)\b/);
  return match?.[1] || 'pptx';
}

function inferDocumentType(fileType: string): 'word' | 'cell' | 'slide' {
  if (['ppt', 'pptx', 'odp'].includes(fileType)) {
    return 'slide';
  }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(fileType)) {
    return 'cell';
  }
  return 'word';
}

function buildDocumentKey(documentUrl: string, fileType: string): string {
  return createHash('sha256').update(`${documentUrl}:${fileType}`).digest('hex').slice(0, 32);
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const src = request.nextUrl.searchParams.get('src') || '';
  const title = (request.nextUrl.searchParams.get('title') || '未命名文档').trim();
  const type = request.nextUrl.searchParams.get('type');

  const documentUrl = normalizeDocumentUrl(request, src);
  if (!documentUrl) {
    return NextResponse.json({ error: '无效的文档地址' }, { status: 400 });
  }

  const fileType = inferFileType(type, src, title);
  const documentType = inferDocumentType(fileType);
  const config = {
    document: {
      fileType,
      key: buildDocumentKey(documentUrl, fileType),
      title,
      url: documentUrl,
      permissions: {
        copy: true,
        download: true,
        edit: false,
        print: true,
        review: false,
      },
    },
    documentType,
    editorConfig: {
      lang: 'zh-CN',
      mode: 'view',
      customization: {
        compactHeader: true,
        compactToolbar: true,
        hideRightMenu: true,
        toolbarNoTabs: true,
      },
      user: {
        id: currentUser.id,
        name: currentUser.name,
      },
    },
    height: '100%',
    type: 'embedded',
    width: '100%',
  };

  const token = await new SignJWT(config)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(ONLYOFFICE_SECRET);

  return NextResponse.json({
    config: {
      ...config,
      token,
    },
  });
}
