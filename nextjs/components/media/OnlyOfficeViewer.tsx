'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Presentation } from 'lucide-react';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (placeholderId: string, config: Record<string, unknown>) => {
        destroyEditor?: () => void;
      };
    };
  }
}

interface OnlyOfficeViewerProps {
  src: string;
  title: string;
  type: 'ppt' | 'doc';
  immersive?: boolean;
}

const ONLYOFFICE_SCRIPT_PATH =
  `${process.env.NEXT_PUBLIC_ONLYOFFICE_PATH || '/onlyoffice'}/web-apps/apps/api/documents/api.js`;

let onlyOfficeScriptPromise: Promise<void> | null = null;

function loadOnlyOfficeScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('ONLYOFFICE requires a browser environment'));
  }

  if (window.DocsAPI?.DocEditor) {
    return Promise.resolve();
  }

  if (onlyOfficeScriptPromise) {
    return onlyOfficeScriptPromise;
  }

  onlyOfficeScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-onlyoffice-script="true"]`
    );

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load ONLYOFFICE script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = ONLYOFFICE_SCRIPT_PATH;
    script.async = true;
    script.dataset.onlyofficeScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ONLYOFFICE script'));
    document.head.appendChild(script);
  });

  return onlyOfficeScriptPromise;
}

export default function OnlyOfficeViewer({
  src,
  title,
  type,
  immersive = false,
}: OnlyOfficeViewerProps) {
  const rawId = useId();
  const placeholderId = useMemo(() => `onlyoffice-${rawId.replace(/[:]/g, '-')}`, [rawId]);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(8);
  const [loadingLabel, setLoadingLabel] = useState('正在准备文档预览...');
  const Icon = type === 'ppt' ? Presentation : FileText;

  useEffect(() => {
    let cancelled = false;
    let readyTimeout: ReturnType<typeof setTimeout> | null = null;

    async function bootstrap() {
      setLoading(true);
      setError(null);
      setLoadingProgress(8);
      setLoadingLabel('正在准备文档预览...');

      try {
        const configUrl = new URL('/api/onlyoffice/config', window.location.origin);
        configUrl.searchParams.set('src', src);
        configUrl.searchParams.set('title', title);
        configUrl.searchParams.set('type', type);

        setLoadingProgress(18);
        setLoadingLabel('正在加载文档引擎...');

        const configPromise = fetch(configUrl.toString(), {
          cache: 'no-store',
        });
        const scriptPromise = loadOnlyOfficeScript();

        const configResponse = await configPromise;
        setLoadingProgress(38);
        setLoadingLabel('正在获取文档配置...');

        await scriptPromise;
        setLoadingProgress(62);
        setLoadingLabel('正在启动文档预览...');

        if (!configResponse.ok) {
          throw new Error('ONLYOFFICE 配置加载失败');
        }

        const payload = (await configResponse.json()) as {
          config?: Record<string, unknown> & { events?: Record<string, unknown> };
        };
        if (!payload.config || !window.DocsAPI?.DocEditor) {
          throw new Error('ONLYOFFICE 初始化失败');
        }

        if (cancelled) {
          return;
        }

        const existingEvents = payload.config.events ?? {};
        const config = {
          ...payload.config,
          events: {
            ...existingEvents,
            onAppReady: (...args: unknown[]) => {
              if (!cancelled) {
                setLoadingProgress(82);
                setLoadingLabel('正在加载文档内容...');
              }

              const previousHandler = existingEvents.onAppReady;
              if (typeof previousHandler === 'function') {
                previousHandler(...args);
              }
            },
            onDocumentReady: (...args: unknown[]) => {
              if (cancelled) {
                return;
              }

              setLoadingProgress(100);
              setLoadingLabel('文档已就绪');
              readyTimeout = setTimeout(() => {
                if (!cancelled) {
                  setLoading(false);
                }
              }, 180);

              const previousHandler = existingEvents.onDocumentReady;
              if (typeof previousHandler === 'function') {
                previousHandler(...args);
              }
            },
            onError: (event: unknown) => {
              console.error('ONLYOFFICE runtime error', event);
              if (!cancelled) {
                setError('文档预览加载失败，请改用新窗口打开');
                setLoading(false);
              }

              const previousHandler = existingEvents.onError;
              if (typeof previousHandler === 'function') {
                previousHandler(event);
              }
            },
          },
        };

        editorRef.current?.destroyEditor?.();
        editorRef.current = new window.DocsAPI.DocEditor(placeholderId, config);
        setLoadingProgress(72);
        setLoadingLabel('正在连接文档服务...');
      } catch (bootstrapError) {
        console.error('ONLYOFFICE viewer failed', bootstrapError);
        if (!cancelled) {
          setError(
            bootstrapError instanceof Error
              ? bootstrapError.message
              : 'ONLYOFFICE 加载失败，请改用新窗口打开'
          );
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (readyTimeout) {
        window.clearTimeout(readyTimeout);
      }
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
    };
  }, [placeholderId, src, title, type]);

  return (
    <div
      className={`overflow-hidden rounded-xl ${
        immersive
          ? 'rounded-[28px] border border-[#d9c29b]/24 bg-white shadow-[0_24px_48px_rgba(0,0,0,0.2)]'
          : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-5 w-5 flex-shrink-0 text-amber-500" />
          <span className="truncate font-medium text-gray-900">{title}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-amber-400 hover:text-amber-600"
          >
            <ExternalLink className="h-4 w-4" />
            新窗口打开
          </a>
          <a
            href={src}
            download
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-amber-400 hover:text-amber-600"
          >
            <Download className="h-4 w-4" />
            下载
          </a>
        </div>
      </div>

      <div className="relative bg-gray-100" style={{ height: immersive ? '68vh' : '60vh' }}>
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
            <div className="w-full max-w-md rounded-2xl border border-[#ead9bd] bg-white/96 px-6 py-5 shadow-[0_18px_40px_rgba(125,87,37,0.12)]">
              <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-gray-900">{loadingLabel}</span>
                <span className="font-semibold tabular-nums text-amber-600">
                  {loadingProgress}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#f3eadb]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#d2a24c_0%,#f3c56b_45%,#c4842b_100%)] transition-all duration-500 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-gray-500">
                文档准备完成前将保持当前进度条，不显示 ONLYOFFICE 自带开场动画。
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
            <p className="mb-4 text-gray-600">{error}</p>
            <div className="flex gap-3">
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
              >
                <ExternalLink className="h-4 w-4" />
                新窗口打开
              </a>
              <a
                href={src}
                download
                className="flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300"
              >
                <Download className="h-4 w-4" />
                下载文件
              </a>
            </div>
          </div>
        ) : null}

        <div
          id={placeholderId}
          className={`h-full w-full transition-opacity duration-300 ${
            loading || error ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        />
      </div>
    </div>
  );
}
