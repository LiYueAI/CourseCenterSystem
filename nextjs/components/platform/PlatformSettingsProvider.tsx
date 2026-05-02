'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { PlatformSettings } from '@/lib/platform-settings.types';

const PlatformSettingsContext = createContext<PlatformSettings | null>(null);

export function PlatformSettingsProvider({
  initialSettings,
  children,
}: {
  initialSettings: PlatformSettings;
  children: ReactNode;
}) {
  return (
    <PlatformSettingsContext.Provider value={initialSettings}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings() {
  const context = useContext(PlatformSettingsContext);

  if (!context) {
    throw new Error('usePlatformSettings must be used inside PlatformSettingsProvider');
  }

  return context;
}
