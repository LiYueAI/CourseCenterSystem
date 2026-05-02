import { ExternalLink, FolderOpen } from 'lucide-react';
import { query } from '@/lib/db';
import { resolveAssetUrl } from '@/lib/media-url';
import ManageResourceStatusButtons from './ManageResourceStatusButtons';

type ResourceRow = {
  id: number;
  title: string;
  type: string;
  file_url: string;
  status: string;
  publish_count: number;
};

type ModuleOption = {
  moduleId: number;
  label: string;
};

async function getResources(): Promise<ResourceRow[]> {
  return query<ResourceRow>(
    `
      select
        r.id,
        r.title,
        r.type,
        r.file_url,
        r.status,
        (
          select count(*)::int
          from module_items mi
          where mi.file_url = r.file_url
        ) as publish_count
      from resources r
      where r.status = 'approved'
      order by r.id desc
    `
  );
}

export default async function ResourceLibraryPanel({
  moduleOptions,
}: {
  moduleOptions: ModuleOption[];
}) {
  const resources = await getResources();

  if (resources.length === 0) {
    return null;
  }

  return (
    <section className="portal-panel overflow-hidden">
      <div className="border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] px-6 py-4">
        <div className="text-sm tracking-[0.22em] text-stone-600">资源库</div>
      </div>

      <div className="divide-y divide-[#eadfce]">
        {resources.map((resource) => (
          <div key={resource.id} className="px-6 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div className="font-medium text-stone-900">{resource.title}</div>
                  <div className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-2.5 py-0.5 text-xs tracking-[0.14em] text-stone-500">
                    {resource.type}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <a
                    href={resolveAssetUrl(resource.file_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-[#b83226]/30"
                  >
                    查看
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <ManageResourceStatusButtons
                resourceId={resource.id}
                status={resource.status}
                publishCount={resource.publish_count}
                moduleOptions={moduleOptions}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
