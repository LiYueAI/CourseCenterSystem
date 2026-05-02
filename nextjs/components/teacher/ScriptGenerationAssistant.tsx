'use client';

import { useState } from 'react';
import { Loader2, PenLine } from 'lucide-react';

interface ScriptGenerationAssistantProps {
  lessonId?: number | null;
  moduleId?: number | null;
  onResourceCreated?: (resource: { id: number; title: string; item_type: string }) => void;
}

export default function ScriptGenerationAssistant({
  lessonId,
  moduleId,
  onResourceCreated,
}: ScriptGenerationAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function generateScript() {
    if (!prompt.trim()) {
      setError('请填写讲稿生成要求');
      return;
    }

    setGenerating(true);
    setError(null);
    setMessage(null);
    setResult('');

    try {
      const response = await fetch('/api/openmaic/generate/scene-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '教师讲稿', description: prompt }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        actions?: Array<Record<string, unknown>>;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '讲稿生成失败');
      }

      const speeches = (payload.actions || [])
        .filter((action) => action.type === 'speech' && typeof action.text === 'string')
        .map((action) => String(action.text).trim())
        .filter(Boolean);
      setResult(speeches.join('\n\n') || JSON.stringify(payload.actions || [], null, 2));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '讲稿生成失败');
    } finally {
      setGenerating(false);
    }
  }

  async function saveScript() {
    if (!lessonId || !moduleId) {
      setError('请先选择课时和流程');
      return;
    }
    if (!result.trim()) {
      setError('请先生成讲稿');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/teacher/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          module_id: moduleId,
          title: '教师讲稿',
          item_type: 'doc',
          file_url: `data:text/html;charset=utf-8,${encodeURIComponent(`<article>${result.replace(/\n/g, '<br/>')}</article>`)}`,
          duration: 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        teacherResource?: { id: number; title: string; item_type: string };
        error?: string;
      };

      if (!response.ok || !payload.teacherResource) {
        throw new Error(payload.error || '保存讲稿失败');
      }

      setMessage('已保存');
      onResourceCreated?.(payload.teacherResource);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存讲稿失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="portal-panel p-5 md:p-6">
      <div className="mb-4 text-base font-semibold text-stone-900">讲稿生成助手</div>
      <div className="flex flex-col gap-3 md:flex-row">
        <textarea
          rows={2}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-16 flex-1 rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#8f2017]"
          placeholder="讲稿生成要求"
        />
        <button
          type="button"
          onClick={generateScript}
          disabled={generating || !prompt.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] disabled:opacity-60 md:w-36"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          {generating ? '生成中' : '生成讲稿'}
        </button>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
      {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      {result ? (
        <div className="mt-4">
          <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#d9c29b]/40 bg-[#fff8eb] p-4 text-sm leading-7 text-stone-700">{result}</div>
          <button
            type="button"
            onClick={saveScript}
            disabled={saving}
            className="mt-3 rounded-full border border-[#8f2017]/25 px-4 py-2 text-xs font-semibold text-[#8f2017] disabled:opacity-60"
          >
            {saving ? '保存中...' : '保存为资源'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
