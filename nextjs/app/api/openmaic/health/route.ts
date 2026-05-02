import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type ServiceStatus = 'online' | 'offline' | 'not_configured';

interface HealthCheckResult {
  id: string;
  name: string;
  url: string | null;
  status: ServiceStatus;
  detail: string;
}

const DEFAULT_OPENMAIC_BASE_URL = 'http://127.0.0.1:3010';
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getConfiguredUrl(value: string | undefined, fallback: string): string {
  return trimTrailingSlash(value?.trim() || fallback);
}

async function checkJsonEndpoint(
  id: string,
  name: string,
  url: string | null,
  path: string,
  timeoutMs = 2500
): Promise<HealthCheckResult> {
  if (!url) {
    return {
      id,
      name,
      url,
      status: 'not_configured',
      detail: '尚未配置服务地址',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
    });

    return {
      id,
      name,
      url,
      status: response.ok ? 'online' : 'offline',
      detail: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      id,
      name,
      url,
      status: 'offline',
      detail: error instanceof Error ? error.message : '请求失败',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !['admin', 'teacher'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const openmaicBaseUrl = getConfiguredUrl(
    process.env.OPENMAIC_BASE_URL,
    DEFAULT_OPENMAIC_BASE_URL
  );
  const [openmaic] = await Promise.all([
    checkJsonEndpoint('openmaic', 'OpenMAIC 创作引擎', openmaicBaseUrl, '/api/health'),
  ]);

  return NextResponse.json({
    services: [openmaic],
    priorities: ['互动游戏', 'PPT/课件', '讲稿', '项目协助', '实操对话'],
    hiddenFeatures: ['课堂圆桌讨论', '多智能体课堂辩论', '学生端实时 AI 讨论'],
  });
}
