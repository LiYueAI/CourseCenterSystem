'use client';

import { ExternalLink, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { resolveAssetUrl } from '@/lib/media-url';
import ManageResourceStatusButtons from './ManageResourceStatusButtons';

type ResourceRow = {
  id: number;
  title: string;
  type: string;
  file_url: string;
  status: string;
  publish_count: number;
};

type ModuleOption = {
  moduleId: number;
  label: string;
};

export default function AdminResourceLibraryPanel({
  resources,
  moduleOptions,
}: {
  resources: ResourceRow[];
  moduleOptions: ModuleOption[];
}) {
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingResourceId, setPendingResourceId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveTitle(resourceId: number) {
    const title = editingTitle.trim();
    if (!title) {
      setError('资源标题不能为空');
      return;
    }

    setPendingResourceId(resourceId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/resources/${resourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '修改资源失败');
      }
      window.location.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '修改资源失败');
    } finally {
      setPendingResourceId(null);
    }
  }

  async function deleteResource(resourceId: number) {
    setPendingResourceId(resourceId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/resources/${resourceId}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '删除资源失败');
      }
      window.location.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '删除资源失败');
    } finally {
      setPendingResourceId(null);
    }
  }

  return (
    <section className="portal-panel overflow-hidden">
      <div className="border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] px-6 py-5">
        <div className="text-sm tracking-[0.22em] text-stone-600">资源列表</div>
      </div>

      <div className="divide-y divide-[#eadfce]">
        {resources.length > 0 ? (
          resources.map((resource) => {
            const isEditing = editingResourceId === resource.id;
            const isPending = pendingResourceId === resource.id;

            return (
              <div key={resource.id} className="px-6 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      {isEditing ? (
                        <input
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          className="min-w-[16rem] rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-2 outline-none focus:border-[#8f2017]"
                        />
                      ) : (
                        <div className="text-lg font-semibold text-stone-900">{resource.title}</div>
                      )}
                      <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                        {resource.type}
                      </div>
                      <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                        {resource.status}
                      </div>
                      <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-3 py-1 text-xs tracking-[0.14em] text-stone-500">
                        已发布 {resource.publish_count} 次
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-stone-600">
                      <a
                        href={resolveAssetUrl(resource.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-2 transition-colors hover:border-[#b83226]/30"
                      >
                        查看文件
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setEditingResourceId(resource.id);
                          setEditingTitle(resource.title);
                          setError(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-2 text-stone-700"
                      >
                        <Pencil className="h-4 w-4" />
                        修改标题
                      </button>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => void saveTitle(resource.id)}
                            className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1] disabled:opacity-60"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setEditingResourceId(null);
                              setEditingTitle('');
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
                        onClick={() => void deleteResource(resource.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-4 py-2 text-red-600 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除资源
                      </button>
                      <span className="truncate text-xs tracking-[0.12em] text-stone-400">
                        {resolveAssetUrl(resource.file_url)}
                      </span>
                    </div>
                  </div>

                  <ManageResourceStatusButtons
                    resourceId={resource.id}
                    status={resource.status}
                    publishCount={resource.publish_count}
                    moduleOptions={moduleOptions}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-6 py-12 text-center text-stone-500">当前还没有资源记录。</div>
        )}
      </div>

      {error ? (
        <div className="border-t border-[#eadfce] px-6 py-4 text-sm text-rose-600">{error}</div>
      ) : null}
    </section>
  );
}
