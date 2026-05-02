import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createPptx, type PptxCanvasSlideInput, type PptxSlideInput } from '@/lib/pptx-export';
import { createOpenMaicPptx, type OpenMaicCanvasSlide } from '@/lib/openmaic-pptx-export';
import { getTeacherResource } from '@/lib/teacher-plan';

export const dynamic = 'force-dynamic';

type ExportItem = {
  title?: string;
  itemType?: string;
  sourceType?: string;
  fileUrl?: string;
  duration?: number;
  teacherResourceId?: number | null;
};

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeFilename(value: string): string {
  return (value || 'courseware').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 80) || 'courseware';
}

function itemTypeLabel(value?: string): string {
  const labels: Record<string, string> = {
    miniapp: '互动游戏',
    interactive: '互动课件',
    video: '视频',
    audio: '音频',
    image: '图片',
    doc: '文档',
    ppt: '演示',
  };
  return labels[value || ''] || value || '资源';
}

function itemToSlide(item: ExportItem, index: number): PptxSlideInput {
  const title = normalizeText(item.title, `课堂资源 ${index + 1}`);
  const bullets = [
    `资源类型：${itemTypeLabel(item.itemType)}`,
    `来源：${item.sourceType === 'standard' ? '标准课程资源' : '教师发布资源'}`,
  ];
  if (item.duration) bullets.push(`建议时长：${item.duration} 秒`);
  if (item.fileUrl) bullets.push(`资源链接：${item.fileUrl}`);
  return {
    title: `${index + 1}. ${title}`,
    subtitle: '课堂装配资源',
    bullets,
  };
}

function extractCanvasSlidesFromPayload(payload: unknown): OpenMaicCanvasSlide[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const scenes = (payload as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return [];
  const slides: OpenMaicCanvasSlide[] = [];
  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue;
    const record = scene as Record<string, unknown>;
    const content = record.content && typeof record.content === 'object' ? record.content as Record<string, unknown> : {};
    const canvas = content.canvas && typeof content.canvas === 'object' ? content.canvas as OpenMaicCanvasSlide['canvas'] : null;
    const actions = Array.isArray(record.actions) ? record.actions as OpenMaicCanvasSlide['actions'] : [];
    if (canvas) slides.push({ title: normalizeText(record.title, 'OpenMAIC Slide'), canvas, actions });
  }
  return slides;
}

async function loadCanvasSlidesFromItems(authUserId: string, items: ExportItem[]): Promise<OpenMaicCanvasSlide[]> {
  const slides: OpenMaicCanvasSlide[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const resourceId = Number(item.teacherResourceId || 0);
    if (!Number.isInteger(resourceId) || resourceId <= 0 || seen.has(resourceId)) continue;
    seen.add(resourceId);
    const resource = await getTeacherResource(authUserId, resourceId);
    if (!resource) {
      throw new Error(`TEACHER_RESOURCE_NOT_FOUND:${resourceId}`);
    }
    if (!resource.source_payload) continue;
    slides.push(...extractCanvasSlidesFromPayload(resource.source_payload));
  }
  return slides;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const lessonTitle = normalizeText(body?.lessonTitle, '课程课件').slice(0, 120);
  const items = Array.isArray(body?.items) ? (body.items as ExportItem[]) : [];
  const slides = items.map(itemToSlide);
  let canvasSlides: OpenMaicCanvasSlide[] = [];
  try {
    canvasSlides = await loadCanvasSlidesFromItems(currentUser.id, items);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('TEACHER_RESOURCE_NOT_FOUND:')) {
      return Response.json({ error: '资源不存在或无权导出' }, { status: 404 });
    }
    throw error;
  }
  const pptx = canvasSlides.length > 0
    ? await createOpenMaicPptx(canvasSlides, lessonTitle)
    : createPptx({
        title: lessonTitle,
        subtitle: `导出时间：${new Date().toLocaleString('zh-CN')}`,
        slides,
      });

  return new Response(new Uint8Array(pptx), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(sanitizeFilename(lessonTitle))}.pptx"`,
      'Content-Length': String(pptx.length),
      'Cache-Control': 'no-store',
    },
  });
}
