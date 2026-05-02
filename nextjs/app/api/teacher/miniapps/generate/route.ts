import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  generateAiMiniAppPreview,
  normalizeAiMiniAppInput,
  publishAiMiniApp,
} from '@/lib/ai-miniapp-generator';
import { createTeacherResource } from '@/lib/teacher-plan';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toTeacherResourceResponse(
  resource: Awaited<ReturnType<typeof createTeacherResource>>,
) {
  return {
    ...resource,
    miniappMount: resource.miniAppMount ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const lessonId = parsePositiveInt(body?.lessonId ?? body?.lesson_id);
    const moduleId = parsePositiveInt(body?.moduleId ?? body?.module_id);
    const normalized = normalizeAiMiniAppInput(body);

    if (!lessonId) {
      return NextResponse.json({ error: '无效的课时 ID' }, { status: 400 });
    }
    if (!moduleId) {
      return NextResponse.json({ error: '无效的模块 ID' }, { status: 400 });
    }
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

    const resource = await createTeacherResource(currentUser.id, {
      lesson_id: lessonId,
      module_id: moduleId,
      title: preview.title,
      item_type: 'miniapp',
      file_url: null,
      duration: 0,
      miniAppMount: {
        miniAppId: published.miniApp.id,
        miniAppVersionId: published.version.id,
        aspectRatio: '16:9',
        titleOverride: preview.title,
        coverUrl: null,
        mountStatus: 'active',
        params: {
          generatedBy: 'ai-studio',
          generationSource: preview.generationSource,
          gameType: preview.gameType,
          gradeLevel: preview.gradeLevel,
        },
      },
    });

    return NextResponse.json({
      success: true,
      miniApp: published.miniApp,
      version: published.version,
      generationSource: published.generationSource,
      openMaicError: published.openMaicError,
      resource: toTeacherResourceResponse(resource),
    });
  } catch (error) {
    console.error('AI miniapp generation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成小游戏失败' },
      { status: 500 },
    );
  }
}
