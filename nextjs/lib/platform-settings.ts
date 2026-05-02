import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import type { PlatformSettings } from '@/lib/platform-settings.types';

const SETTINGS_KEY = 'global';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  branding: {
    platformName: '智慧AI教学平台',
    shellName: '智慧AI教学平台',
    shortLogoText: '智慧AI教学平台',
    logoUrl: '',
    platformTagline: '全国中小学主题课程平台',
    footerLinks: [
      { label: '隐私政策', href: '#' },
      { label: '用户协议', href: '#' },
      { label: '联系我们', href: '#' },
    ],
  },
  metadata: {
    title: '智慧AI教学平台',
    description:
      '智慧AI教学平台是面向全国中小学的多主题课程平台，支持礼乐、探秘农业、机器人、水世界等课程扩展，并提供老师端、学生端、管理端与 AI 教学能力建设。',
    keywords: [
      '智慧AI教学平台',
      '全国中小学课程平台',
      '多主题课程平台',
      'AI教学平台',
      '主题课程平台',
      '探秘农业课程',
      '水世界课程',
      '机器人课程',
    ],
    siteUrl: 'http://124.223.94.102',
    openGraphTitle: '智慧AI教学平台',
    openGraphDescription:
      '面向全国中小学的多主题课程平台，支持礼乐、探秘农业、机器人、水世界等课程扩展。',
  },
  home: {
    portals: [
      { label: '学生登录', href: '/login/student' },
      { label: '教师登录', href: '/login/teacher' },
      { label: '管理登录', href: '/login/admin' },
    ],
    heroTitle: 'AI+个性化，打造智慧课堂',
    heroSubtitle: '',
    heroCtaText: '立即注册',
    heroCtaHref: '/register',
    features: [
      { icon: 'book-open', title: '专家统一课程', desc: '专家统一编排课程内容' },
      { icon: 'layers', title: '积木式自定义', desc: '自定义资源，自由组合课件' },
      { icon: 'route', title: '路径化学习', desc: '小星星按钮顺序推进' },
      { icon: 'sparkles', title: 'AI辅助教学', desc: '智能备课，轻松上课' },
    ],
    themes: [
      { name: '礼乐课程', desc: '' },
      { name: '探秘农业', desc: '' },
      { name: '机器人', desc: '' },
      { name: '水世界', desc: '' },
    ],
  },
  login: {
    marketingBadge: '多主题课程统一入口',
    marketingTitlePrimary: '智慧课堂',
    marketingTitleSecondary: 'AI教学新生长',
    roleDescriptions: {
      student: '登录后进入学生端学习空间。',
      teacher: '登录后进入教师端课程工作区。',
      admin: '登录后可以管理系统用户、配置系统设置',
    },
    roleHighlights: {
      student: ['跟随课堂节奏学习', '按课程流程完成任务', '沉淀每课学习进展'],
      teacher: ['围绕课时灵活备课', '组织课堂内容与顺序', '在站内统一管理教学素材'],
      admin: ['统一维护平台账号', '管理内容与权限入口', '在一个后台完成全局运营'],
    },
  },
  register: {
    portalBadge: '统一注册入口',
    portalTitle: '选择要注册的身份',
    portalDescription: '首页“立即注册”会先进入这里，再按身份进入学生或教师注册表单。',
    portals: [
      {
        title: '学生注册',
        description: '填写学校、年级和班级信息后，进入自己的学习空间。',
        href: '/register/student',
        icon: 'graduation-cap',
        buttonLabel: '进入学生注册',
      },
      {
        title: '教师注册',
        description: '填写姓名、手机号、学校、学科、年级和班级后即可创建教师账号。',
        href: '/register/teacher',
        icon: 'school-2',
        buttonLabel: '进入教师注册',
      },
    ],
    marketingBadge: '统一注册入口',
    marketingTitlePrimary: '注册平台账号',
    marketingTitleSecondary: '',
    roleDescriptions: {
      student: '学生填写手机号与班级编码后，即可进入自己的学习空间。',
      teacher: '',
    },
    roleHighlights: {
      teacher: [],
      student: ['先填手机号', '再填班级编码', '注册后直接上课'],
    },
    formIntro: '',
    buttonLabels: {
      teacher: '创建教师账号',
      student: '创建学生账号',
    },
  },
  adminDashboard: {
    title: '智慧AI教学平台管理驾驶舱',
    description:
      '管理端不只是后台入口，而是面向平台运营、课程治理和资源治理的统一驾驶舱。当前已重点关注用户、内容与资源状态。',
    entryCards: [
      {
        href: '/manage/content',
        title: '课程管理',
        description: '统一查看课程、单元、课时、流程和课件资源。',
        badge: '课程结构',
        icon: 'settings',
      },
      {
        href: '/manage/resources',
        title: '资源管理',
        description: '集中查看老师端上传资源、文件链接与审核状态。',
        badge: '资源库',
        icon: 'database',
      },
      {
        href: '/manage/users',
        title: '用户管理',
        description: '统一维护教师、学生与管理员账号状态。',
        badge: '账号与权限',
        icon: 'users',
      },
      {
        href: '/manage/classrooms',
        title: '班级管理',
        description: '查看当前班级、班级编码、老师与学生数量。',
        badge: '班级目录',
        icon: 'users',
      },
    ],
    resourceGovernanceTitle: '流程资源已经开始汇聚到平台资源库',
    resourceGovernanceDescription:
      '老师端上传的课件现在会同步写入流程课件项和平台资源库，便于后续审核、共建、筛选和升级为平台标准内容。当前资源库条数已纳入管理端概览。',
    focusCards: [
      { icon: 'database', title: '资源入库', desc: '老师上传后同步写入 Directus 资源库。' },
      { icon: 'settings', title: '流程治理', desc: '内容管理页可继续维护流程课件内容。' },
      { icon: 'users', title: '共建沉淀', desc: '后续可在优质资源基础上升级为标准内容。' },
    ],
    nextGovernanceCards: [
      { title: '资源审核', desc: '后续可以在资源库基础上增加待审核、已通过、已驳回等状态流转。' },
      { title: '优质升级', desc: '老师上传的优质资源可升级为平台标准内容，替换原有默认素材。' },
    ],
  },
};

type SettingsRow = {
  value: Partial<PlatformSettings> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (Array.isArray(base)) {
    return (Array.isArray(patch) ? patch : base) as T;
  }

  if (!isPlainObject(base)) {
    return (patch === undefined ? base : patch) as T;
  }

  if (!isPlainObject(patch)) {
    return base;
  }

  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    const baseValue = (base as Record<string, unknown>)[key];
    if (Array.isArray(baseValue)) {
      merged[key] = Array.isArray(value) ? value : baseValue;
      continue;
    }

    if (isPlainObject(baseValue)) {
      merged[key] = deepMerge(baseValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged as T;
}

export function normalizePlatformSettings(input: unknown): PlatformSettings {
  return deepMerge(DEFAULT_PLATFORM_SETTINGS, input);
}

export async function ensurePlatformSettingsTable() {
  await query(`
    create table if not exists platform_settings (
      key text primary key,
      value jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  noStore();
  await ensurePlatformSettingsTable();

  const row = await queryOne<SettingsRow>(
    'select value from platform_settings where key = $1',
    [SETTINGS_KEY]
  );

  return normalizePlatformSettings(row?.value || {});
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  await ensurePlatformSettingsTable();
  const normalized = normalizePlatformSettings(settings);

  await query(
    `
      insert into platform_settings (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key)
      do update set value = excluded.value, updated_at = now()
    `,
    [SETTINGS_KEY, JSON.stringify(normalized)]
  );
}
