'use client';

import OnlyOfficeViewer from './OnlyOfficeViewer';

interface DocViewerProps {
  src: string;
  title: string;
  type: 'ppt' | 'doc';
  immersive?: boolean;
}

export default function DocViewer({
  src,
  title,
  type,
  immersive = false,
}: DocViewerProps) {
  return <OnlyOfficeViewer src={src} title={title} type={type} immersive={immersive} />;
}
