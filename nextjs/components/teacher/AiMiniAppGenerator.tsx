'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Save, Trash2, WandSparkles } from 'lucide-react';
import { getDefaultAiMiniAppTitle } from '@/lib/ai-miniapp-title';

export type GeneratedMiniAppResource = {
  id: number;
  lesson_id: number;
  module_id: number;
  title: string;
  item_type: string;
  miniappMount?: {
    miniAppId: number;
    miniAppVersionId: number | null;
    app?: {
      appKey: string;
      name: string;
    } | null;
    version?: {
      entryUrl: string;
    } | null;
  } | null;
};

type GameType = 'quiz' | 'matching' | 'sequence';

type MiniAppPreview = {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: GameType;
  html: string;
  generationSource: 'openmaic' | 'template';
  openMaicError: string | null;
  savedResource?: GeneratedMiniAppResource | null;
};

interface AiMiniAppGeneratorProps {
  fixedLessonId?: number | null;
  fixedModuleId?: number | null;
  compact?: boolean;
  onGenerated?: (resource: GeneratedMiniAppResource) => void;
  onDeleted?: (resourceId: number) => void;
}

function toPreviewUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export default function AiMiniAppGenerator({
  fixedLessonId,
  fixedModuleId,
  compact = false,
  onGenerated,
  onDeleted,
}: AiMiniAppGeneratorProps) {
  const [lessonId, setLessonId] = useState(
    fixedLessonId ? String(fixedLessonId) : '',
  );
  const [moduleId, setModuleId] = useState(
    fixedModuleId ? String(fixedModuleId) : '',
  );
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [gameType, setGameType] = useState<GameType>('quiz');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<MiniAppPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(
    () => (preview?.html ? toPreviewUrl(preview.html) : ''),
    [preview?.html],
  );

  useEffect(() => {
    if (fixedLessonId) {
      setLessonId(String(fixedLessonId));
    }
  }, [fixedLessonId]);

  useEffect(() => {
    if (fixedModuleId) {
      setModuleId(String(fixedModuleId));
    }
  }, [fixedModuleId]);

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    setFeedback(null);
    setPreview(null);

    try {
      const trimmedPrompt = prompt.trim();
      const generatedTitle =
        title.trim() ||
        getDefaultAiMiniAppTitle(gameType);
      const response = await fetch('/api/teacher/miniapps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: Number(lessonId),
          moduleId: Number(moduleId),
          title: generatedTitle,
          prompt: trimmedPrompt,
          gradeLevel,
          gameType,
          previewOnly: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        preview?: MiniAppPreview;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.preview) {
        throw new Error(payload.error || '生成小游戏失败');
      }

      setPreview(payload.preview);
      setFeedback('小游戏已生成，可先预览，再保存到本课程资源。');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '生成小游戏失败');
    } finally {
      setGenerating(false);
    }
  }

  async function savePreview() {
    if (!preview) return;

    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch('/api/teacher/miniapps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: Number(lessonId),
          moduleId: Number(moduleId),
          title: preview.title,
          prompt: preview.prompt,
          gradeLevel: preview.gradeLevel,
          gameType: preview.gameType,
          html: preview.html,
          generationSource: preview.generationSource,
          openMaicError: preview.openMaicError,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        resource?: GeneratedMiniAppResource;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.resource) {
        throw new Error(payload.error || '保存小游戏资源失败');
      }

      setPreview((current) =>
        current ? { ...current, savedResource: payload.resource || null } : current,
      );
      onGenerated?.(payload.resource);
      setFeedback(`已保存「${payload.resource.title}」到本课程资源。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存小游戏资源失败');
    } finally {
      setSaving(false);
    }
  }

  async function deletePreview() {
    if (!preview) return;

    if (preview.savedResource?.id) {
      try {
        const response = await fetch(
          `/api/teacher/resources/${preview.savedResource.id}`,
          { method: 'DELETE' },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '删除小游戏资源失败');
        }
        onDeleted?.(preview.savedResource.id);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : '删除小游戏资源失败',
        );
        return;
      }
    }

    setPreview(null);
    setFeedback('已删除当前小游戏内容。');
    setError(null);
  }

  return (
    <section
      className={
        compact
          ? 'rounded-[24px] border border-[#d9c29b]/45 bg-[#fff8eb]/70 p-4'
          : 'portal-panel p-5 md:p-6'
      }
    >
      <div className="mb-4 text-base font-semibold text-stone-900">
        小游戏制作助手
      </div>
      <form onSubmit={handleGenerate} className="grid gap-4">
        {!fixedLessonId || !fixedModuleId ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-stone-700">
              课时 ID
              <input
                value={lessonId}
                onChange={(event) => setLessonId(event.target.value)}
                required
                inputMode="numeric"
                className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                placeholder="例如 224"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-stone-700">
              模块 ID
              <input
                value={moduleId}
                onChange={(event) => setModuleId(event.target.value)}
                required
                inputMode="numeric"
                className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                placeholder="例如 1036"
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-[1fr_12rem_12rem]">
          <label className="grid gap-2 text-sm font-medium text-stone-700">
            小游戏标题
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-stone-700">
            适用学段
            <input
              value={gradeLevel}
              onChange={(event) => setGradeLevel(event.target.value)}
              className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-stone-700 md:w-60">
            游戏类型
            <select
              value={gameType}
              onChange={(event) => setGameType(event.target.value as GameType)}
              className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
            >
              <option value="quiz">问答闯关</option>
              <option value="matching">配对游戏</option>
              <option value="sequence">排序挑战</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            required
            rows={2}
            className="min-h-16 flex-1 rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 text-sm leading-6 outline-none focus:border-[#8f2017]"
            placeholder="小游戏生成要求"
          />
          <button
            type="submit"
            disabled={generating || !prompt.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] transition-colors hover:bg-[#741812] disabled:opacity-60 md:w-32"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="h-4 w-4" />
            )}
            {generating ? '生成中' : '生成'}
          </button>
        </div>
      </form>

      {preview ? (
        <div className="mt-5 rounded-3xl border border-[#d9c29b]/45 bg-white/80 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-semibold text-stone-900">{preview.title}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  window.open(previewUrl, '_blank', 'noopener,noreferrer')
                }
                className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-4 py-2 text-xs font-semibold text-stone-700"
              >
                <Eye className="h-3.5 w-3.5" />
                预览
              </button>
              <button
                type="button"
                onClick={() => void savePreview()}
                disabled={saving || Boolean(preview.savedResource?.id)}
                className="inline-flex items-center gap-2 rounded-full border border-[#8f2017]/25 bg-white px-4 py-2 text-xs font-semibold text-[#8f2017] disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {preview.savedResource?.id ? '已保存' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => void deletePreview()}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>

          <iframe
            src={previewUrl}
            title={preview.title}
            className="mt-4 h-[420px] w-full rounded-2xl border border-[#d9c29b]/45 bg-white"
          />
        </div>
      ) : null}

      {feedback ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
    </section>
  );
}
