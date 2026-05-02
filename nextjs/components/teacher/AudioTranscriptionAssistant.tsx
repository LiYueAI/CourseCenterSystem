'use client';

import { useRef, useState } from 'react';
import { Clipboard, Loader2, Mic2, Upload } from 'lucide-react';

interface AudioTranscriptionAssistantProps {
  embedded?: boolean;
  title?: string;
}

export default function AudioTranscriptionAssistant({
  embedded = false,
  title = '语音转写',
}: AudioTranscriptionAssistantProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function transcribeAudio() {
    if (!audioFile) {
      setError('请先上传音频文件');
      return;
    }

    setLoading(true);
    setTranscript('');
    setError(null);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.set('audio', audioFile, audioFile.name);
      formData.set('language', 'zh');

      const response = await fetch('/api/openmaic/transcription', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        text?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '语音转写失败');
      }

      setTranscript(payload.text || '');
    } catch (transcribeError) {
      setError(
        transcribeError instanceof Error
          ? transcribeError.message
          : '语音转写失败',
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyTranscript() {
    if (!transcript.trim()) return;

    try {
      await navigator.clipboard.writeText(transcript);
      setFeedback('转写结果已复制');
    } catch {
      setFeedback('当前浏览器不支持自动复制，请手动复制');
    }
  }

  return (
    <section
      className={
        embedded
          ? 'rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4'
          : 'portal-panel p-5 md:p-6'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-stone-900">{title}</div>
          <p className="mt-1 text-sm text-stone-500">
            上传课堂录音或口述内容，快速转成可编辑文本。
          </p>
        </div>
        {transcript ? (
          <button
            type="button"
            onClick={() => void copyTranscript()}
            className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white/82 px-4 py-2 text-sm text-stone-600"
          >
            <Clipboard className="h-4 w-4" />
            复制文本
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          setAudioFile(event.target.files?.[0] || null);
          setTranscript('');
          setError(null);
          setFeedback(null);
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
        >
          <Upload className="h-4 w-4" />
          选择音频
        </button>
        <button
          type="button"
          onClick={() => void transcribeAudio()}
          disabled={loading || !audioFile}
          className="inline-flex items-center gap-2 rounded-full bg-[#8f2017] px-4 py-2 text-sm font-semibold text-[#f8ead1] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic2 className="h-4 w-4" />
          )}
          {loading ? '转写中...' : '开始转写'}
        </button>
        <div className="text-xs text-stone-500">
          {audioFile ? `已选择：${audioFile.name}` : '支持常见音频格式'}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {feedback ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}

      <div className="mt-4 rounded-[24px] border border-[#d9c29b]/45 bg-[#fff8eb]/70 p-4">
        <div className="mb-3 text-sm font-semibold text-stone-900">
          转写结果
        </div>
        <textarea
          rows={10}
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="转写结果会显示在这里。"
          className="w-full rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 text-sm leading-7 text-stone-700 outline-none focus:border-[#8f2017]"
        />
      </div>
    </section>
  );
}
