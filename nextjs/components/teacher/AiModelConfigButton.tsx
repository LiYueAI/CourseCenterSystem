'use client';

import { useEffect, useState } from 'react';
import { Loader2, Settings2, X } from 'lucide-react';

interface SafeConfig {
  providerName: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
}

interface ConfigPayload {
  config: SafeConfig | null;
  fallback?: {
    providerName: string;
    baseUrl: string;
    model: string;
  };
}

export default function AiModelConfigButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [apiKeyPreview, setApiKeyPreview] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConfig() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/model-config', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as ConfigPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || '读取模型配置失败');
      }

      if (payload.config) {
        setProviderName(payload.config.providerName || '');
        setBaseUrl(payload.config.baseUrl || '');
        setModel(payload.config.model || '');
        setApiKeyPreview(payload.config.apiKeyPreview || '');
      } else {
        setProviderName('');
        setBaseUrl('');
        setModel('');
        setApiKeyPreview('');
      }
      setApiKey('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取模型配置失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadConfig();
    }
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/ai/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerName, baseUrl, apiKey, model }),
      });
      const payload = (await response.json().catch(() => ({}))) as ConfigPayload & { error?: string; success?: boolean };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '保存模型配置失败');
      }

      setMessage('模型配置已保存，后续 AI 生成会优先使用你的配置。');
      setApiKey('');
      if (payload.config) {
        setApiKeyPreview(payload.config.apiKeyPreview || '');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存模型配置失败');
    } finally {
      setSaving(false);
    }
  }


  async function handleTest() {
    setTesting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/openmaic/verify-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || '模型连接测试失败');
      }

      setMessage('模型连接测试成功。');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '模型连接测试失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d9c29b]/70 bg-white/82 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
      >
        <Settings2 className="h-4 w-4" />
        配置大模型
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(33,23,16,0.52)] px-4">
          <div className="portal-panel w-full max-w-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold tracking-[0.18em] text-[#8f2017]">OPENAI COMPATIBLE</div>
                <h3 className="mt-2 text-2xl font-semibold text-stone-950">配置大模型</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  可选配置个人 OpenAI 协议模型。留空时系统会自动使用平台全局默认 AI 配置。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[#d9c29b]/55 bg-white/80 p-2 text-stone-400 transition-colors hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在读取配置...
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm font-medium text-stone-700">
                  配置名称
                  <input
                    value={providerName}
                    onChange={(event) => setProviderName(event.target.value)}
                    className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                    placeholder="留空则使用全局默认配置"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-stone-700">
                  Base URL
                  <input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                    placeholder="留空则使用全局默认 Base URL"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-stone-700">
                  API Key
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    type="password"
                    className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                    placeholder={apiKeyPreview ? `已保存：${apiKeyPreview}，重新填写会覆盖` : 'sk-...'}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-stone-700">
                  模型名称
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="rounded-2xl border border-[#d9c29b]/70 bg-white/90 px-4 py-3 outline-none focus:border-[#8f2017]"
                    placeholder="留空则使用全局默认模型"
                  />
                </label>

                {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
                {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-[#d9c29b]/70 bg-white/82 px-5 py-3 text-sm font-medium text-stone-700"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing || !baseUrl.trim() || !apiKey.trim() || !model.trim()}
                    className="inline-flex items-center gap-2 rounded-full border border-[#8f2017]/25 bg-white px-5 py-3 text-sm font-semibold text-[#8f2017] disabled:opacity-60"
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {testing ? '测试中...' : '测试连接'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-full bg-[#8f2017] px-5 py-3 text-sm font-semibold text-[#f8ead1] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
