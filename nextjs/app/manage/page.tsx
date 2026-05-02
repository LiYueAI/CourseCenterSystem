import Link from 'next/link';
import { queryOne } from '@/lib/db';
import { getPlatformIcon } from '@/lib/platform-icons';
import AdminPageHeader from '@/components/manage/AdminPageHeader';

export const dynamic = 'force-dynamic';

type OverviewStats = {
  resources: number;
  users: number;
  classrooms: number;
};

async function getOverviewStats(): Promise<OverviewStats> {
  const result = await queryOne<OverviewStats>(
    `
      select
        (select count(*)::int from resources) as resources,
        (select count(*)::int from auth_users) as users,
        (select count(*)::int from school_classrooms) as classrooms
    `
  );

  return (
    result || {
      resources: 0,
      users: 0,
      classrooms: 0,
    }
  );
}

const ENTRY_CARD_ACCENTS = [
  'bg-[#8f2017] text-[#f8ead1]',
  'bg-[#fff8eb] text-[#8f2017]',
  'bg-stone-900 text-white',
  'bg-white text-stone-800',
];

const DASHBOARD_ENTRY_CARDS = [
  { href: '/manage/content', title: '课程管理', icon: 'settings' },
  { href: '/manage/users', title: '用户管理', icon: 'users' },
  { href: '/manage/classrooms', title: '班级管理', icon: 'users' },
  { href: '/manage/ai-services', title: 'AI 管理', icon: 'cpu' },
];

export default async function AdminPage() {
  const stats = await getOverviewStats();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="管理端">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { label: '用户', value: stats.users },
            { label: '班级', value: stats.classrooms },
            { label: '资源', value: stats.resources },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2 text-sm text-stone-600"
            >
              {item.label} {item.value}
            </div>
          ))}
        </div>
      </AdminPageHeader>

      <section className="portal-panel p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {DASHBOARD_ENTRY_CARDS.map((card, index) => {
            const Icon = getPlatformIcon(card.icon);
            const accent = ENTRY_CARD_ACCENTS[index % ENTRY_CARD_ACCENTS.length];

            return (
              <Link
                key={card.title}
                href={card.href}
                className="group rounded-[24px] border border-[#d9c29b]/50 bg-white/86 p-5 transition-colors hover:border-[#c58d3e] hover:bg-[#fffaf0]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 text-lg font-semibold text-stone-900">{card.title}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
