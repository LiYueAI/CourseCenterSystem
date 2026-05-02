'use client';

import { useEffect, useState } from 'react';
import { Eye, Loader2, Presentation, RefreshCw, Save, Trash2 } from 'lucide-react';

export type ImportedOpenMaicResource = {
  id: number;
  lesson_id: number;
  module_id: number;
  title: string;
  item_type: string;
  file_url?: string | null;
  duration?: number | null;
  miniappMount?: unknown;
};

interface GenerateResponse {
  success?: boolean;
  jobId?: string;
  status?: string;
  step?: string;
  message?: string;
  pollIntervalMs?: number;
  error?: string;
}

interface JobResponse {
  success?: boolean;
  status?: string;
  step?: string;
  progress?: number;
  message?: string;
  done?: boolean;
  error?: string;
  result?: {
    id: string;
    url: string;
    scenesCount: number;
    stage?: { name?: string };
    scenes?: unknown[];
  };
  draft?: CourseDraft | null;
}

interface CourseDraft {
  id: number;
  jobId: string;
  title: string;
  status: string;
  scenesCount: number;
  sourceUrl: string | null;
  updatedAt?: string;
}

interface OpenMaicClassroomGeneratorProps {
  fixedLessonId?: number | null;
  fixedModuleId?: number | null;
  compact?: boolean;
  onImported?: (resources: ImportedOpenMaicResource[]) => void;
}

