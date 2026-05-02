'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { usePlatformSettings } from '@/components/platform/PlatformSettingsProvider';
import { getPlatformIcon } from '@/lib/platform-icons';

function ThemeCard({ name }: { name: string }) {
  return (
    <div className="min-h-[120px] rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.95),rgba(248,239,224,0.95))] shadow-[0_8px_24px_rgba(89,52,25,0.08)] flex items-center justify-center p-6">
      <span className="portal-title text-xl font-medium tracking-wide text-stone-900">{name}</span>
    </div>
  );
}

export default function HomePage() {
  const settings = usePlatformSettings();

  function renderBrandMark() {
    if (settings.branding.logoUrl) {
      return (
        <img
          src={settings.branding.logoUrl}
          alt={settings.branding.platformName}
          className="h-8 max-w-[220px] object-contain"
        />
      );
    }

    return settings.branding.shortLogoText;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f6efe2_0%,#f2e8d5_30%,#f7f2e8_54%,#efe2ce_100%)] text-stone-900">
      <div className="portal-grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute left-[-8%] top-[-4%] h-80 w-80 rounded-full bg-[#8f2017]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-8%] right-[-4%] h-96 w-96 rounded-full bg-[#c59a5d]/14 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.38),transparent_24%,transparent_72%,rgba(92,49,27,0.08)_100%)]" />

      <header className="relative z-20 border-b border-[#d9c29b]/45 bg-white/55 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(143,32,23,0.18),rgba(197,154,93,0.4),rgba(143,32,23,0.18),transparent)]" />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <Link
            href="/"
            className="portal-stamp flex h-12 items-center justify-center rounded-full border border-[#9f2a20]/40 bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 text-sm font-semibold tracking-[0.12em] text-[#f8ead1] shadow-[0_10px_24px_rgba(127,23,18,0.24)]"
          >
            {renderBrandMark()}
          </Link>
          <nav className="flex items-center gap-3">
            {settings.home.portals.map((portal) => (
              <Link
                key={portal.href}
                href={portal.href}
                className="rounded-full border border-[#d9c29b]/55 bg-white/70 px-4 py-2 text-sm tracking-[0.14em] text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
              >
                {portal.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <section className="portal-panel p-12 text-center">
          <h1 className="portal-title text-4xl font-medium tracking-wide text-stone-900 md:text-5xl">
            {settings.home.heroTitle}
          </h1>
          {settings.home.heroSubtitle ? (
            <p className="mx-auto mt-6 max-w-xl text-lg text-stone-600">
              {settings.home.heroSubtitle}
            </p>
          ) : null}
          <div className="mt-10">
            <Link
              href={settings.home.heroCtaHref}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-8 py-4 text-sm font-medium tracking-[0.14em] text-[#f8ead1] shadow-[0_12px_26px_rgba(127,23,18,0.22)] transition-all hover:shadow-[0_16px_32px_rgba(127,23,18,0.28)]"
            >
              {settings.home.heroCtaText}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {settings.home.features.map((feature) => {
            const Icon = getPlatformIcon(feature.icon);
            return (
              <article
                key={feature.title}
                className="portal-panel p-6"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{feature.title}</h3>
                <p className="mt-2 truncate text-sm text-stone-600">{feature.desc}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-16">
          <h2 className="text-center portal-title text-2xl text-stone-900">主题课程</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {settings.home.themes.map((theme) => (
              <ThemeCard key={theme.name} name={theme.name} />
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-20 border-t border-[#d9c29b]/45 bg-white/55">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
          <div />
          <div className="flex gap-6 text-sm text-stone-400">
            {settings.branding.footerLinks.map((link) => (
              <a key={link.label} href={link.href} className="hover:text-[#8f2017]">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  );
}
