import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createDirectusSessionCookie } from '@/lib/directus-admin';

export const dynamic = 'force-dynamic';

function isLocalHostname(value: string) {
  return ['127.0.0.1', 'localhost', '::1'].includes(value.trim().toLowerCase());
}

function getPublicDirectusAdminUrl(request: NextRequest): URL | null {
  const configured = process.env.DIRECTUS_ADMIN_PUBLIC_URL?.trim();
  if (configured) {
    const configuredUrl = new URL(configured);
    if (!isLocalHostname(configuredUrl.hostname)) {
      return configuredUrl;
    }
  }

  const forwardedProto =
    request.headers.get('x-forwarded-proto') ||
    request.nextUrl.protocol.replace(':', '');
  const forwardedHost =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    request.nextUrl.host;

  const currentHost = request.nextUrl.hostname || '';
  if (isLocalHostname(currentHost) && isLocalHostname(forwardedHost.split(':')[0] || '')) {
    const url = new URL(`${forwardedProto}://${forwardedHost}`);
    url.port = '8055';
    url.pathname = '/admin/content/';
    return url;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.redirect(new URL('/login/admin?redirect=/manage', request.url));
  }

  const directusAdminUrl = getPublicDirectusAdminUrl(request);
  if (!directusAdminUrl) {
    return NextResponse.redirect(new URL('/manage/content', request.url));
  }

  const sessionCookie = await createDirectusSessionCookie();
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="1;url=${directusAdminUrl.toString()}" />
    <title>正在进入运维后台</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f3f4f6;
        color: #111827;
        font: 16px/1.5 system-ui, sans-serif;
      }
      .card {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        padding: 24px 28px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      }
    </style>
  </head>
  <body>
    <div class="card">正在进入运维后台...</div>
    <script>
      setTimeout(function () {
        window.location.replace(${JSON.stringify(directusAdminUrl.toString())});
      }, 400);
    </script>
  </body>
</html>`;

  const response = new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
  response.cookies.set(sessionCookie.name, sessionCookie.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: directusAdminUrl.protocol === 'https:',
    path: '/',
    maxAge: sessionCookie.maxAge,
  });

  return response;
}
