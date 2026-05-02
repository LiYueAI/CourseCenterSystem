import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PortalShell from '@/components/portal/PortalShell';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getPlatformIcon } from '@/lib/platform-icons';

export default async function RegisterPortalPage() {
  const settings = await getPlatformSettings();

  return (
    <PortalShell roleLabel="注册入口">
      <div className="mx-auto max-w-5xl">
        <section className="portal-panel p-10 text-center md:p-14">
          <div className="inline-flex items-center rounded-full border border-[#d9c29b]/55 bg-white/75 px-4 py-2 text-sm tracking-[0.2em] text-stone-700">
            {settings.register.portalBadge}
          </div>
          <h1 className="portal-title mt-8 text-4xl font-semibold text-stone-900 md:text-5xl">
            {settings.register.portalTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-stone-600">
            {settings.register.portalDescription}
          </p>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {settings.register.portals.map((portal) => {
            const Icon = getPlatformIcon(portal.icon);

            return (
              <article key={portal.href} className="portal-panel p-8">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-stone-900">{portal.title}</h2>
                <p className="mt-3 text-sm leading-7 text-stone-600">{portal.description}</p>
                <Link
                  href={portal.href}
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-6 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_12px_26px_rgba(127,23,18,0.22)]"
                >
                  {portal.buttonLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </section>
      </div>
    </PortalShell>
  );
}
