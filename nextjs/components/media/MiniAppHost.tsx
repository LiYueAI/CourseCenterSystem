'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Rocket } from 'lucide-react';
import type { ClassroomItem } from '@/components/classroom/ClassroomExperience';
import {
  getModuleItemMiniAppMount,
  normalizeModuleItemMiniAppMount,
  type MiniAppMountOwnerKind,
  type ModuleItem,
  type ModuleItemMiniAppMount,
} from '@/lib/directus';

interface MiniAppHostProps {
  item: ModuleItem | ClassroomItem;
  lessonId: number;
  immersive?: boolean;
  autoLaunch?: boolean;
  onComplete?: () => void;
}

interface LaunchResponse {
  mount?: ModuleItemMiniAppMount | null;
  launchUrl?: string;
  launch_url?: string;
  entryUrl?: string;
  entry_url?: string;
  expiresAt?: string;
  expires_at?: string;
}

function normalizeAspectRatio(rawValue?: string | null): string {
  if (!rawValue?.trim()) {
    return '16 / 9';
  }

  return rawValue.trim().replace(/\s*[:/]\s*/g, ' / ');
}

function deriveOwnerKind(item: ModuleItem | ClassroomItem): MiniAppMountOwnerKind {
  if ('teacherResourceId' in item && item.teacherResourceId) {
    return 'teacher_resource';
  }

  return 'standard_module_item';
}

function deriveOwnerId(item: ModuleItem | ClassroomItem): number {
  if ('teacherResourceId' in item && item.teacherResourceId) {
    return item.teacherResourceId;
  }

  if ('sourceItemId' in item && item.sourceItemId) {
    return item.sourceItemId;
  }

  return item.id;
}

function getRuntimeOwner(item: ModuleItem | ClassroomItem): {
  ownerKind: MiniAppMountOwnerKind;
  ownerId: number;
} | null {
  const ownerId = deriveOwnerId(item);
  if (!ownerId) {
    return null;
  }

  return {
    ownerKind: deriveOwnerKind(item),
    ownerId,
  };
}

