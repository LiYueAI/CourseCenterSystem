'use client';

import { useMemo, useState } from 'react';
import {
  Eye,
  ImageIcon,
  Loader2,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import AiMiniAppGenerator, { type GeneratedMiniAppResource } from './AiMiniAppGenerator';
import OpenMaicChatAssistant from './OpenMaicChatAssistant';
import OpenMaicClassroomGenerator, { type ImportedOpenMaicResource } from './OpenMaicClassroomGenerator';

export type LessonAiResource = {
  id: number;
  auth_user_id?: string;
  lesson_id: number;
  module_id: number;
  title: string;
  item_type: string;
  file_url?: string | null;
  duration?: number | null;
  miniappMount?: unknown;
};

type AiMode =
  | 'full'
  | 'game'
  | 'project'
  | 'script'
  | 'image'
  | 'video';

type GeneratedDraft = {
  kind: Exclude<AiMode, 'full' | 'game'>;
  title: string;
  itemType: string;
  fileUrl?: string;
  duration?: number;
  preview: string;
  savedResource?: LessonAiResource | null;
};

interface LessonAiCreationCenterProps {
  lessonId: number;
  moduleId: number;
  lessonTitle?: string;
  moduleName?: string;
  onImported?: (resources: ImportedOpenMaicResource[]) => void;
  onGeneratedMiniApp?: (resource: GeneratedMiniAppResource) => void;
  onResourceCreated?: (resource: LessonAiResource) => void;
  onResourceDeleted?: (resourceId: number) => void;
}

const modes: Array<{ id: AiMode; label: string; description: string }> = [
  { id: 'full', label: '整课包', description: 'PPT、讲稿、项目、互动游戏' },
  { id: 'game', label: '互动游戏', description: '先生成预览，再保存小游戏资源' },
  { id: 'project', label: '项目任务', description: 'PBL 实操步骤和评价标准' },
  { id: 'script', label: '教师讲稿', description: '生成课堂讲解话术' },
  { id: 'image', label: '课件图片', description: '生成封面、插图或情境图' },
  { id: 'video', label: '生成视频', description: '生成短视频素材' },
];

function normalizeText(value: string): string {
  return value.trim();
}

function htmlDataUrl(title: string, content: string): string {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.8;padding:32px;color:#292524;background:#fffaf2;white-space:pre-wrap}</style></head><body><h1>${escapeHtml(
    title,
  )}</h1>${escapeHtml(content)}</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[char] || char));
}

function pickImageUrl(result: any): string {
  const candidates = [
    result?.url,
    result?.imageUrl,
    result?.image_url,
    result?.data?.url,
    result?.data?.imageUrl,
    result?.images?.[0]?.url,
    result?.images?.[0]?.imageUrl,
    result?.output?.url,
  ];
  const base64 =
    result?.base64 ||
    result?.imageBase64 ||
    result?.data?.base64 ||
    result?.images?.[0]?.base64;
  const url = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim(),
  );
  if (url) return url;
  if (typeof base64 === 'string' && base64.trim()) {
    return `data:image/png;base64,${base64}`;
  }
  return '';
}

function pickVideoUrl(result: any): string {
  const candidates = [
    result?.url,
    result?.videoUrl,
    result?.video_url,
    result?.data?.url,
    result?.output?.url,
    result?.content?.video_url,
  ];
  return (
    candidates.find(
      (candidate) => typeof candidate === 'string' && candidate.trim(),
    ) || ''
  );
}

function canPreviewDraft(itemType: string) {
  return itemType !== 'doc';
}

