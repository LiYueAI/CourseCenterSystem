import type { Metadata } from 'next';
import './globals.css';
import { PlatformSettingsProvider } from '@/components/platform/PlatformSettingsProvider';
import { getPlatformSettings } from '@/lib/platform-settings';

function getMetadataBase(siteUrl: string) {
  try {
    return new URL(siteUrl);
  } catch {
    return new URL('http://124.223.94.102');
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettings();
  const metadataBase = getMetadataBase(settings.metadata.siteUrl);

  return {
    title: settings.metadata.title,
    description: settings.metadata.description,
    keywords: settings.metadata.keywords,
    metadataBase,
    openGraph: {
      title: settings.metadata.openGraphTitle,
      description: settings.metadata.openGraphDescription,
      url: settings.metadata.siteUrl,
      siteName: settings.branding.platformName,
      locale: 'zh_CN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: settings.metadata.openGraphTitle,
      description: settings.metadata.openGraphDescription,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getPlatformSettings();

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white">
        <div className="bg-grain fixed inset-0 z-50" />
        <PlatformSettingsProvider initialSettings={settings}>
          {children}
        </PlatformSettingsProvider>
      </body>
    </html>
  );
}
