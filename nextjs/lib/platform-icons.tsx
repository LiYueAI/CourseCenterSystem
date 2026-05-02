import {
  BookOpen,
  Bot,
  Database,
  Gamepad2,
  GraduationCap,
  Layers,
  Palette,
  Route,
  School2,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const PLATFORM_ICON_MAP: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  bot: Bot,
  database: Database,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  layers: Layers,
  palette: Palette,
  route: Route,
  'school-2': School2,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  users: Users,
  wrench: Wrench,
};

export function getPlatformIcon(iconName?: string): LucideIcon {
  if (!iconName) {
    return Sparkles;
  }

  return PLATFORM_ICON_MAP[iconName] || Sparkles;
}
