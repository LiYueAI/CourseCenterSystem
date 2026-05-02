"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePlatformSettings } from "@/components/platform/PlatformSettingsProvider";

interface PortalShellProps {
  roleLabel: string;
  userName?: string;
  actions?: ReactNode;
  hideHeaderMeta?: boolean;
  children: ReactNode;
}

export default function PortalShell({
  roleLabel,
  userName,
  actions,
  hideHeaderMeta = false,
  children,
}: PortalShellProps) {
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
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f6efe2_0%,#f2e8d5_30%,#f7f2e8_54%,#efe2ce_100%)] text-stone-900">
      <div className="portal-grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute left-[-8%] top-[-4%] h-80 w-80 rounded-full bg-[#8f2017]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-8%] right-[-4%] h-96 w-96 rounded-full bg-[#c59a5d]/14 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.38),transparent_24%,transparent_72%,rgba(92,49,27,0.08)_100%)]" />

      <header className="relative z-20 border-b border-[#d9c29b]/45 bg-white/55 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(143,32,23,0.18),rgba(197,154,93,0.4),rgba(143,32,23,0.18),transparent)]" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="portal-stamp flex h-12 items-center justify-center rounded-full border border-[#9f2a20]/40 bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 text-sm font-semibold tracking-[0.12em] text-[#f8ead1] shadow-[0_10px_24px_rgba(127,23,18,0.24)]"
            >
              {renderBrandMark()}
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {userName ? (
              <div className="hidden rounded-full border border-[#d9c29b]/45 bg-white/70 px-4 py-2 text-sm tracking-[0.08em] text-stone-600 md:block">
                {userName}
              </div>
            ) : null}
            {actions}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-8 md:pb-24 md:pt-10">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(217,194,155,0.18),transparent)]" />
        {children}
      </main>
    </div>
  );
}
