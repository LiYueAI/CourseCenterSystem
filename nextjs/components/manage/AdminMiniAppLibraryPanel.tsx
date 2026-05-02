'use client';

import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { MiniAppSummary } from '@/lib/miniapps.types';

export default function AdminMiniAppLibraryPanel({
  miniApps,
}: {
  miniApps: MiniAppSummary[];
}) {
  const [editingMiniAppId, setEditingMiniAppId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [pendingMiniAppId, setPendingMiniAppId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveMiniApp(miniAppId: number) {
    const name = editingName.trim();
    if (!name) {
      setError('小游戏名称不能为空');
      return;
    }

    setPendingMiniAppId(miniAppId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/miniapps/${miniAppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: editingDescription.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '修改小游戏失败');
      }
      window.location.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '修改小游戏失败');
    } finally {
      setPendingMiniAppId(null);
    }
  }

  async function deleteMiniApp(miniAppId: number) {
    setPendingMiniAppId(miniAppId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/miniapps/${miniAppId}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '删除小游戏失败');
      }
      window.location.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '删除小游戏失败');
    } finally {
      setPendingMiniAppId(null);
    }
  }

  return (
    <section className="portal-panel overflow-hidden">
      <div className="border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] px-6 py-5">
        <div className="text-sm tracking-[0.22em] text-stone-600">小游戏列表</div>
      </div>

      <div className="divide-y divide-[#eadfce]">
        {miniApps.length > 0 ? (
          miniApps.map((miniApp) => {
            const publishedVersion = miniApp.versions.find(
              (version) => version.id === miniApp.publishedVersionId,
            );
            const isEditing = editingMiniAppId === miniApp.id;
            const isPending = pendingMiniAppId === miniApp.id;

            return (
              <div key={miniApp.id} className="px-6 py-5">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="min-w-[16rem] rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-2 outline-none focus:border-[#8f2017]"
                      />
                    ) : (
                      <div className="text-lg font-semibold text-stone-900">{miniApp.name}</div>
                    )}
                    <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                      {miniApp.status}
                    </div>
                    <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                      {miniApp.appKey}
                    </div>
                  </div>

                  {isEditing ? (
                    <textarea
                      value={editingDescription}
                      onChange={(event) => setEditingDescription(event.target.value)}
                      rows={3}
                      className="w-full rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                    />
                  ) : (
                    <div className="text-sm text-stone-600">
                      {miniApp.description || '暂无描述'}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
                    {publishedVersion?.entryUrl ? (
                      <a
                        href={publishedVersion.entryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-2"
                      >
                        打开入口
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setEditingMiniAppId(miniApp.id);
                        setEditingName(miniApp.name);
                        setEditingDescription(miniApp.description || '');
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-2 text-stone-700"
                    >
                      <Pencil className="h-4 w-4" />
                      修改
                    </button>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => void saveMiniApp(miniApp.id)}
                          className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1] disabled:opacity-60"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            setEditingMiniAppId(null);
                            setEditingName('');
                            setEditingDescription('');
                          }}
                          className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700"
                        >
                          取消
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void deleteMiniApp(miniApp.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-4 py-2 text-red-600 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除小游戏
                    </button>
                    <span className="text-xs tracking-[0.12em] text-stone-400">
                      版本数：{miniApp.versions.length}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-6 py-12 text-center text-stone-500">当前还没有小游戏记录。</div>
        )}
      </div>

      {error ? (
        <div className="border-t border-[#eadfce] px-6 py-4 text-sm text-rose-600">{error}</div>
      ) : null}
    </section>
  );
}
