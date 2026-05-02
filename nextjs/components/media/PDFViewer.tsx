'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

interface PDFViewerProps {
  src: string;
  title: string;
  immersive?: boolean;
}

export default function PDFViewer({
  src,
  title,
  immersive = false,
}: PDFViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const viewerSrc = useMemo(() => {
    const joiner = src.includes('#') ? '&' : '#';
    return `${src}${joiner}toolbar=1&navpanes=0&view=FitH`;
  }, [src]);

  return (
    <div
      className={`overflow-hidden bg-white ${
        immersive
          ? 'rounded-[28px] border border-[#d9c29b]/24 shadow-[0_24px_48px_rgba(0,0,0,0.2)]'
          : 'rounded-xl border border-[#d9c29b]/24'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-5 w-5 flex-shrink-0 text-amber-500" />
          <span className="truncate font-medium text-gray-900">{title}</span>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/60 bg-white px-3 py-1.5 text-sm text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
        >
          <ExternalLink className="h-4 w-4" />
          新窗口打开
        </a>
      </div>

      <div className={`relative bg-gray-100 ${immersive ? 'h-[72vh]' : 'h-[68vh]'}`}>
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
              <span className="ml-3 text-gray-600">加载中...</span>
            </div>
          </div>
        ) : null}

        <iframe
          src={viewerSrc}
          title={title}
          className="h-full w-full border-0"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
