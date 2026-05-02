'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Loader2,
  Plus,
  Save,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import type { AdminModuleItem } from '@/lib/directus-admin';
import { getDefaultAiMiniAppTitle } from '@/lib/ai-miniapp-title';
import { resolveAssetUrl } from '@/lib/media-url';
import type { MiniAppSummary } from '@/lib/miniapps.types';

const ITEM_TYPES = ['video', 'miniapp'];
const ITEM_TYPE_LABELS: Record<string, string> = {
  miniapp: '游戏',
  video: '视频',
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

function requiresFile(itemType: string) {
  return itemType === 'video';
}

function getItemTypeLabel(itemType: string) {
  return ITEM_TYPE_LABELS[itemType] || itemType;
}

function toPreviewUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export default function ModuleItemsManager({
  moduleId,
  initialItems,
  miniApps,
}: {
  moduleId: number;
  initialItems: AdminModuleItem[];
  miniApps: MiniAppSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(
    [...initialItems]
      .filter((item) => ITEM_TYPES.includes(item.item_type))
      .sort((a, b) => a.sort_order - b.sort_order)
  );
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('video');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newMiniAppId, setNewMiniAppId] = useState('');
  const [newMiniAppVersionId, setNewMiniAppVersionId] = useState('');
  const [newMiniAppAspectRatio, setNewMiniAppAspectRatio] = useState('16:9');
  const [newMiniAppTitleOverride, setNewMiniAppTitleOverride] = useState('');
  const [newMiniAppParams, setNewMiniAppParams] = useState('{}');
  const [newMiniAppMode, setNewMiniAppMode] = useState<'existing' | 'ai'>('existing');
  const [aiTitle, setAiTitle] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGradeLevel, setAiGradeLevel] = useState('');
  const [aiGameType, setAiGameType] = useState<GameType>('quiz');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiPreview, setAiPreview] = useState<MiniAppPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mountDrafts, setMountDrafts] = useState<
    Record<
      number,
      {
        miniAppId: string;
        miniAppVersionId: string;
        aspectRatio: string;
        titleOverride: string;
        paramsJson: string;
      }
    >
  >(() =>
    Object.fromEntries(
      initialItems
        .filter((item) => ITEM_TYPES.includes(item.item_type))
        .map((item) => [
        item.id,
        {
          miniAppId: item.miniAppMount?.miniAppId ? String(item.miniAppMount.miniAppId) : '',
          miniAppVersionId: item.miniAppMount?.miniAppVersionId
            ? String(item.miniAppMount.miniAppVersionId)
            : '',
          aspectRatio: item.miniAppMount?.aspectRatio || '16:9',
          titleOverride: item.miniAppMount?.titleOverride || '',
          paramsJson: JSON.stringify(item.miniAppMount?.params || {}, null, 2),
        },
      ])
    )
  );
  const previewUrl = useMemo(
    () => (aiPreview?.html ? toPreviewUrl(aiPreview.html) : ''),
    [aiPreview?.html]
  );

  function getResolvedUrl(fileUrl?: string | null) {
    return resolveAssetUrl(fileUrl);
  }

  function resetAiComposer() {
    setAiTitle('');
    setAiPrompt('');
    setAiGradeLevel('');
    setAiGameType('quiz');
    setAiPreview(null);
  }

  function refreshPage() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function createItem() {
    setError(null);
    setFeedback(null);

    if (!newTitle.trim()) {
      setError('请填写课件标题');
      return;
    }

    if (requiresFile(newType) && !newFile) {
      setError('该课件类型需要上传文件');
      return;
    }

    if (newType === 'miniapp' && !newMiniAppId) {
      setError('请选择要挂载的小游戏');
      return;
    }

    const formData = new FormData();
    formData.append('title', newTitle.trim());
    formData.append('item_type', newType);
    if (newFile) {
      formData.append('file', newFile);
    }
    if (newType === 'miniapp') {
      formData.append('miniAppId', newMiniAppId);
      if (newMiniAppVersionId) {
        formData.append('miniAppVersionId', newMiniAppVersionId);
      }
      formData.append('aspectRatio', newMiniAppAspectRatio || '16:9');
      formData.append('titleOverride', newMiniAppTitleOverride);
      formData.append('miniAppParams', newMiniAppParams || '{}');
    }

    const response = await fetch(`/api/content/modules/${moduleId}/items`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '新增课件失败' }));
      setError(data.error || '新增课件失败');
      return;
    }

    const data = await response.json();
    setItems((current) =>
      [...current, data.item].sort((a, b) => a.sort_order - b.sort_order)
    );
    setNewTitle('');
    setNewType('video');
    setNewFile(null);
    setNewMiniAppId('');
    setNewMiniAppVersionId('');
    setNewMiniAppAspectRatio('16:9');
    setNewMiniAppTitleOverride('');
    setNewMiniAppParams('{}');
    setNewMiniAppMode('existing');
    refreshPage();
  }

  async function generateAiMiniAppPreview() {
    setAiGenerating(true);
    setError(null);
    setFeedback(null);
    setAiPreview(null);

    try {
      const trimmedPrompt = aiPrompt.trim();
      if (!trimmedPrompt) {
        throw new Error('请填写小游戏生成要求');
      }

      const generatedTitle =
        aiTitle.trim() ||
        getDefaultAiMiniAppTitle(aiGameType);

      const response = await fetch('/api/admin/miniapps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: generatedTitle,
          prompt: trimmedPrompt,
          gradeLevel: aiGradeLevel,
          gameType: aiGameType,
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

      setAiPreview(payload.preview);
      setFeedback('小游戏已生成，可先预览，再直接添加到当前模块。');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '生成小游戏失败');
    } finally {
      setAiGenerating(false);
    }
  }

  async function createGeneratedMiniAppInCurrentModule() {
    if (!aiPreview) {
      setError('请先生成小游戏预览');
      return;
    }

    setAiSaving(true);
    setError(null);
    setFeedback(null);

    let savedMiniApp = aiPreview.savedMiniApp || null;
    let savedVersion = aiPreview.savedVersion || null;

    try {
      if (!savedMiniApp?.id) {
        const saveResponse = await fetch('/api/admin/miniapps/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: aiPreview.title,
            prompt: aiPreview.prompt,
            gradeLevel: aiPreview.gradeLevel,
            gameType: aiPreview.gameType,
            html: aiPreview.html,
            generationSource: aiPreview.generationSource,
            openMaicError: aiPreview.openMaicError,
          }),
        });

        const savePayload = (await saveResponse.json().catch(() => ({}))) as {
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

        if (!saveResponse.ok || !savePayload.success || !savePayload.miniApp) {
          throw new Error(savePayload.error || '保存小游戏失败');
        }

        savedMiniApp = savePayload.miniApp;
        savedVersion = savePayload.version || null;
        setAiPreview((current) =>
          current
            ? {
                ...current,
                savedMiniApp: savePayload.miniApp || null,
                savedVersion: savePayload.version || null,
              }
            : current
        );
      }

      const formData = new FormData();
      formData.append('title', aiPreview.title);
      formData.append('item_type', 'miniapp');
      formData.append('miniAppId', String(savedMiniApp.id));
      if (savedVersion?.id) {
        formData.append('miniAppVersionId', String(savedVersion.id));
      }
      formData.append('aspectRatio', '16:9');
      formData.append('titleOverride', '');
      formData.append('miniAppParams', '{}');

      const attachResponse = await fetch(`/api/content/modules/${moduleId}/items`, {
        method: 'POST',
        body: formData,
      });

      const attachPayload = (await attachResponse.json().catch(() => ({}))) as {
        item?: AdminModuleItem;
        error?: string;
      };

      if (!attachResponse.ok || !attachPayload.item) {
        setFeedback(`小游戏「${savedMiniApp.name}」已上传到小游戏库，但挂载到当前模块失败。`);
        throw new Error(attachPayload.error || '添加游戏到当前模块失败');
      }

      const createdItem = attachPayload.item;
      setItems((current) =>
        [...current, createdItem].sort((a, b) => a.sort_order - b.sort_order)
      );
      resetAiComposer();
      setFeedback(`已生成并添加游戏「${savedMiniApp.name}」到当前模块。`);
      refreshPage();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '添加游戏到当前模块失败');
    } finally {
      setAiSaving(false);
    }
  }

  async function saveItem(item: AdminModuleItem) {
    setError(null);
    setFeedback(null);
    const mountDraft = mountDrafts[item.id] || {
      miniAppId: '',
      miniAppVersionId: '',
      aspectRatio: '16:9',
      titleOverride: '',
      paramsJson: '{}',
    };

    if (item.item_type === 'miniapp' && !mountDraft.miniAppId) {
      setError('请选择要挂载的小游戏');
      return;
    }

    let parsedMiniAppParams: Record<string, unknown> | undefined;
    if (item.item_type === 'miniapp') {
      try {
        const parsed = JSON.parse(mountDraft.paramsJson || '{}') as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('invalid');
        }
        parsedMiniAppParams = parsed as Record<string, unknown>;
      } catch {
        setError('小游戏参数必须是合法 JSON 对象');
        return;
      }
    }

    const response = await fetch(`/api/content/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        item_type: item.item_type,
        miniAppId: item.item_type === 'miniapp' ? Number(mountDraft.miniAppId) : undefined,
        miniAppVersionId:
          item.item_type === 'miniapp' && mountDraft.miniAppVersionId
            ? Number(mountDraft.miniAppVersionId)
            : null,
        aspectRatio: item.item_type === 'miniapp' ? mountDraft.aspectRatio : undefined,
        titleOverride: item.item_type === 'miniapp' ? mountDraft.titleOverride : undefined,
        miniAppParams: item.item_type === 'miniapp' ? parsedMiniAppParams : undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '保存课件失败' }));
      setError(data.error || '保存课件失败');
      return;
    }

    refreshPage();
  }

  async function deleteItem(item: AdminModuleItem) {
    setError(null);
    setFeedback(null);

    if (!window.confirm(`确认删除课件“${item.title}”吗？`)) {
      return;
    }

    const response = await fetch(`/api/content/items/${item.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '删除课件失败' }));
      setError(data.error || '删除课件失败');
      return;
    }

    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    refreshPage();
  }

  function getVersions(miniAppId: string) {
    const app = miniApps.find((entry) => String(entry.id) === miniAppId);
    return app?.versions || [];
  }

  async function moveItem(index: number, direction: -1 | 1) {
    setError(null);
    setFeedback(null);

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, moved);
    setItems(
      nextItems.map((item, orderIndex) => ({
        ...item,
        sort_order: orderIndex + 1,
      }))
    );

    const response = await fetch(`/api/content/modules/${moduleId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemIds: nextItems.map((item) => item.id),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '排序失败' }));
      setError(data.error || '排序失败');
      setItems(
        [...initialItems]
          .filter((item) => ITEM_TYPES.includes(item.item_type))
          .sort((a, b) => a.sort_order - b.sort_order)
      );
      return;
    }

    refreshPage();
  }

  return (
    <div className="mt-5 space-y-4">
      {error ? (
        <div className="rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}
      {feedback ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-dashed border-[#d9c29b]/70 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.9))] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-[0.14em] text-[#8f2017]">
          <Plus className="h-4 w-4" />
          添加内容
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {ITEM_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setNewType(type);
                if (type === 'video') {
                  setNewMiniAppMode('existing');
                  setAiPreview(null);
                } else {
                  setNewFile(null);
                }
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                newType === type
                  ? 'bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1]'
                  : 'border border-[#d9c29b]/55 bg-white/88 text-stone-700'
              }`}
            >
              {getItemTypeLabel(type)}
            </button>
          ))}
        </div>
        {newType === 'video' ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="视频标题"
              className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
            />
            <input
              type="file"
              accept="video/*"
              onChange={(event) => setNewFile(event.target.files?.[0] || null)}
              className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 file:mr-3 file:rounded-full file:border-0 file:bg-[linear-gradient(180deg,#b83226,#7f1712)] file:px-3 file:py-2 file:text-[#f8ead1]"
            />
            <button
              type="button"
              onClick={createItem}
              disabled={isPending}
              className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)] disabled:opacity-50"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  提交中
                </span>
              ) : (
                '添加视频'
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setNewMiniAppMode('existing')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  newMiniAppMode === 'existing'
                    ? 'bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1]'
                    : 'border border-[#d9c29b]/55 bg-white/88 text-stone-700'
                }`}
              >
                选择已有游戏
              </button>
              <button
                type="button"
                onClick={() => setNewMiniAppMode('ai')}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  newMiniAppMode === 'ai'
                    ? 'bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1]'
                    : 'border border-[#d9c29b]/55 bg-white/88 text-stone-700'
                }`}
              >
                <WandSparkles className="h-4 w-4" />
                AI 生成游戏
              </button>
            </div>

            {newMiniAppMode === 'existing' ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="游戏标题"
                  className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
                <select
                  value={newMiniAppId}
                  onChange={(event) => {
                    setNewMiniAppId(event.target.value);
                    setNewMiniAppVersionId('');
                  }}
                  className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                >
                  <option value="">选择游戏</option>
                  {miniApps.map((miniApp) => (
                    <option key={miniApp.id} value={miniApp.id}>
                      {miniApp.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newMiniAppVersionId}
                  onChange={(event) => setNewMiniAppVersionId(event.target.value)}
                  className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                >
                  <option value="">使用已发布版本</option>
                  {getVersions(newMiniAppId).map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.version}
                      {version.isPublished ? '（已发布）' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={createItem}
                  disabled={isPending}
                  className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)] disabled:opacity-50"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      提交中
                    </span>
                  ) : (
                    '添加游戏'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4 rounded-[22px] border border-[#d9c29b]/45 bg-white/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#8f2017]">
                  <WandSparkles className="h-4 w-4" />
                  在当前模块内 AI 生成游戏
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_12rem_12rem]">
                  <input
                    value={aiTitle}
                    onChange={(event) => setAiTitle(event.target.value)}
                    placeholder="游戏标题"
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/92 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                  <input
                    value={aiGradeLevel}
                    onChange={(event) => setAiGradeLevel(event.target.value)}
                    placeholder="适用学段"
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/92 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                  <select
                    value={aiGameType}
                    onChange={(event) => setAiGameType(event.target.value as GameType)}
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/92 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  >
                    <option value="quiz">问答闯关</option>
                    <option value="matching">配对游戏</option>
                    <option value="sequence">排序挑战</option>
                  </select>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row">
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    rows={3}
                    placeholder="填写小游戏生成要求，例如知识点、玩法、题目方向。"
                    className="min-h-24 flex-1 rounded-2xl border border-[#d9c29b]/55 bg-white/92 px-3 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                  <button
                    type="button"
                    onClick={() => void generateAiMiniAppPreview()}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-semibold text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)] disabled:opacity-60 lg:w-36"
                  >
                    {aiGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <WandSparkles className="h-4 w-4" />
                    )}
                    {aiGenerating ? '生成中' : 'AI 生成'}
                  </button>
                </div>

                {aiPreview ? (
                  <div className="rounded-[22px] border border-[#d9c29b]/45 bg-white/85 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="font-semibold text-stone-900">{aiPreview.title}</div>
                        {aiPreview.savedMiniApp ? (
                          <div className="mt-1 text-xs text-stone-500">
                            已上传小游戏库：{aiPreview.savedMiniApp.name}
                            {aiPreview.savedVersion?.entryUrl
                              ? ` · 入口：${aiPreview.savedVersion.entryUrl}`
                              : ''}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-4 py-2 text-xs font-semibold text-stone-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          预览
                        </button>
                        <button
                          type="button"
                          onClick={() => void createGeneratedMiniAppInCurrentModule()}
                          disabled={aiSaving}
                          className="inline-flex items-center gap-2 rounded-full border border-[#8f2017]/25 bg-white px-4 py-2 text-xs font-semibold text-[#8f2017] disabled:opacity-60"
                        >
                          {aiSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          生成并添加到当前模块
                        </button>
                        <button
                          type="button"
                          onClick={resetAiComposer}
                          disabled={aiSaving}
                          className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          清空
                        </button>
                      </div>
                    </div>

                    <iframe
                      src={previewUrl}
                      title={aiPreview.title}
                      className="mt-4 h-[420px] w-full rounded-2xl border border-[#d9c29b]/45 bg-white"
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-[24px] border border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.92),rgba(247,238,224,0.82))] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d9c29b]/35 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-3 py-1 text-xs tracking-[0.12em] text-[#8f2017]">
                    {getItemTypeLabel(item.item_type)}
                  </span>
                  <span className="text-xs tracking-[0.12em] text-stone-400">顺序 {item.sort_order}</span>
                </div>
                <div className="text-xs tracking-[0.12em] text-stone-400">内容 {index + 1}</div>
              </div>

              <div className="mt-4 grid gap-3">
                <input
                  value={item.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setItems((current) =>
                      current.map((currentItem) =>
                        currentItem.id === item.id ? { ...currentItem, title } : currentItem
                      )
                    );
                  }}
                  className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              {item.item_type === 'video' && item.file_url ? (
                <div className="mt-4">
                  <a
                    href={getResolvedUrl(item.file_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-[#d9c29b]/55 bg-white/90 px-3 py-2 text-sm text-stone-700 transition-colors hover:border-[#c58d3e]"
                  >
                    打开视频
                  </a>
                </div>
              ) : null}

              {item.item_type === 'miniapp' ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <select
                    value={mountDrafts[item.id]?.miniAppId || ''}
                    onChange={(event) =>
                      setMountDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          ...(current[item.id] || {
                            miniAppId: '',
                            miniAppVersionId: '',
                            aspectRatio: '16:9',
                            titleOverride: '',
                            paramsJson: '{}',
                          }),
                          miniAppId: event.target.value,
                          miniAppVersionId: '',
                        },
                      }))
                    }
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  >
                    <option value="">选择游戏</option>
                    {miniApps.map((miniApp) => (
                      <option key={miniApp.id} value={miniApp.id}>
                        {miniApp.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mountDrafts[item.id]?.miniAppVersionId || ''}
                    onChange={(event) =>
                      setMountDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          ...(current[item.id] || {
                            miniAppId: '',
                            miniAppVersionId: '',
                            aspectRatio: '16:9',
                            titleOverride: '',
                            paramsJson: '{}',
                          }),
                          miniAppVersionId: event.target.value,
                        },
                      }))
                    }
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  >
                    <option value="">使用已发布版本</option>
                    {getVersions(mountDrafts[item.id]?.miniAppId || '').map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.version}
                        {version.isPublished ? '（已发布）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => moveItem(index, -1)}
                  disabled={isPending || index === 0}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/88 p-2 text-stone-700 transition-colors hover:border-[#c58d3e] disabled:opacity-40"
                  aria-label="上移"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, 1)}
                  disabled={isPending || index === items.length - 1}
                  className="rounded-full border border-[#d9c29b]/55 bg-white/88 p-2 text-stone-700 transition-colors hover:border-[#c58d3e] disabled:opacity-40"
                  aria-label="下移"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => saveItem(item)}
                  disabled={isPending}
                  className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)] disabled:opacity-40"
                >
                  <span className="flex items-center gap-1">
                    <Save className="h-4 w-4" />
                    保存
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(item)}
                  disabled={isPending}
                  className="rounded-full border border-rose-200 bg-white/90 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40"
                >
                  <span className="flex items-center gap-1">
                    <Trash2 className="h-4 w-4" />
                    删除
                  </span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-[#d9c29b]/70 bg-[rgba(255,250,241,0.7)] px-4 py-6 text-sm text-stone-500">
            该模块还没有内容，先添加一个视频或游戏。
          </div>
        )}
      </div>
    </div>
  );
}
