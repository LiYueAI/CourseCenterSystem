import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  generateAiMiniAppPreview,
  normalizeAiMiniAppInput,
  publishAiMiniApp,
} from '@/lib/ai-miniapp-generator';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const normalized = normalizeAiMiniAppInput(body);

    if (!normalized.prompt) {
      return NextResponse.json({ error: '请填写小游戏生成要求' }, { status: 400 });
    }

    const preview = await generateAiMiniAppPreview({
      title: normalized.title,
      prompt: normalized.prompt,
      gradeLevel: normalized.gradeLevel,
      gameType: normalized.gameType,
      authUserId: currentUser.id,
      providedHtml: normalized.providedHtml,
      providedGenerationSource: normalized.providedGenerationSource,
      providedOpenMaicError: normalized.providedOpenMaicError,
    });

    if (normalized.previewOnly) {
      return NextResponse.json({
        success: true,
        preview,
      });
    }

    const published = await publishAiMiniApp({
      authUserId: currentUser.id,
      title: preview.title,
      prompt: preview.prompt,
      gradeLevel: preview.gradeLevel,
      gameType: preview.gameType,
      html: preview.html,
      generationSource: preview.generationSource,
      openMaicError: preview.openMaicError,
    });

    return NextResponse.json({
      success: true,
      miniApp: published.miniApp,
      version: published.version,
      generationSource: published.generationSource,
      openMaicError: published.openMaicError,
    });
  } catch (error) {
    console.error('Admin AI miniapp generation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成小游戏失败' },
      { status: 500 },
    );
  }
}
