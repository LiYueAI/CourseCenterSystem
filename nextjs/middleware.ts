import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// JWT secret
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'course-platform-jwt-secret-2026-change-in-production'
);

type MiddlewareTokenPayload = {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
};

// Public routes that don't require authentication
const publicRoutes = [
  '/',
  '/login',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
];

// Route role requirements
const routeRoles: Record<string, string[]> = {
  '/teacher': ['teacher', 'admin'],
  '/manage': ['admin'],
  '/student': ['student', 'admin'],
};

const apiRouteRoles: Record<string, string[]> = {
  '/api/teacher': ['teacher', 'admin'],
  '/api/admin': ['admin'],
  '/api/ai': ['teacher', 'admin'],
  '/api/openmaic': ['teacher', 'admin'],
  '/api/student': ['student', 'admin'],
  '/api/upload': ['teacher', 'admin'],
};

function findRequiredRoles(pathname: string): string[] | null {
  // Check exact matches first
  for (const [route, roles] of Object.entries(routeRoles)) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return roles;
    }
  }

  // Check API routes
  for (const [route, roles] of Object.entries(apiRouteRoles)) {
    if (pathname.startsWith(route + '/') || pathname === route) {
      return roles;
    }
  }

  return null;
}


function unauthorizedApiResponse(): NextResponse {
  return NextResponse.json({ error: '登录已过期，请重新登录。' }, { status: 401 });
}

function redirectToLogin(pathname: string, baseUrl: string): NextResponse {
  let loginPath = '/login/teacher';

  if (pathname.startsWith('/manage')) {
    loginPath = '/login/admin';
  } else if (pathname.startsWith('/student')) {
    loginPath = '/login/student';
  }

  const loginUrl = new URL(loginPath, baseUrl);
  loginUrl.searchParams.set('redirect', pathname);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete('auth_token');
  return response;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function verifyJwtInMiddleware(
  token: string
): Promise<MiddlewareTokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const header = JSON.parse(decodeBase64Url(encodedHeader)) as { alg?: string };
    if (header.alg !== 'HS256') {
      return null;
    }

    const key = await crypto.subtle.importKey(
      'raw',
      JWT_SECRET,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    const expected = toBase64Url(new Uint8Array(signature));
    if (expected !== encodedSignature) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as MiddlewareTokenPayload;
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;

  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // Also allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if route requires specific roles
  const requiredRoles = findRequiredRoles(pathname);

  if (!requiredRoles) {
    // No role requirement found, allow (e.g., homepage)
    return NextResponse.next();
  }

  // Get auth token from cookie
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return unauthorizedApiResponse();
    }
    return redirectToLogin(pathname, baseUrl);
  }

  // Validate token
  const payload = await verifyJwtInMiddleware(token);
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return unauthorizedApiResponse();
    }
    return redirectToLogin(pathname, baseUrl);
  }

  // Check role
  const userRole = payload.role as string;
  if (!requiredRoles.includes(userRole)) {
    // User doesn't have required role - redirect to their appropriate login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '无权访问该接口。' }, { status: 403 });
    }
    return redirectToLogin(pathname, baseUrl);
  }

  // Add user info to request headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.sub as string);
  requestHeaders.set('x-user-role', userRole);
  requestHeaders.set('x-user-email', payload.email as string);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - Directus assets (proxied through nginx)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|\\/directus).*)',
  ],
};
