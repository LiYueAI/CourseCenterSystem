'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import VideoPlayer from './VideoPlayer';
import AudioPlayer from './AudioPlayer';
import DocViewer from './DocViewer';
import MiniAppHost from './MiniAppHost';
import { getModuleItemMiniAppMount, type ModuleItem } from '@/lib/directus';

const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-[24px] border border-[#d9c29b]/22 bg-[rgba(255,255,255,0.04)] p-8">
      <div className="h-8 w-8 rounded-full border-2 border-[#d7a14c] border-t-transparent animate-spin" />
      <span className="ml-3 text-[#d3c4ab]">加载 PDF 阅读器...</span>
    </div>
  ),
});

interface MediaPreviewProps {
  item: ModuleItem;
  lessonId: number;
  playState?: 'idle' | 'playing' | 'paused' | 'completed';
  onItemEnd?: () => void;
  immersive?: boolean;
}

function MissingAsset({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-[24px] border border-[#d9c29b]/24 bg-[rgba(255,255,255,0.04)] p-8">
      <p className="text-center text-[#d3c4ab]">{message}</p>
    </div>
  );
}

function DetailBlock({
  label,
  content,
  immersive = false,
}: {
  label: string;
  content?: string | null;
  immersive?: boolean;
}) {
  if (!content?.trim()) {
    return null;
  }

  return (
    <div
      className={`rounded-[22px] border px-4 py-4 ${
        immersive
          ? 'border-[#eed9b5] bg-[linear-gradient(180deg,rgba(255,252,244,0.96),rgba(249,250,255,0.94))]'
          : 'border-[#d9c29b]/16 bg-[rgba(255,255,255,0.03)]'
      }`}
    >
      <div className={`text-xs tracking-[0.18em] ${immersive ? 'text-[#b48952]' : 'text-[#cbb89a]'}`}>
        {label}
      </div>
      <p
        className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${
          immersive ? 'text-[#71563c]' : 'text-[#f3eadb]'
        }`}
      >
        {content}
      </p>
    </div>
  );
}

type DocumentPreviewKind = 'pending' | 'pdf' | 'doc' | 'ppt';

function inferDocumentKind(
  itemType: string,
  fileUrl?: string | null,
  title?: string | null
): DocumentPreviewKind {
  if ((fileUrl || '').toLowerCase().includes('.html')) {
    return 'doc';
  }

  if (itemType === 'ppt') {
    return 'ppt';
  }

  const source = `${title || ''} ${fileUrl || ''}`.toLowerCase();
  if (source.includes('.pdf') || source.endsWith('pdf')) {
    return 'pdf';
  }
  if (source.includes('.ppt') || source.includes('.pptx')) {
    return 'ppt';
  }
  if (source.includes('.doc') || source.includes('.docx')) {
    return 'doc';
  }

  return itemType === 'doc' ? 'pending' : 'doc';
}

export default function MediaPreview({
  item,
  lessonId,
  playState = 'idle',
  onItemEnd,
  immersive = false,
}: MediaPreviewProps) {
  const { item_type, file_url, title, duration } = item;
  const miniAppMount = getModuleItemMiniAppMount(item);
  const htmlFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [documentKind, setDocumentKind] = useState<DocumentPreviewKind>(() =>
    inferDocumentKind(item_type, file_url, title)
  );

  const applyEmbeddedHtmlTheme = useCallback(() => {
    if (!immersive || !htmlFrameRef.current) {
      return;
    }

    try {
      const doc = htmlFrameRef.current.contentDocument;
      if (!doc?.documentElement || !doc.body) {
        return;
      }

      const styleId = 'course-platform-embedded-html-light-theme';
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
        main, .page, .container, .app, .game, .card, .panel, .wrapper {
          background: rgba(255, 252, 245, 0.94) !important;
          color: #5e4729 !important;
          border-color: rgba(219, 187, 124, 0.48) !important;
          box-shadow: 0 22px 48px rgba(196, 164, 99, 0.16) !important;
        }
        .hero, .banner, header.hero {
          background:
            linear-gradient(135deg, rgba(255, 248, 231, 0.96), rgba(255, 239, 201, 0.94) 48%, rgba(244, 249, 255, 0.96)) !important;
          color: #6a4f25 !important;
        }
        button, .button, .btn {
          background: linear-gradient(180deg, #ffd978, #f7b84e) !important;
          color: #66440d !important;
          border-color: rgba(232, 187, 94, 0.9) !important;
        }
      `;
    } catch (error) {
      console.warn('Failed to apply classroom light theme to embedded html', error);
    }
  }, [immersive]);

  useEffect(() => {
    setDocumentKind(inferDocumentKind(item_type, file_url, title));
  }, [file_url, item_type, title]);

  useEffect(() => {
    if (item_type !== 'doc' || !file_url) {
      return;
    }

    const documentUrl = file_url;

    const inferred = inferDocumentKind(item_type, documentUrl, title);
    if (inferred !== 'pending') {
      setDocumentKind(inferred);
      return;
    }

    let cancelled = false;

    async function detectDocumentKind() {
      try {
        const response = await fetch(documentUrl, {
          method: 'HEAD',
          cache: 'force-cache',
        });

        if (!response.ok || cancelled) {
          return;
        }

        const contentType = response.headers.get('content-type')?.toLowerCase() || '';
        const disposition = response.headers.get('content-disposition')?.toLowerCase() || '';
        const fingerprint = `${contentType} ${disposition}`;

        if (fingerprint.includes('application/pdf') || fingerprint.includes('.pdf')) {
          setDocumentKind('pdf');
          return;
        }

        if (
          fingerprint.includes('presentation') ||
          fingerprint.includes('powerpoint') ||
          fingerprint.includes('.ppt')
        ) {
          setDocumentKind('ppt');
          return;
        }

        setDocumentKind('doc');
      } catch (error) {
        console.error('Failed to detect document content type', error);
        if (!cancelled) {
          setDocumentKind('doc');
        }
      }
    }

    detectDocumentKind();

    return () => {
      cancelled = true;
    };
  }, [file_url, item_type, title]);

  const renderPreview = useMemo(() => {
    switch (item_type) {
      case 'video':
        if (!file_url) {
          return <MissingAsset message="视频文件未找到" />;
        }
        return (
          <VideoPlayer
            src={file_url}
            itemId={item.id}
            lessonId={lessonId}
            title={title}
            onEnded={onItemEnd}
            autoPlay={playState === 'playing'}
            immersive={immersive}
          />
        );

      case 'audio':
        if (!file_url) {
          return <MissingAsset message="音频文件未找到" />;
        }
        return (
          <AudioPlayer
            src={file_url}
            itemId={item.id}
            lessonId={lessonId}
            title={title}
            duration={duration}
            onEnded={onItemEnd}
            autoPlay={playState === 'playing'}
            immersive={immersive}
          />
        );

      case 'doc':
        if (!file_url) {
          return <MissingAsset message="文档文件未找到" />;
        }
        if (file_url.toLowerCase().includes('.html')) {
          return (
            <div
              className={
                immersive
                  ? 'h-full w-full overflow-hidden rounded-[28px] border border-[#eed9b5] bg-[linear-gradient(180deg,#fffdf7_0%,#f8fbff_100%)] p-2 shadow-[0_18px_36px_rgba(228,196,138,0.18)]'
                  : 'w-full'
              }
            >
              <iframe
                ref={htmlFrameRef}
                src={file_url}
                title={title}
                className={
                  immersive
                    ? 'h-full min-h-0 w-full rounded-[22px] border-0 bg-white'
                    : 'h-[72vh] w-full rounded-[24px] border border-[#d9c29b]/22 bg-white'
                }
                sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                onLoad={applyEmbeddedHtmlTheme}
              />
            </div>
          );
        }
        if (documentKind === 'pending') {
          return (
            <div
              className={`flex items-center justify-center rounded-[24px] p-8 ${
                immersive
                  ? 'border border-[#eed9b5] bg-[linear-gradient(180deg,#fffdf7_0%,#f8fbff_100%)]'
                  : 'border border-[#d9c29b]/22 bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              <div className="h-8 w-8 rounded-full border-2 border-[#d7a14c] border-t-transparent animate-spin" />
              <span className={`ml-3 ${immersive ? 'text-[#846345]' : 'text-[#d3c4ab]'}`}>
                识别文档类型中...
              </span>
            </div>
          );
        }
        if (documentKind === 'pdf') {
          return <PDFViewer src={file_url} title={title} immersive={immersive} />;
        }
        return <DocViewer src={file_url} title={title} type="doc" immersive={immersive} />;

      case 'ppt':
        if (!file_url) {
          return <MissingAsset message="演示文稿未找到" />;
        }
        return <DocViewer src={file_url} title={title} type="ppt" immersive={immersive} />;

      case 'miniapp':
        return (
          <MiniAppHost
            item={item}
            lessonId={lessonId}
            immersive={immersive}
            autoLaunch={playState === 'playing'}
            onComplete={onItemEnd}
          />
        );

      case 'image':
        if (!file_url) {
          return <MissingAsset message="图片未找到" />;
        }
        return (
          <div className={`space-y-4 ${immersive ? 'flex h-full flex-col justify-center' : ''}`}>
            {!immersive ? <p className="text-2xl font-medium text-center text-white/90">{title}</p> : null}
            <div
              className={`mx-auto overflow-hidden ${
                immersive
                  ? 'w-full rounded-[28px] border border-[#e3cfab]/70 bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(247,238,221,0.92))] p-3 shadow-[0_18px_36px_rgba(192,157,92,0.16)]'
                  : 'rounded-xl'
              }`}
            >
              <img
                src={file_url}
                alt={title}
                className={`mx-auto max-w-full ${
                  immersive
                    ? 'max-h-[68vh] rounded-[22px] object-contain'
                    : 'max-h-[55vh] rounded-xl'
                }`}
              />
            </div>
          </div>
        );

      case 'interactive': {
        if (miniAppMount) {
          return (
            <MiniAppHost
              item={item}
              lessonId={lessonId}
              immersive={immersive}
              autoLaunch={playState === 'playing'}
              onComplete={onItemEnd}
            />
          );
        }

        const interactiveMinutes =
          item.duration_minutes ||
          (duration && Number.isFinite(duration) ? Math.max(1, Math.round(duration / 60)) : null);
        return (
          <div
            className={`mx-auto w-full max-w-5xl rounded-[28px] p-6 text-left backdrop-blur-sm ${
              immersive
                ? 'h-full overflow-auto border border-[#eed9b5] bg-[linear-gradient(180deg,#fffdf7_0%,#f8fbff_60%,#f6fbf6_100%)] shadow-[0_22px_40px_rgba(228,196,138,0.16)] md:p-8'
                : 'border border-[#d9c29b]/24 bg-[rgba(20,14,11,0.68)] shadow-[0_24px_48px_rgba(0,0,0,0.18)]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className={`text-xs tracking-[0.2em] ${immersive ? 'text-[#b48952]' : 'text-[#cbb89a]'}`}>
                  互动环节
                </div>
                <p className={`mt-3 text-2xl font-medium ${immersive ? 'text-[#60492f]' : 'text-[#f0dfc2]'}`}>
                  {title}
                </p>
              </div>
              <div
                className={`rounded-full px-4 py-2 text-sm ${
                  immersive
                    ? 'border border-[#eed8ad] bg-white/82 text-[#7a5d3e]'
                    : 'border border-[#d9c29b]/22 bg-[rgba(255,255,255,0.05)] text-[#e6d8c0]'
                }`}
              >
                {interactiveMinutes ? `预计 ${interactiveMinutes} 分钟` : '课堂活动'}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <DetailBlock label="教师活动" content={item.teacher_activity} immersive={immersive} />
              <DetailBlock label="学生活动" content={item.student_activity} immersive={immersive} />
            </div>

            <div className="mt-4 grid gap-4">
              <DetailBlock label="实施方案" content={item.plan} immersive={immersive} />
              <DetailBlock label="设计意图" content={item.design_intent} immersive={immersive} />
              <DetailBlock
                label="课程标准"
                content={item.curriculum_standards}
                immersive={immersive}
              />
            </div>
          </div>
        );
      }

      default:
        return (
          <div
            className={`rounded-[24px] p-8 text-center backdrop-blur-sm ${
              immersive
                ? 'border border-[#eed9b5] bg-[linear-gradient(180deg,#fffdf7_0%,#f8fbff_100%)]'
                : 'border border-[#d9c29b]/24 bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <p className={immersive ? 'text-[#614a30]' : 'text-[#f0dfc2]'}>
              不支持的媒体类型: {item_type}
            </p>
            <p className={`mt-2 text-sm ${immersive ? 'text-[#8f7151]' : 'text-[#cdbda4]'}`}>
              {title}
            </p>
          </div>
        );
    }
  }, [
    item,
    documentKind,
    immersive,
    lessonId,
    miniAppMount,
    onItemEnd,
    playState,
    title,
    duration,
    file_url,
    item_type,
  ]);

  return <div className={immersive ? 'h-full w-full' : 'w-full'}>{renderPreview}</div>;
}
