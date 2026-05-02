'use client';

import { useState } from 'react';
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface OpenMaicChatAssistantProps {
  context?: string;
  stageName?: string;
  title?: string;
  embedded?: boolean;
}

export default function OpenMaicChatAssistant({
  context,
  stageName = '教师 AI 创作工坊',
  title = '课程创作助手',
  embedded = false,
}: OpenMaicChatAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(nextInput?: string) {
    const content = (nextInput ?? input).trim();
    if (!content) {
      setError('请先输入对话内容');
      return;
    }

    const nextMessages = [...messages, { role: 'user' as const, content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/openmaic/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.filter((message) => message.content.trim()),
          context,
          stageName,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (response.status === 401) {
        throw new Error(payload.error || '登录已过期，请刷新页面后重新登录。');
      }
      if (response.status === 403) {
        throw new Error(payload.error || '当前账号无权使用课程创作助手。');
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `课程创作助手暂时无法回复（HTTP ${response.status}）`);
      }
      setMessages((current) => [...current, { role: 'assistant', content: payload.message || '' }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '课程创作助手暂时无法回复');
    } finally {
      setSending(false);
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
          {context ? (
            <p className="mt-1 text-sm text-stone-500">
              会自动结合当前课时和流程上下文回答。
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white/82 px-4 py-2 text-sm text-stone-600"
        >
          <Trash2 className="h-4 w-4" />清空对话
        </button>
      </div>


      <div className="mt-4 rounded-[24px] border border-[#d9c29b]/45 bg-white/75 p-4">
        <div className="max-h-[32rem] space-y-3 overflow-auto pr-1">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-[#8f2017] text-[#fff8eb]' : 'border border-[#d9c29b]/45 bg-[#fff8eb] text-stone-700'}`}>
                {message.role === 'assistant' ? <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#8f2017]"><MessageCircle className="h-3.5 w-3.5" />{title}</div> : null}
                {message.content}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-3xl border border-[#d9c29b]/45 bg-[#fff8eb] px-4 py-3 text-sm text-stone-600">
                <Loader2 className="h-4 w-4 animate-spin" />正在思考...
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void sendMessage();
              }
            }}
            className="min-h-24 flex-1 rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#8f2017]"
            placeholder="输入对话内容"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] disabled:opacity-60 md:w-32"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            发送
          </button>
        </div>
      </div>
    </section>
  );
}
