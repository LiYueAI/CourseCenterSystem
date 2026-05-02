'use client';

import { useMemo, useState } from 'react';
import {
  Eye,
  Loader2,
  Save,
  Trash2,
  UploadCloud,
  WandSparkles,
} from 'lucide-react';
import { getDefaultAiMiniAppTitle } from '@/lib/ai-miniapp-title';

type UploadMode = 'file' | 'game';
type GameType = 'quiz' | 'matching' | 'sequence';

type MiniAppPreview = {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: GameType;
  html: string;
  generationSource: 'openmaic' | 'template';
  openMaicError: string | null;
  savedMiniApp?: {
    id: number;
    name: string;
    appKey: string;
    publishedVersionId: number | null;
  } | null;
  savedVersion?: {
    id: number;
    entryUrl: string;
  } | null;
};

function toPreviewUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export default function AdminResourceUploadPanel() {
  const [mode, setMode] = useState<UploadMode>('file');

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [gameTitle, setGameTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [gameType, setGameType] = useState<GameType>('quiz');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<MiniAppPreview | null>(null);

  const previewUrl = useMemo(
    () => (preview?.html ? toPreviewUrl(preview.html) : ''),
    [preview?.html],
  );

  function switchMode(nextMode: UploadMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  async function handleFileSubmit() {
    setError(null);
    setMessage(null);

    if (!file) {
      setError('请先选择要上传的附件');
      return;
    }

    setPending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim() || file.name);

      const response = await fetch('/api/admin/resources', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({ error: '上传失败' }));
      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }

      setTitle('');
      setFile(null);
      setMessage('资源已上传。');
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '上传失败');
    } finally {
      setPending(false);
    }
  }

  async function handleGenerateGame(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    setMessage(null);
    setPreview(null);

    try {
      const trimmedPrompt = prompt.trim();
      const generatedTitle =
        gameTitle.trim() ||
        getDefaultAiMiniAppTitle(gameType);

      const response = await fetch('/api/admin/miniapps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      setMessage('小游戏已生成，可先预览，再上传到小游戏库。');
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
    setMessage(null);

    try {
      const response = await fetch('/api/admin/miniapps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        miniApp?: {
          id: number;
          name: string;
          appKey: string;
          publishedVersionId: number | null;
        };
        version?: {
          id: number;
          entryUrl: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.miniApp) {
        throw new Error(payload.error || '上传小游戏失败');
      }

      setPreview((current) =>
        current
          ? {
              ...current,
              savedMiniApp: payload.miniApp || null,
              savedVersion: payload.version || null,
            }
          : current,
      );
      setMessage(`已上传小游戏「${payload.miniApp.name}」到小游戏库。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '上传小游戏失败');
    } finally {
      setSaving(false);
    }
  }

  async function deletePreview() {
    if (!preview) return;

    if (preview.savedMiniApp?.id) {
      try {
        const response = await fetch(
          `/api/admin/miniapps/${preview.savedMiniApp.id}`,
          { method: 'DELETE' },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '删除小游戏失败');
        }
      } catch (deleteError) {
        setError(
          deleteError instanceof Error ? deleteError.message : '删除小游戏失败',
        );
        return;
      }
    }

    setPreview(null);
    setMessage('已删除当前小游戏内容。');
    setError(null);
  }

  return (
    <section className="portal-panel p-6 md:p-8">
      <div className="space-y-5">
        <div className="flex items-center gap-3 text-stone-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
            {mode === 'game' ? (
              <WandSparkles className="h-5 w-5" />
            ) : (
              <UploadCloud className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">上传资源</h2>
            <div className="text-sm text-stone-500">
              先选择资源类型；选“游戏”后，会在这里直接展开 AI 生成入口。
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:max-w-xs">
          <label className="grid gap-2 text-sm font-medium text-stone-700">
            资源类型
            <select
              value={mode}
              onChange={(event) => switchMode(event.target.value as UploadMode)}
              className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
            >
              <option value="file">附件资源</option>
              <option value="game">游戏</option>
            </select>
          </label>
        </div>

        {mode === 'file' ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="输入资源标题，不填则默认使用文件名"
                className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
              <input
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 file:mr-3 file:rounded-full file:border-0 file:bg-[linear-gradient(180deg,#b83226,#7f1712)] file:px-3 file:py-2 file:text-[#f8ead1]"
              />
              <button
                type="button"
                onClick={handleFileSubmit}
                disabled={pending}
                className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)] disabled:opacity-60"
              >
                {pending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    上传中
                  </span>
                ) : (
                  '上传到资源库'
                )}
              </button>
            </div>

            {file ? (
              <div className="text-xs tracking-[0.12em] text-stone-500">
                已选择：{file.name}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-3xl border border-[#d9c29b]/45 bg-white/70 p-5">
            <div className="mb-4 flex items-center gap-3 text-stone-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                <WandSparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">AI 生成游戏</div>
                <div className="text-sm text-stone-500">
                  复用老师端小游戏生成能力，生成后直接上传到管理端小游戏库。
                </div>
              </div>
            </div>

            <form onSubmit={handleGenerateGame} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[1fr_12rem_12rem]">
                <label className="grid gap-2 text-sm font-medium text-stone-700">
                  小游戏标题
                  <input
                    value={gameTitle}
                    onChange={(event) => setGameTitle(event.target.value)}
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
                <label className="grid gap-2 text-sm font-medium text-stone-700">
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
                  rows={3}
                  className="min-h-20 flex-1 rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 text-sm leading-6 outline-none focus:border-[#8f2017]"
                  placeholder="输入游戏要求，例如题目主题、题量、适用年龄、玩法重点"
                />
                <button
                  type="submit"
                  disabled={generating || !prompt.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] transition-colors hover:bg-[#741812] disabled:opacity-60 md:w-36"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  {generating ? '生成中' : 'AI 生成游戏'}
                </button>
              </div>
            </form>

            {preview ? (
              <div className="mt-5 rounded-3xl border border-[#d9c29b]/45 bg-white/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-semibold text-stone-900">{preview.title}</div>
                    {preview.savedMiniApp ? (
                      <div className="mt-1 text-xs text-stone-500">
                        appKey：{preview.savedMiniApp.appKey}
                        {preview.savedVersion?.entryUrl
                          ? ` · 入口：${preview.savedVersion.entryUrl}`
                          : ''}
                      </div>
                    ) : null}
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
                      disabled={saving || Boolean(preview.savedMiniApp?.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#8f2017]/25 bg-white px-4 py-2 text-xs font-semibold text-[#8f2017] disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {preview.savedMiniApp?.id ? '已上传' : '上传到小游戏库'}
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
          </div>
        )}

        {message ? (
          <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[18px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