export default function LessonAiCreationCenter({
  lessonId,
  moduleId,
  lessonTitle,
  moduleName,
  onImported,
  onGeneratedMiniApp,
  onResourceCreated,
  onResourceDeleted,
}: LessonAiCreationCenterProps) {
  const [mode, setMode] = useState<AiMode>('full');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('AI 生成资源');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextPrefix = useMemo(() => {
    return `当前课时：${lessonTitle || '未命名课时'}\n当前流程：${
      moduleName || '当前教学流程'
    }\n`;
  }, [lessonTitle, moduleName]);

  const placeholder = useMemo(() => {
    switch (mode) {
      case 'project':
        return '请设计一个 20 分钟项目式实操任务，包含目标、材料、步骤、分组、评价标准和拓展任务。';
      case 'script':
        return '请生成 3 分钟教师讲稿，包含导入、提问、讲解、过渡和小结。';
      case 'image':
        return '为本流程生成一张 16:9 课件插图，风格温暖、清晰、适合课堂展示。';
      case 'video':
        return '生成一段 5 秒课堂导入短视频，画面简洁、有教学氛围，适合作为课件开场。';
      default:
        return '';
    }
  }, [mode]);

  function resetSingleDraft() {
    setDraft(null);
    setError(null);
    setFeedback(null);
  }

  async function generateDraft() {
    const requirement = normalizeText(prompt || placeholder);
    if (!requirement) {
      setError('请填写生成要求');
      return;
    }

    setLoading(true);
    setDraft(null);
    setFeedback(null);
    setError(null);

    try {
      if (mode === 'project') {
        const response = await fetch('/api/openmaic/pbl/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `${contextPrefix}${requirement}` }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '项目任务生成失败');
        }
        const content = payload.message || '';
        setDraft({
          kind: 'project',
          title: title || 'AI 项目任务',
          itemType: 'doc',
          fileUrl: htmlDataUrl(title || 'AI 项目任务', content),
          preview: content,
          savedResource: null,
        });
      } else if (mode === 'script') {
        const response = await fetch('/api/openmaic/generate/scene-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || '教师讲稿',
            description: `${contextPrefix}${requirement}`,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          actions?: Array<Record<string, unknown>>;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '教师讲稿生成失败');
        }
        const speeches = (payload.actions || [])
          .filter(
            (action) => action.type === 'speech' && typeof action.text === 'string',
          )
          .map((action) => String(action.text).trim())
          .filter(Boolean);
        const content =
          speeches.join('\n\n') ||
          JSON.stringify(payload.actions || [], null, 2);
        setDraft({
          kind: 'script',
          title: title || 'AI 教师讲稿',
          itemType: 'doc',
          fileUrl: htmlDataUrl(title || 'AI 教师讲稿', content),
          preview: content,
          savedResource: null,
        });
      } else if (mode === 'image') {
        const response = await fetch('/api/openmaic/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `${contextPrefix}${requirement}`,
            aspectRatio: '16:9',
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          result?: any;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '图片生成失败');
        }
        const url = pickImageUrl(payload.result);
        if (!url) {
          throw new Error('图片生成成功但未返回可用 URL');
        }
        setDraft({
          kind: 'image',
          title: title || 'AI 课件图片',
          itemType: 'image',
          fileUrl: url,
          preview: url,
          savedResource: null,
        });
      } else if (mode === 'video') {
        const response = await fetch('/api/openmaic/generate/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `${contextPrefix}${requirement}`,
            duration: 5,
            aspectRatio: '16:9',
            resolution: '720p',
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          result?: any;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '视频生成失败');
        }
        const url = pickVideoUrl(payload.result);
        if (!url) {
          throw new Error('视频生成成功但未返回可用 URL');
        }
        setDraft({
          kind: 'video',
          title: title || 'AI 生成视频',
          itemType: 'video',
          fileUrl: url,
          duration: Number(payload.result?.duration) || 5,
          preview: url,
          savedResource: null,
        });
      }
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'AI 生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch('/api/teacher/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          moduleId,
          title: draft.title,
          itemType: draft.itemType,
          fileUrl: draft.fileUrl,
          duration: draft.duration || 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        resource?: LessonAiResource;
        teacherResource?: LessonAiResource;
        error?: string;
      };
      const resource = payload.resource || payload.teacherResource;
      if (!response.ok || !payload.success || !resource) {
        throw new Error(payload.error || '保存 AI 资源失败');
      }
      onResourceCreated?.(resource);
      setDraft((current) =>
        current ? { ...current, savedResource: resource } : current,
      );
      setFeedback(`已保存「${resource.title}」到本课程资源。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 AI 资源失败');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!draft) return;

    if (draft.savedResource?.id) {
      try {
        const response = await fetch(
          `/api/teacher/resources/${draft.savedResource.id}`,
          {
            method: 'DELETE',
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '删除课程资源失败');
        }
        onResourceDeleted?.(draft.savedResource.id);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error ? deleteError.message : '删除课程资源失败',
        );
        return;
      }
    }

    setDraft(null);
    setFeedback(`已删除「${draft.title}」。`);
    setError(null);
  }

  function previewDraft() {
    if (!draft?.fileUrl || !canPreviewDraft(draft.itemType)) {
      return;
    }
    window.open(draft.fileUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="rounded-[28px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fffaf2,#ffffff)] p-5 shadow-[0_18px_45px_rgba(92,56,24,0.08)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">
            AI备课
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            下面是一些AI工具。
          </p>
        </div>
        <div className="rounded-full border border-[#d9c29b]/60 bg-white/82 px-4 py-2 text-xs text-stone-500">
          当前流程：{moduleName || moduleId}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setMode(item.id);
              resetSingleDraft();
            }}
            className={`rounded-3xl border px-4 py-3 text-left transition-colors ${
              mode === item.id
                ? 'border-[#8f2017]/45 bg-[#8f2017] text-[#f8ead1]'
                : 'border-[#d9c29b]/55 bg-white/78 text-stone-700 hover:border-[#c58d3e]'
            }`}
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <div
              className={`mt-1 text-xs leading-5 ${
                mode === item.id ? 'text-[#f8ead1]/82' : 'text-stone-500'
              }`}
            >
              {item.description}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {mode === 'full' ? (
          <OpenMaicClassroomGenerator
            fixedLessonId={lessonId}
            fixedModuleId={moduleId}
            compact
            onImported={onImported}
          />
        ) : mode === 'game' ? (
          <AiMiniAppGenerator
            fixedLessonId={lessonId}
            fixedModuleId={moduleId}
            compact
            onGenerated={onGeneratedMiniApp}
            onDeleted={onResourceDeleted}
          />
        ) : (
          <div className="grid gap-4 rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4">
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <label className="grid gap-2 text-sm font-medium text-stone-700">
                资源标题
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 outline-none focus:border-[#8f2017]"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-stone-700">
                生成要求
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={placeholder}
                  className="rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 leading-7 outline-none focus:border-[#8f2017]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={generateDraft}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === 'image' ? (
                  <ImageIcon className="h-4 w-4" />
                ) : mode === 'video' ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? '生成中...' : '生成'}
              </button>
              {draft ? (
                <>
                  {canPreviewDraft(draft.itemType) ? (
                    <button
                      type="button"
                      onClick={previewDraft}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-5 py-3 text-sm font-semibold text-stone-700"
                    >
                      <Eye className="h-4 w-4" />
                      预览
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={saving || Boolean(draft.savedResource?.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-5 py-3 text-sm font-semibold text-stone-700 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {draft.savedResource?.id ? '已保存' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteDraft()}
                    className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                </>
              ) : null}
            </div>

            {draft ? (
              <div className="rounded-3xl border border-[#d9c29b]/45 bg-[#fff8eb]/70 p-4 text-sm text-stone-700">
                <div className="mb-3 flex items-center gap-2 font-semibold text-stone-900">
                  <Rocket className="h-4 w-4 text-[#8f2017]" />
                  生成结果：{draft.title}
                </div>
                {draft.itemType === 'image' ? (
                  <img
                    src={draft.preview}
                    alt={draft.title}
                    className="max-h-80 rounded-2xl border border-[#d9c29b]/40 object-contain"
                  />
                ) : null}
                {draft.itemType === 'video' ? (
                  <video
                    src={draft.preview}
                    controls
                    className="max-h-80 w-full rounded-2xl border border-[#d9c29b]/40"
                  />
                ) : null}
                {draft.itemType === 'audio' ? (
                  <audio src={draft.preview} controls className="w-full" />
                ) : null}
                {draft.itemType === 'doc' ? (
                  <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-white/78 p-4 leading-7">
                    {draft.preview}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-4">
        <OpenMaicChatAssistant
          embedded
          title="对话助手"
          stageName="教师备课"
          context={contextPrefix}
        />
      </div>

      {feedback ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
    </section>
  );
}
