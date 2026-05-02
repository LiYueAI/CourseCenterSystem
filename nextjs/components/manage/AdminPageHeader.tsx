import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type AdminPageHeaderProps = {
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export default function AdminPageHeader({
  title,
  backHref,
  backLabel,
  actions,
  children,
}: AdminPageHeaderProps) {
  return (
    <section className="portal-panel p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {backHref && backLabel ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          ) : null}
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 md:text-3xl">{title}</h1>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>

      {children ? <div className="mt-4 border-t border-[#eadfce] pt-4">{children}</div> : null}
    </section>
  );
}
