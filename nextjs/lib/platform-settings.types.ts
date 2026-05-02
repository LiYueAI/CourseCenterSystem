export type PlatformLink = {
  label: string;
  href: string;
};

export type PlatformFeature = {
  icon: string;
  title: string;
  desc: string;
};

export type PlatformTheme = {
  name: string;
  desc: string;
};

export type AdminEntryCard = {
  href: string;
  title: string;
  description: string;
  badge: string;
  icon: string;
  external?: boolean;
};

export type AdminFocusCard = {
  title: string;
  desc: string;
  icon: string;
};

export type PlatformSettings = {
  branding: {
    platformName: string;
    shellName: string;
    shortLogoText: string;
    logoUrl: string;
    platformTagline: string;
    footerLinks: PlatformLink[];
  };
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    siteUrl: string;
    openGraphTitle: string;
    openGraphDescription: string;
  };
  home: {
    portals: PlatformLink[];
    heroTitle: string;
    heroSubtitle: string;
    heroCtaText: string;
    heroCtaHref: string;
    features: PlatformFeature[];
    themes: PlatformTheme[];
  };
  login: {
    marketingBadge: string;
    marketingTitlePrimary: string;
    marketingTitleSecondary: string;
    roleDescriptions: Record<'student' | 'teacher' | 'admin', string>;
    roleHighlights: Record<'student' | 'teacher' | 'admin', string[]>;
  };
  register: {
    portalBadge: string;
    portalTitle: string;
    portalDescription: string;
    portals: Array<{
      title: string;
      description: string;
      href: string;
      icon: string;
      buttonLabel: string;
    }>;
    marketingBadge: string;
    marketingTitlePrimary: string;
    marketingTitleSecondary: string;
    roleDescriptions: Record<'student' | 'teacher', string>;
    roleHighlights: Record<'student' | 'teacher', string[]>;
    formIntro: string;
    buttonLabels: Record<'student' | 'teacher', string>;
  };
  adminDashboard: {
    title: string;
    description: string;
    entryCards: AdminEntryCard[];
    resourceGovernanceTitle: string;
    resourceGovernanceDescription: string;
    focusCards: AdminFocusCard[];
    nextGovernanceCards: Array<{ title: string; desc: string }>;
  };
};
