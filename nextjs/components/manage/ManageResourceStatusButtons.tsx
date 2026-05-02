'use client';

import { useState } from 'react';

type ModuleOption = {
  moduleId: number;
  label: string;
};

export default function ManageResourceStatusButtons({
  resourceId,
  status,
  publishCount,
  moduleOptions,
}: {
  resourceId: number;
  status: string;
  publishCount: number;
  moduleOptions: ModuleOption[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string>(
    moduleOptions[0] ? String(moduleOptions[0].moduleId) : ''
  );

  async function updateStatus(status: 'approved' | 'rejected' | 'pending') {
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/resources/${resourceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '更新资源状态失败');
      }

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新资源状态失败');
    } finally {
      setPending(false);
    }
  }

  async function publishResource() {
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/resources/${resourceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moduleId: Number(selectedModuleId) }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '发布资源失败');
      }

      setMessage('资源已发布到目标模块');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布资源失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-[320px] flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => updateStatus('approved')}
          className="rounded-full bg-[linear-gradient(180deg,#0f9f6e,#0d7c56)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          通过
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => updateStatus('rejected')}
          className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 disabled:opacity-60"
        >
          驳回
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => updateStatus('pending')}
          className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-60"
        >
          重置为待审核
        </button>
      </div>

      <div className="rounded-[20px] border border-[#d9c29b]/45 bg-[rgba(255,251,244,0.8)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs tracking-[0.16em] text-stone-500">发布到页面</div>
          <div className="text-xs tracking-[0.14em] text-stone-400">已发布 {publishCount} 次</div>
        </div>

        <div className="mt-3 grid gap-3">
          <select
            value={selectedModuleId}
            onChange={(event) => setSelectedModuleId(event.target.value)}
            disabled={pending || moduleOptions.length === 0}
            className="rounded-2xl border border-[#d9c29b]/55 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-60"
          >
            {moduleOptions.length > 0 ? (
              moduleOptions.map((option) => (
                <option key={option.moduleId} value={option.moduleId}>
                  {option.label}
                </option>
              ))
            ) : (
              <option value="">暂无可发布模块</option>
            )}
          </select>

          <button
            type="button"
            disabled={
              pending || status !== 'approved' || moduleOptions.length === 0 || !selectedModuleId
            }
            onClick={publishResource}
            className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] disabled:opacity-60"
          >
            发布到选中模块
          </button>
        </div>
      </div>

      {message ? <div className="w-full text-xs text-emerald-700">{message}</div> : null}
      {error ? <div className="w-full text-xs text-rose-600">{error}</div> : null}
    </div>
  );
}
