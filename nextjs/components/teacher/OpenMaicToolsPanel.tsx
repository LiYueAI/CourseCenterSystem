'use client';

import { useState } from 'react';
import { ImageIcon, Loader2, Sparkles, Video } from 'lucide-react';

interface OpenMaicToolsPanelProps {
  lessonId?: number | null;
  moduleId?: number | null;
  lessonTitle?: string;
  moduleName?: string;
  onResourceCreated?: (resource: { id: number; title: string; item_type: string }) => void;
}

export default function OpenMaicToolsPanel({
  lessonId,
  moduleId,
  onResourceCreated,
}: OpenMaicToolsPanelProps = {}) {
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageRaw, setImageRaw] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoRaw, setVideoRaw] = useState('');
  const [saveLoadingKey, setSaveLoadingKey] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function htmlDataUrl(title: string, content: string): string {
    const safeTitle = title.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
    const safeContent = content.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;line-height:1.8;padding:32px;color:#292524;background:#fffaf2;white-space:pre-wrap}</style></head><body><h1>${safeTitle}</h1>${safeContent}</body></html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }

  async function saveTeacherResource(input: { key: string; title: string; itemType: string; fileUrl?: string; duration?: number }) {
    if (!lessonId || !moduleId) {
      setError('请先在备课页或 AI 工坊选择课时和流程，再保存为课堂资源。');
      return;
    }

    setSaveLoadingKey(input.key);
    setSaveFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/teacher/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          moduleId,
          title: input.title,
          itemType: input.itemType,
          fileUrl: input.fileUrl || null,
          duration: input.duration || 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; resource?: { id: number; title: string; item_type: string }; error?: string };
      if (!response.ok || !payload.success || !payload.resource) {
        throw new Error(payload.error || '保存教师资源失败');
      }
      setSaveFeedback(`已保存资源「${payload.resource.title}」。`);
      onResourceCreated?.(payload.resource);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存教师资源失败');
    } finally {
      setSaveLoadingKey(null);
    }
  }

  function pickVideoUrl(result: any): string {
    const candidates = [result?.url, result?.videoUrl, result?.video_url, result?.data?.url, result?.output?.url, result?.content?.video_url];
    return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || '';
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
    const base64 = result?.base64 || result?.imageBase64 || result?.data?.base64 || result?.images?.[0]?.base64;
    const url = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
    if (url) return url;
    if (typeof base64 === 'string' && base64.trim()) return `data:image/png;base64,${base64}`;
    return '';
  }

  async function generateImage() {
    if (!imagePrompt.trim()) {
      setError('请填写生图提示词');
      return;
    }

    setImageLoading(true);
    setError(null);
    setImageUrl('');
    setImageRaw('');

    try {
      const response = await fetch('/api/openmaic/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt, aspectRatio: '16:9' }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; result?: any; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '图片生成失败');
      }
      const url = pickImageUrl(payload.result);
      setImageUrl(url);
      if (!url) setImageRaw(JSON.stringify(payload.result, null, 2).slice(0, 4000));
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : '图片生成失败');
    } finally {
      setImageLoading(false);
    }
  }

  async function generateVideo() {
    if (!videoPrompt.trim()) {
      setError('请填写视频生成提示词');
      return;
    }

    setVideoLoading(true);
    setVideoUrl('');
    setVideoRaw('');
    setError(null);

    try {
      const response = await fetch('/api/openmaic/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: videoPrompt, duration: 4, aspectRatio: '16:9', resolution: '720p' }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; result?: any; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '视频生成失败');
      }
      const url = pickVideoUrl(payload.result);
      setVideoUrl(url);
      if (!url) setVideoRaw(JSON.stringify(payload.result, null, 2).slice(0, 4000));
    } catch (videoError) {
      setError(videoError instanceof Error ? videoError.message : '视频生成失败');
    } finally {
      setVideoLoading(false);
    }
  }

  return (
    <section className="portal-panel p-5 md:p-6">
      <div className="text-base font-semibold text-stone-900">AI工具助手</div>
      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
      {saveFeedback ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saveFeedback}</div> : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900"><ImageIcon className="h-4 w-4 text-[#8f2017]" /> AI 生图</div>
          <textarea rows={5} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} className="mt-4 w-full rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#8f2017]" />
          <button type="button" onClick={generateImage} disabled={imageLoading || !imagePrompt.trim()} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#8f2017] px-4 py-2 text-sm font-semibold text-[#f8ead1] disabled:opacity-60">
            {imageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}生成图片
          </button>
          {imageUrl ? <><img src={imageUrl} alt="AI 生成图片" className="mt-4 aspect-video w-full rounded-2xl object-cover" /><button type="button" onClick={() => void saveTeacherResource({ key: 'image', title: 'AI 生成课件图片', itemType: 'image', fileUrl: imageUrl })} disabled={saveLoadingKey === 'image'} className="mt-3 rounded-full border border-[#8f2017]/25 px-4 py-2 text-xs font-semibold text-[#8f2017] disabled:opacity-60">{saveLoadingKey === 'image' ? '保存中...' : '保存为图片资源'}</button></> : null}
          {imageRaw ? <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-900 p-4 text-xs leading-6 text-stone-100">{imageRaw}</pre> : null}
        </div>

        <div className="rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900"><Video className="h-4 w-4 text-[#8f2017]" /> AI 视频生成</div>
          <textarea rows={5} value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} className="mt-4 w-full rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#8f2017]" />
          <button type="button" onClick={generateVideo} disabled={videoLoading || !videoPrompt.trim()} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#8f2017] px-4 py-2 text-sm font-semibold text-[#f8ead1] disabled:opacity-60">
            {videoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}生成视频
          </button>
          {videoUrl ? <><video controls src={videoUrl} className="mt-4 aspect-video w-full rounded-2xl bg-black" /><button type="button" onClick={() => void saveTeacherResource({ key: 'video', title: 'AI 生成课件视频', itemType: 'video', fileUrl: videoUrl, duration: 4 })} disabled={saveLoadingKey === 'video'} className="mt-3 rounded-full border border-[#8f2017]/25 px-4 py-2 text-xs font-semibold text-[#8f2017] disabled:opacity-60">{saveLoadingKey === 'video' ? '保存中...' : '保存为视频资源'}</button></> : null}
          {videoRaw ? <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-900 p-4 text-xs leading-6 text-stone-100">{videoRaw}</pre> : null}
        </div>
      </div>
    </section>
  );
}
