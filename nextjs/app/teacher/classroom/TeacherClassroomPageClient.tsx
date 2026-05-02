'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ClassroomExperience, {
  ClassroomItem,
  ClassroomLoading,
  type ClassroomPlayableModule,
} from '@/components/classroom/ClassroomExperience';
import {
  getLesson,
  getModules,
  normalizeModuleItemMiniAppMount,
  type Lesson,
  type LessonModule,
  type ModuleItem,
} from '@/lib/directus';
import { resolveAssetUrl } from '@/lib/media-url';

export const dynamic = 'force-dynamic';

interface CurrentUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

interface LessonCustomizationResponse {
  customization: {
    modules_config?: string | null;
  } | null;
  planItems?: PersistedPlanItem[];
  assembledItems?: PersistedPlanItem[];
}

interface PersistedPlanItem {
  id: number;
  lessonId?: number;
  lesson_id?: number;
  moduleId?: number;
  module_id?: number;
  sourceType?: 'standard' | 'teacher_resource';
  source_type?: 'standard' | 'teacher_resource';
  sourceItemId?: number | null;
  sourceId?: number | null;
  standard_item_id?: number | null;
  teacherResourceId?: number | null;
  teacher_resource_id?: number | null;
  title: string;
  itemType?: ModuleItem['item_type'];
  item_type?: ModuleItem['item_type'];
  fileUrl?: string | null;
  file_url?: string | null;
  duration?: number | null;
  sortOrder?: number;
  sort_order?: number;
  miniappMount?: ModuleItem['miniappMount'] | null;
  miniapp_mount?: ModuleItem['miniapp_mount'] | null;
}

function ClassroomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lessonId = parseInt(searchParams.get('lessonId') || '0', 10);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [allItems, setAllItems] = useState<ClassroomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
        }
      } catch (error) {
        console.error('Failed to load user', error);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    async function load() {
      if (!lessonId || !currentUser) {
        return;
      }

      try {
        const [lessonData, modulesData, customizationResponse] = await Promise.all([
          getLesson(lessonId),
          getModules(lessonId),
          fetch(`/api/teacher/customizations?lessonId=${lessonId}`, {
            cache: 'no-store',
          }).then(async (response) => {
            if (!response.ok) {
              throw new Error('Failed to load customization');
            }
            return response.json() as Promise<LessonCustomizationResponse>;
          }),
        ]);

        setLesson(lessonData);
        setModules(modulesData);

        const standardItemMap = new Map<number, ModuleItem>();
        for (const module of modulesData) {
          for (const item of module.items || []) {
            standardItemMap.set(item.id, item);
          }
        }

        const persistedPlanItems =
          customizationResponse.assembledItems || customizationResponse.planItems || [];

        if (Array.isArray(persistedPlanItems) && persistedPlanItems.length > 0) {
          setAllItems(
            persistedPlanItems
              .slice()
              .sort((a, b) => (a.sort_order || a.sortOrder || 0) - (b.sort_order || b.sortOrder || 0))
              .map((item) => {
                const standardItemId =
                  item.standard_item_id || item.sourceItemId || item.sourceId || null;
                const standardItem =
                  (item.source_type || item.sourceType) === 'standard' && standardItemId
                    ? standardItemMap.get(Number(standardItemId))
                    : undefined;
                const miniAppMount = normalizeModuleItemMiniAppMount(
                  item.miniappMount ||
                    item.miniapp_mount ||
                    standardItem?.miniappMount ||
                    standardItem?.miniapp_mount
                );

                return {
                  ...(standardItem || {}),
                  id: item.id,
                  module_id: item.module_id || item.moduleId || standardItem?.module_id || 0,
                  sort_order: item.sort_order || item.sortOrder || standardItem?.sort_order || 0,
                  item_type: item.item_type || item.itemType || standardItem?.item_type || 'interactive',
                  title: item.title || standardItem?.title || '未命名内容',
                  file_url: resolveAssetUrl(item.file_url || item.fileUrl || standardItem?.file_url || ''),
                  duration: item.duration || standardItem?.duration || 0,
                  sourceType: item.source_type || item.sourceType,
                  sourceItemId: standardItemId,
                  teacherResourceId: item.teacher_resource_id || item.teacherResourceId || null,
                  miniapp_mount: miniAppMount,
                  miniappMount: miniAppMount,
                } satisfies ClassroomItem;
              })
          );
          return;
        }

        let modulesConfig: Record<string, number[]> = {};
        if (customizationResponse.customization?.modules_config) {
          try {
            modulesConfig = JSON.parse(customizationResponse.customization.modules_config);
          } catch (error) {
            console.error('Failed to parse modules_config', error);
          }
        }

        const fallbackItems: ClassroomItem[] = [];
        for (const module of modulesData) {
          const selectedIds = modulesConfig[module.id] || [];
          const moduleItems = module.items || [];
          const sortedItems =
            selectedIds.length > 0
              ? (selectedIds
                  .map((id) => moduleItems.find((item) => item.id === id))
                  .filter(Boolean) as ModuleItem[])
              : moduleItems;

          for (const item of sortedItems) {
            fallbackItems.push({ ...item, module_id: module.id });
          }
        }

        setAllItems(fallbackItems);
      } catch (error) {
        console.error('Failed to load classroom', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [currentUser, lessonId]);

  if (loading) {
    return <ClassroomLoading label="加载课堂内容..." />;
  }

  const playableModules: ClassroomPlayableModule[] = modules.map((module) => ({
    id: module.id,
    module_name: module.module_name || module.module_type || `流程 ${module.module_index}`,
  }));

  return (
    <ClassroomExperience
      lessonId={lessonId}
      lessonTitle={lesson?.title || '课堂播放'}
      modules={playableModules}
      items={allItems}
      onExit={() => router.push('/teacher')}
      exitLabel="返回教师端"
    />
  );
}

export default function ClassroomPage() {
  return (
    <Suspense fallback={<ClassroomLoading label="加载课堂..." />}>
      <ClassroomContent />
    </Suspense>
  );
}