export default function OpenMaicClassroomGenerator({
  fixedLessonId,
  fixedModuleId,
  compact = false,
  onImported,
}: OpenMaicClassroomGeneratorProps) {
  const [requirement, setRequirement] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [drafts, setDrafts] = useState<CourseDraft[]>([]);
  const [importingDraftId, setImportingDraftId] = useState<number | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canImport = Boolean(fixedLessonId && fixedModuleId);

  async function loadDrafts() {
    try {
      const response = await fetch('/api/openmaic/course-drafts', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as { drafts?: CourseDraft[] };
      if (response.ok && Array.isArray(payload.drafts)) {
        setDrafts(payload.drafts);
      }
    } catch (loadError) {
      console.error('Failed to load OpenMAIC course drafts', loadError);
    }
  }

  useEffect(() => {
    void loadDrafts();
  }, []);

  async function startGeneration() {
    setGenerating(true);
    setError(null);
    setJob(null);
    setJobId(null);

    try {
      const response = await fetch('/api/openmaic/classroom/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement,
          enableImageGeneration: false,
          enableWebSearch: false,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as GenerateResponse;

      if (!response.ok || !payload.success || !payload.jobId) {
        throw new Error(payload.error || '启动 OpenMAIC 生成失败');
      }

      setJobId(payload.jobId);
      setJob({ status: payload.status, step: payload.step, message: payload.message });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '启动 OpenMAIC 生成失败');
    } finally {
      setGenerating(false);
    }
  }


  async function importDraft(draft: CourseDraft) {
    if (!fixedLessonId || !fixedModuleId) {
      setError('请先进入具体课时和流程后再导入 OpenMAIC 草稿');
      return;
    }

    setImportingDraftId(draft.id);
    setError(null);

    try {
      const response = await fetch(`/api/openmaic/course-drafts/${draft.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: fixedLessonId, moduleId: fixedModuleId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        resources?: ImportedOpenMaicResource[];
        error?: string;
      };

      if (!response.ok || !payload.success || !Array.isArray(payload.resources)) {
        throw new Error(payload.error || '导入 OpenMAIC 草稿失败');
      }

      onImported?.(payload.resources);
      await loadDrafts();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入 OpenMAIC 草稿失败');
    } finally {
      setImportingDraftId(null);
    }
  }

  async function deleteDraft(draft: CourseDraft) {
    setDeletingDraftId(draft.id);
    setError(null);

    try {
      const response = await fetch(`/api/openmaic/course-drafts/${draft.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '删除 OpenMAIC 草稿失败');
      }

      setDrafts((current) => current.filter((item) => item.id !== draft.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除 OpenMAIC 草稿失败');
    } finally {
      setDeletingDraftId(null);
    }
  }

  useEffect(() => {
    if (!jobId || job?.done) {
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(async () => {
      setPolling(true);
      try {
        const response = await fetch(`/api/openmaic/classroom/jobs/${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as JobResponse;
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || '读取生成进度失败');
        }
        if (!cancelled) {
          setJob(payload);
          if (payload.draft) {
            void loadDrafts();
          }
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : '读取生成进度失败');
        }
      } finally {
        if (!cancelled) {
          setPolling(false);
        }
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, job?.done]);

  return (
    <section className={compact ? 'rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4' : 'portal-panel p-5 md:p-6'}>
      <div className="mb-4 text-base font-semibold text-stone-900">PPT制作助手</div>
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-stone-700">
          生成要求
          <textarea
            rows={2}
            value={requirement}
            onChange={(event) => setRequirement(event.target.value)}
            className="min-h-16 rounded-[22px] border border-[#d9c29b]/70 bg-white/90 px-4 py-3 leading-7 outline-none focus:border-[#8f2017]"
          />
        </label>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={startGeneration}
            disabled={generating || !requirement.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] transition-colors hover:bg-[#741812] disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}
            {generating ? '正在启动...' : '生成课件'}
          </button>
        </div>
      </div>

      {jobId ? (
        <div className="mt-5 rounded-3xl border border-[#d9c29b]/55 bg-[#fff8eb]/70 p-4 text-sm text-stone-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-stone-900">任务 {jobId}</div>
              <div className="mt-1">状态：{job?.status || 'queued'} · 步骤：{job?.step || '-'}</div>
              <div className="mt-1">{job?.message || '等待 OpenMAIC 返回进度...'}</div>
            </div>
            {polling ? <RefreshCw className="h-4 w-4 animate-spin text-[#8f2017]" /> : null}
          </div>
          {typeof job?.progress === 'number' ? (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/90">
              <div className="h-full bg-[#8f2017]" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
            </div>
          ) : null}
          {job?.result ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              生成完成：{job.result.stage?.name || 'OpenMAIC 课件'}，共 {job.result.scenesCount} 个场景。
              {job.result.url ? (
                <a href={job.result.url} target="_blank" rel="noreferrer" className="ml-3 underline">
                  打开 OpenMAIC 结果
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

      {drafts.length > 0 ? (
        <div className="mt-6 rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-stone-900">我的 OpenMAIC 课件草稿</div>
              <p className="mt-1 text-xs text-stone-500">{canImport ? '可一键导入为当前流程的课件、讲稿、项目任务和互动游戏。' : '生成完成后会自动保存为草稿；进入具体备课流程后可一键导入。'}</p>
            </div>
            <button type="button" onClick={loadDrafts} className="rounded-full border border-[#d9c29b]/60 bg-white px-3 py-1.5 text-xs text-stone-600">
              刷新
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-2xl border border-[#d9c29b]/40 bg-[#fff8eb]/60 px-4 py-3 text-sm text-stone-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-stone-900">{draft.title}</div>
                  <div className="text-xs text-stone-500">{draft.scenesCount} 个场景 · {draft.status}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
                  <span>任务 {draft.jobId}</span>
                  {draft.sourceUrl ? (
                    <button
                      type="button"
                      onClick={() => window.open(draft.sourceUrl || '', '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-3 py-1 text-stone-700"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      预览
                    </button>
                  ) : null}
                  {canImport ? (
                    <button
                      type="button"
                      onClick={() => importDraft(draft)}
                      disabled={importingDraftId === draft.id || draft.status === 'imported'}
                      className="inline-flex items-center gap-2 rounded-full border border-[#8f2017]/25 bg-white px-3 py-1 text-[#8f2017] disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {draft.status === 'imported'
                        ? '已保存'
                        : importingDraftId === draft.id
                        ? '保存中...'
                        : '保存到本课程'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void deleteDraft(draft)}
                    disabled={deletingDraftId === draft.id}
                    className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-red-600 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingDraftId === draft.id ? '删除中...' : '删除'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
