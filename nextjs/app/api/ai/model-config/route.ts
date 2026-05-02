import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getDefaultAiModelConfig,
  toSafeAiModelConfig,
  upsertDefaultAiModelConfig,
} from '@/lib/ai-model-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const config = await getDefaultAiModelConfig(currentUser.id);

  return NextResponse.json({
    config: config ? toSafeAiModelConfig(config) : null,
    fallback: {
      providerName: '',
      baseUrl: '',
      model: '',
    },
  });
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const config = await upsertDefaultAiModelConfig(currentUser.id, {
      providerName: typeof body?.providerName === 'string' ? body.providerName : undefined,
      baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : '',
      apiKey: typeof body?.apiKey === 'string' ? body.apiKey : '',
      model: typeof body?.model === 'string' ? body.model : '',
    });

    return NextResponse.json({ success: true, config: toSafeAiModelConfig(config) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '保存模型配置失败' },
      { status: 400 }
    );
  }
}