export default function MiniAppHost({
  item,
  lessonId,
  immersive = false,
  autoLaunch = false,
  onComplete,
}: MiniAppHostProps) {
  const miniAppMount = getModuleItemMiniAppMount(item);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [runtimeMount, setRuntimeMount] = useState<ModuleItemMiniAppMount | null>(miniAppMount);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchUrl, setLaunchUrl] = useState('');
  const [launchError, setLaunchError] = useState<string | null>(null);

  useEffect(() => {
    setRuntimeMount(miniAppMount);
    setIsLaunching(false);
    setLaunchUrl('');
    setLaunchError(null);
  }, [item.id, item.file_url, miniAppMount?.id]);

  const entryUrl =
    runtimeMount?.version?.entryUrl ||
    runtimeMount?.version?.entry_url ||
    item.file_url ||
    '';
  const mountStatus =
    runtimeMount?.mountStatus || runtimeMount?.mount_status || (runtimeMount ? 'active' : null);
  const launchMode = runtimeMount?.launchMode || runtimeMount?.launch_mode || 'iframe';
  const title =
    runtimeMount?.titleOverride ||
    runtimeMount?.title_override ||
    runtimeMount?.miniApp?.name ||
    runtimeMount?.mini_app?.name ||
    item.title;
  const description =
    runtimeMount?.miniApp?.description || runtimeMount?.mini_app?.description || null;
  const appKey =
    runtimeMount?.miniApp?.appKey ||
    runtimeMount?.miniApp?.app_key ||
    runtimeMount?.mini_app?.appKey ||
    runtimeMount?.mini_app?.app_key;
  const vendorName =
    runtimeMount?.miniApp?.vendorName ||
    runtimeMount?.miniApp?.vendor_name ||
    runtimeMount?.mini_app?.vendorName ||
    runtimeMount?.mini_app?.vendor_name ||
    null;
  const aspectRatio = normalizeAspectRatio(
    runtimeMount?.aspectRatio || runtimeMount?.aspect_ratio
  );
  const iframeUrl = launchUrl;
  const runtimeOwner = getRuntimeOwner(item);
  const frameClassName = immersive
    ? 'group relative h-full w-full overflow-hidden rounded-[30px] border border-[#eed8ad] bg-[linear-gradient(180deg,#fffdf7_0%,#f8fbff_58%,#f6fbf6_100%)] shadow-[0_20px_44px_rgba(228,196,138,0.2)]'
    : 'group relative w-full overflow-hidden rounded-[30px] border border-[#d9c29b]/28 bg-[linear-gradient(180deg,rgba(31,22,18,0.94),rgba(14,10,8,0.98))] shadow-[0_28px_64px_rgba(0,0,0,0.3)]';
  const headerClassName = immersive
    ? 'absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-[#efdcb8] bg-[rgba(255,252,245,0.92)] px-4 py-3 text-[#6b5336] backdrop-blur-xl'
    : 'absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-white/8 bg-[rgba(16,11,9,0.72)] px-4 py-3 text-[#f4ecdf] backdrop-blur-xl';
  const chipClassName = immersive
    ? 'rounded-full border border-[#eed6a8] bg-white/80 px-3 py-2 text-sm text-[#6f5638] transition-colors hover:bg-[#fff6df]'
    : 'rounded-full border border-[#d9c29b]/24 bg-[rgba(255,255,255,0.06)] px-3 py-2 text-sm text-[#f0dfc2] transition-colors hover:bg-[rgba(255,255,255,0.1)]';
  const emptyStateClassName = immersive
    ? 'relative flex h-full min-h-full flex-col justify-between px-6 py-7 text-[#5f4a31] md:px-8 md:py-8'
    : 'relative flex h-full min-h-[520px] flex-col justify-between px-6 py-7 text-[#f6eee1] md:px-8 md:py-8';

  const applyIframeClassroomTheme = useCallback(() => {
    if (!immersive || !iframeRef.current) {
      return;
    }

    try {
      const doc = iframeRef.current.contentDocument;
      if (!doc?.documentElement || !doc.body) {
        return;
      }

      doc.documentElement.setAttribute('data-course-platform-theme', 'classroom-light');
      doc.body.setAttribute('data-course-platform-theme', 'classroom-light');

      const styleId = 'course-platform-classroom-light-theme';
      let styleElement = doc.getElementById(styleId) as HTMLStyleElement | null;
      if (!styleElement) {
        styleElement = doc.createElement('style');
        styleElement.id = styleId;
        doc.head?.appendChild(styleElement);
      }

      styleElement.textContent = `
        html, body {
          background:
            radial-gradient(circle at top, rgba(255, 242, 201, 0.98), rgba(248, 235, 208, 0.92) 42%, rgba(241, 247, 255, 0.96) 100%) !important;
          color: #5e4729 !important;
        }
        body { min-height: 100vh !important; }
        .game, main, .app-shell, .page, .container {
          background: rgba(255, 252, 245, 0.94) !important;
          color: #5e4729 !important;
          border-color: rgba(219, 187, 124, 0.48) !important;
          box-shadow: 0 22px 48px rgba(196, 164, 99, 0.18) !important;
        }
        .hero, .banner, .hero-card, header.hero {
          background:
            linear-gradient(135deg, rgba(255, 248, 231, 0.96), rgba(255, 239, 201, 0.94) 48%, rgba(244, 249, 255, 0.96)) !important;
          color: #6a4f25 !important;
          border-bottom: 1px solid rgba(219, 187, 124, 0.4) !important;
        }
        .hero p, .hero .eyebrow, .banner p, .subtitle, .description {
          color: #806344 !important;
          opacity: 1 !important;
        }
        .eyebrow, .pill, .badge, .tag {
          background: #fff8e8 !important;
          color: #9a6f2f !important;
          border-color: rgba(226, 199, 144, 0.88) !important;
        }
        button, .button, .btn, .next {
          background: linear-gradient(180deg, #ffd978, #f7b84e) !important;
          color: #66440d !important;
          border-color: rgba(232, 187, 94, 0.9) !important;
          box-shadow: 0 12px 28px rgba(245, 190, 81, 0.18) !important;
        }
        button.secondary, .btn-secondary, .ghost {
          background: #fff8ea !important;
          color: #74572d !important;
          border-color: rgba(226, 199, 144, 0.88) !important;
          box-shadow: none !important;
        }
        .option, .card, .panel, .tile, .question-card {
          background: rgba(255, 255, 255, 0.92) !important;
          color: #5b4527 !important;
          border-color: rgba(223, 198, 157, 0.95) !important;
        }
        .score, .highlight, .title {
          color: #8f5b18 !important;
        }
      `;
    } catch (error) {
      console.warn('Failed to apply classroom light theme to mini app iframe', error);
    }
  }, [immersive]);

  const reportMiniAppEvent = useCallback(
    async (eventType: string, mountOverride?: ModuleItemMiniAppMount | null, eventPayload?: Record<string, unknown>) => {
      const eventMount = mountOverride || runtimeMount;
      const miniAppId = eventMount?.miniAppId || eventMount?.mini_app_id;

      if (!miniAppId || !runtimeOwner) {
        return;
      }

      try {
        await fetch('/api/miniapps/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            miniAppId,
            miniAppVersionId:
              eventMount?.miniAppVersionId || eventMount?.mini_app_version_id || null,
            ownerKind: runtimeOwner.ownerKind,
            ownerId: runtimeOwner.ownerId,
            lessonId,
            eventType,
            eventPayload: eventPayload || {},
          }),
        });
      } catch (error) {
        console.error('Failed to report mini app event', error);
      }
    },
    [lessonId, runtimeMount, runtimeOwner]
  );

  const launchMiniApp = useCallback(async () => {
    if (mountStatus === 'disabled') {
      setLaunchError('该 Mini App 当前已被禁用，暂时无法启动。');
      return;
    }

    if (launchMode !== 'iframe') {
      setLaunchError(`暂不支持的 Mini App 启动方式: ${launchMode}`);
      return;
    }

    if (!runtimeOwner && !entryUrl) {
      setLaunchError('缺少 Mini App 挂载信息，暂时无法启动。');
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);

    try {
      if (runtimeOwner) {
        await reportMiniAppEvent('runtime_launch_requested', runtimeMount, {
          launchMode,
        });

        const response = await fetch('/api/miniapps/launch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ownerKind: runtimeOwner.ownerKind,
            ownerId: runtimeOwner.ownerId,
            lessonId,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as LaunchResponse;
        const nextMount = normalizeModuleItemMiniAppMount(payload.mount);
        const nextLaunchUrl =
          payload.launchUrl ||
          payload.launch_url ||
          payload.entryUrl ||
          payload.entry_url ||
          entryUrl;

        if (!response.ok || !nextLaunchUrl) {
          throw new Error('Mini App 启动失败，请稍后重试。');
        }

        if (nextMount) {
          setRuntimeMount(nextMount);
        }
        setLaunchUrl(nextLaunchUrl);
        await reportMiniAppEvent('runtime_launch_succeeded', nextMount || runtimeMount, {
          launchUrl: nextLaunchUrl,
        });
        return;
      }

      setLaunchUrl(entryUrl);
    } catch (error) {
      console.error('Failed to launch mini app', error);
      await reportMiniAppEvent('runtime_launch_failed', runtimeMount, {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
      setLaunchError(error instanceof Error ? error.message : 'Mini App 启动失败，请稍后重试。');
    } finally {
      setIsLaunching(false);
    }
  }, [
    entryUrl,
    launchMode,
    lessonId,
    mountStatus,
    reportMiniAppEvent,
    runtimeMount,
    runtimeOwner,
  ]);

  useEffect(() => {
    if (!autoLaunch || isLaunching || launchUrl || launchError) {
      return;
    }

    async function startAutomatically() {
      await launchMiniApp();
    }

    void startAutomatically();
  }, [autoLaunch, isLaunching, launchError, launchMiniApp, launchUrl]);

  useEffect(() => {
    if (!iframeRef.current || !launchUrl) {
      return;
    }

    function handleMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }

      const payload =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : null;
      const eventType =
        typeof payload?.type === 'string'
          ? payload.type
          : typeof payload?.event === 'string'
          ? payload.event
          : '';

      if (!eventType) {
        return;
      }

      if (
        ['miniapp.ready', 'miniapp.progress', 'miniapp.score', 'miniapp.error', 'game.ready', 'game.progress', 'game.score', 'game.error'].includes(
          eventType
        )
      ) {
        void reportMiniAppEvent(eventType, runtimeMount, payload || undefined);
        return;
      }

      if (['miniapp.complete', 'game.complete'].includes(eventType)) {
        void reportMiniAppEvent(eventType, runtimeMount, payload || undefined);
        onComplete?.();
      }
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [launchUrl, onComplete, reportMiniAppEvent, runtimeMount]);

  const postHostInit = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !launchUrl) {
      return;
    }

    let targetOrigin = window.location.origin;
    try {
      targetOrigin = new URL(launchUrl).origin;
    } catch {
      targetOrigin = window.location.origin;
    }

    iframeRef.current.contentWindow.postMessage(
      {
        type: 'host.init',
        lessonId,
        itemId: item.id,
        sourceType: 'sourceType' in item ? item.sourceType || null : null,
        sourceItemId: 'sourceItemId' in item ? item.sourceItemId || null : null,
        teacherResourceId: 'teacherResourceId' in item ? item.teacherResourceId || null : null,
      },
      targetOrigin
    );
  }, [item, launchUrl, lessonId]);

  return (
    <div className="h-full w-full">
      <div
        className={frameClassName}
        style={{
          aspectRatio: immersive ? undefined : aspectRatio,
          minHeight: immersive ? '100%' : 520,
        }}
      >
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-28 ${
            immersive
              ? 'bg-[radial-gradient(circle_at_top,rgba(255,214,138,0.32),transparent_74%)]'
              : 'bg-[radial-gradient(circle_at_top,rgba(240,200,121,0.18),transparent_72%)]'
          }`}
        />
        <div
          className={`pointer-events-none absolute bottom-[-10%] right-[-4%] h-48 w-48 rounded-full blur-3xl ${
            immersive ? 'bg-[#ffd8b0]/40' : 'bg-[#8f2017]/16'
          }`}
        />

        {iframeUrl ? (
          <>
            <div className={headerClassName}>
              <div className="min-w-0">
                <div
                  className={`truncate text-sm tracking-[0.16em] ${
                    immersive ? 'text-[#b68a50]' : 'text-[#cfbc9a]'
                  }`}
                >
                  Mini App
                </div>
                <div
                  className={`truncate text-base ${
                    immersive ? 'text-[#624b31]' : 'text-[#f8eddc]'
                  }`}
                >
                  {title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void launchMiniApp()}
                  className={`inline-flex items-center gap-2 ${chipClassName}`}
                >
                  <RefreshCw className="h-4 w-4" />
                  重载
                </button>
                <a
                  href={iframeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 ${chipClassName}`}
                >
                  <ExternalLink className="h-4 w-4" />
                  新窗口
                </a>
              </div>
            </div>
            <div className={`h-full ${immersive ? 'pt-[4.75rem]' : 'pt-[4.5rem]'}`}>
              <iframe
                ref={iframeRef}
                title={title}
                src={iframeUrl}
                className={`h-full w-full ${immersive ? 'bg-white' : 'min-h-[520px] bg-[#120d0b]'}`}
                sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                allow="clipboard-read; clipboard-write; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => {
                  postHostInit();
                  applyIframeClassroomTheme();
                  void reportMiniAppEvent('runtime_iframe_loaded');
                }}
              />
            </div>
          </>
        ) : (
          <div className={emptyStateClassName}>
            <div>
              <div
                className={`inline-flex rounded-full px-4 py-2 text-xs tracking-[0.2em] ${
                  immersive
                    ? 'border border-[#eed8ad] bg-white/80 text-[#b98a42]'
                    : 'border border-[#d9c29b]/24 bg-[rgba(255,255,255,0.05)] text-[#cfbc9a]'
                }`}
              >
                可执行课堂内容
              </div>
              <h3
                className={`mt-5 text-3xl font-semibold ${
                  immersive ? 'text-[#60492d]' : 'text-[#f8eddc]'
                }`}
              >
                {title}
              </h3>
              {description ? (
                <p
                  className={`mt-4 max-w-3xl text-base leading-8 ${
                    immersive ? 'text-[#88694d]' : 'text-[#d7c8b2]'
                  }`}
                >
                  {description}
                </p>
              ) : null}
              <div
                className={`mt-6 flex flex-wrap gap-3 text-sm ${
                  immersive ? 'text-[#73573a]' : 'text-[#eadcc6]'
                }`}
              >
                {appKey ? (
                  <span
                    className={`rounded-full px-3 py-1.5 ${
                      immersive
                        ? 'border border-[#eed8ad] bg-white/82'
                        : 'border border-[#d9c29b]/20 bg-[rgba(255,255,255,0.05)]'
                    }`}
                  >
                    Key {appKey}
                  </span>
                ) : null}
                {vendorName ? (
                  <span
                    className={`rounded-full px-3 py-1.5 ${
                      immersive
                        ? 'border border-[#eed8ad] bg-white/82'
                        : 'border border-[#d9c29b]/20 bg-[rgba(255,255,255,0.05)]'
                    }`}
                  >
                    {vendorName}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-3 py-1.5 ${
                    immersive
                      ? 'border border-[#eed8ad] bg-white/82'
                      : 'border border-[#d9c29b]/20 bg-[rgba(255,255,255,0.05)]'
                  }`}
                >
                  {launchMode === 'iframe' ? '嵌入式启动' : launchMode}
                </span>
              </div>
            </div>

            <div className="mt-8">
              {launchError ? (
                <div
                  className={`mb-4 rounded-[20px] px-4 py-3 text-sm ${
                    immersive
                      ? 'border border-[#efb28b] bg-[#fff1e8] text-[#a8502f]'
                      : 'border border-[#b85c4d]/38 bg-[rgba(120,29,19,0.2)] text-[#f5d2cb]'
                  }`}
                >
                  {launchError}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void launchMiniApp()}
                disabled={isLaunching || mountStatus === 'disabled'}
                className={`inline-flex items-center gap-3 rounded-full px-6 py-3 text-base font-medium transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                  immersive
                    ? 'bg-[linear-gradient(180deg,#ffd978,#f7b84e)] text-[#66440d] shadow-[0_18px_36px_rgba(245,190,81,0.24)]'
                    : 'bg-[linear-gradient(180deg,#d7a14c,#a55e16)] text-[#22140f] shadow-[0_20px_44px_rgba(165,94,22,0.28)]'
                }`}
              >
                {isLaunching ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Rocket className="h-5 w-5" />
                )}
                {isLaunching ? '启动中...' : '启动 Mini App'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
