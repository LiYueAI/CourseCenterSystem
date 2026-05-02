'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Maximize2, Pause, Play, SkipBack, SkipForward, Star } from 'lucide-react';
import MediaPreview from '@/components/media/MediaPreview';
import {
  getModuleItemMiniAppMount,
  normalizeModuleItemMiniAppMount,
  type MiniAppMountOwnerKind,
  type ModuleItem,
  type ModuleItemMiniAppMount,
} from '@/lib/directus';

export type ClassroomItem = ModuleItem & {
  sourceType?: 'standard' | 'teacher_resource';
  sourceItemId?: number | null;
  teacherResourceId?: number | null;
};

export interface ClassroomPlayableModule {
  id: number;
  module_name: string;
}

type PlayState = 'idle' | 'playing' | 'paused' | 'completed';

type MountLookupResponse = {
  mounts?: ModuleItemMiniAppMount[];
};

function supportsMiniAppRuntime(item: ClassroomItem): boolean {
  return item.item_type === 'miniapp' || item.item_type === 'interactive';
}

function getClassroomItemOwner(item: ClassroomItem): {
  ownerKind: MiniAppMountOwnerKind;
  ownerId: number;
} | null {
  if (item.teacherResourceId) {
    return {
      ownerKind: 'teacher_resource',
      ownerId: item.teacherResourceId,
    };
  }

  if (item.sourceItemId) {
    return {
      ownerKind: 'standard_module_item',
      ownerId: item.sourceItemId,
    };
  }

  if (item.sourceType === 'standard' || !item.sourceType) {
    return {
      ownerKind: 'standard_module_item',
      ownerId: item.id,
    };
  }

  return null;
}

function getMountLookupKey(ownerKind: MiniAppMountOwnerKind, ownerId: number): string {
  return `${ownerKind}:${ownerId}`;
}

function isHtmlClassroomDocument(item: ClassroomItem | undefined): boolean {
  return item?.item_type === 'doc' && typeof item.file_url === 'string' && item.file_url.toLowerCase().includes('.html');
}

function getClassroomStageMode(item: ClassroomItem | undefined): 'presentation' | 'interactive' {
  if (!item) {
    return 'presentation';
  }

  if (item.item_type === 'miniapp' || item.item_type === 'interactive' || isHtmlClassroomDocument(item)) {
    return 'interactive';
  }

  return 'presentation';
}

export function ClassroomLoading({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,225,159,0.4),transparent_28%),linear-gradient(180deg,#fffdf6_0%,#fff6e1_50%,#eef7ff_100%)] text-[#5d4b2e]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(235,186,78,0.06)_1px,transparent_1px),linear-gradient(rgba(235,186,78,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute left-[-5%] top-[-4%] h-80 w-80 rounded-full bg-[#ffd97a]/35 blur-3xl" />
      <div className="absolute bottom-[-8%] right-[-4%] h-96 w-96 rounded-full bg-[#bfe1ff]/45 blur-3xl" />
      <div className="relative flex h-full items-center justify-center px-6">
        <div className="rounded-[32px] border border-[#f0dba6] bg-[rgba(255,253,247,0.9)] px-12 py-10 text-center shadow-[0_30px_80px_rgba(255,201,93,0.18)] backdrop-blur-xl">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full border-4 border-[#f0b83f] border-t-transparent animate-spin" />
          <p className="text-base tracking-[0.18em] text-[#7a5d2e]">{label}</p>
        </div>
      </div>
    </div>
  );
}

interface ClassroomExperienceProps {
  lessonId: number;
  lessonTitle: string;
  modules: ClassroomPlayableModule[];
  items: ClassroomItem[];
  onExit: () => void;
  exitLabel: string;
  completionTitle?: string;
  completionDescription?: string;
  completionExitLabel?: string;
}

export default function ClassroomExperience({
  lessonId,
  lessonTitle,
  modules,
  items,
  onExit,
  exitLabel,
  completionTitle = '课程已顺利完成',
  completionDescription,
  completionExitLabel,
}: ClassroomExperienceProps) {
  const [currentModuleIdx, setCurrentModuleIdx] = useState(0);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [runtimeItems, setRuntimeItems] = useState<ClassroomItem[]>(items);

  useEffect(() => {
    document.body.classList.add('classroom-mode');

    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.body.classList.remove('classroom-mode');
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    setCurrentModuleIdx(0);
    setCurrentItemIdx(0);
    setPlayState('idle');
  }, [items, modules]);

  useEffect(() => {
    setRuntimeItems(items);
  }, [items]);

  useEffect(() => {
    let cancelled = false;

    const pendingOwners = new Map<MiniAppMountOwnerKind, Set<number>>();
    for (const item of items) {
      if (!supportsMiniAppRuntime(item) || getModuleItemMiniAppMount(item)) {
        continue;
      }

      const owner = getClassroomItemOwner(item);
      if (!owner) {
        continue;
      }

      const ownerIds = pendingOwners.get(owner.ownerKind) || new Set<number>();
      ownerIds.add(owner.ownerId);
      pendingOwners.set(owner.ownerKind, ownerIds);
    }

    if (pendingOwners.size === 0) {
      return;
    }

    async function loadMiniAppMounts() {
      try {
        const responses = await Promise.all(
          Array.from(pendingOwners.entries()).map(async ([ownerKind, ownerIds]) => {
            const searchParams = new URLSearchParams({
              ownerKind,
              ownerIds: Array.from(ownerIds).join(','),
            });

            const response = await fetch(`/api/miniapps/mounts?${searchParams.toString()}`, {
              cache: 'no-store',
            });

            if (!response.ok) {
              throw new Error(`Failed to load mini app mounts for ${ownerKind}`);
            }

            return (await response.json()) as MountLookupResponse;
          })
        );

        if (cancelled) {
          return;
        }

        const mountMap = new Map<string, ModuleItemMiniAppMount>();
        for (const response of responses) {
          for (const mount of response.mounts || []) {
            const normalizedMount = normalizeModuleItemMiniAppMount(mount);
            const ownerKind = normalizedMount?.ownerKind || normalizedMount?.owner_kind;
            const ownerId = normalizedMount?.ownerId || normalizedMount?.owner_id;

            if (!normalizedMount || !ownerKind || !ownerId) {
              continue;
            }

            mountMap.set(getMountLookupKey(ownerKind, ownerId), normalizedMount);
          }
        }

        setRuntimeItems(
          items.map((item) => {
            if (getModuleItemMiniAppMount(item)) {
              return item;
            }

            const owner = getClassroomItemOwner(item);
            if (!owner) {
              return item;
            }

            const mount = mountMap.get(getMountLookupKey(owner.ownerKind, owner.ownerId));
            if (!mount) {
              return item;
            }

            return {
              ...item,
              miniappMount: mount,
              miniapp_mount: mount,
            };
          })
        );
      } catch (error) {
        console.error('Failed to hydrate classroom mini app mounts', error);
      }
    }

    void loadMiniAppMounts();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const safeModuleIdx = modules.length > 0 ? Math.min(currentModuleIdx, modules.length - 1) : 0;
  const currentModule = modules[safeModuleIdx] || null;
  const currentModuleItems = useMemo(
    () => runtimeItems.filter((item) => item.module_id === currentModule?.id),
    [currentModule, runtimeItems]
  );

  useEffect(() => {
    if (currentItemIdx >= currentModuleItems.length) {
      setCurrentItemIdx(0);
    }
  }, [currentItemIdx, currentModuleItems.length]);

  const currentItem = currentModuleItems[currentItemIdx];
  const currentGlobalIdx = currentItem ? runtimeItems.indexOf(currentItem) : -1;
  const safeCurrentIndex = currentGlobalIdx >= 0 ? currentGlobalIdx : 0;
  const progressPercent =
    runtimeItems.length > 0 ? ((safeCurrentIndex + 1) / runtimeItems.length) * 100 : 0;
  const currentStageMode = getClassroomStageMode(currentItem);
  const isInteractiveStage = currentStageMode === 'interactive';
  const stageLabel = isInteractiveStage ? '互动' : '讲解';
  const stageViewportHeight = isInteractiveStage
    ? 'calc(100vh - 8.55rem)'
    : 'calc(100vh - 8.1rem)';
  const toolbarButtonClass =
    'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#e8d5aa] bg-[rgba(255,252,245,0.96)] px-4 text-sm font-medium text-[#6f5427] shadow-[0_10px_24px_rgba(240,184,63,0.12)] transition-colors hover:border-[#d9b56f] hover:bg-[#fff8ea]';
  const toolbarIconButtonClass =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8d5aa] bg-[rgba(255,252,245,0.96)] text-[#7b5c28] shadow-[0_10px_24px_rgba(240,184,63,0.12)] transition-colors hover:border-[#d9b56f] hover:bg-[#fff8ea] disabled:opacity-35';

  function play() {
    setPlayState('playing');
  }

  function stop() {
    setPlayState('idle');
  }

  function pause() {
    setPlayState('paused');
  }

  function nextItem() {
    stop();
    if (currentGlobalIdx < runtimeItems.length - 1) {
      const nextIdx = currentGlobalIdx + 1;
      const nextItem = runtimeItems[nextIdx];
      if (!nextItem) {
        setPlayState('completed');
        return;
      }
      const nextModuleIdx = modules.findIndex((module) => module.id === nextItem.module_id);
      setCurrentModuleIdx(nextModuleIdx >= 0 ? nextModuleIdx : 0);
      setCurrentItemIdx(
        runtimeItems.filter((item) => item.module_id === nextItem.module_id).indexOf(nextItem)
      );
    } else {
      setPlayState('completed');
    }
  }

  function prevItem() {
    stop();
    if (currentGlobalIdx > 0) {
      const prevIdx = currentGlobalIdx - 1;
      const prevItem = runtimeItems[prevIdx];
      if (!prevItem) {
        return;
      }
      const prevModuleIdx = modules.findIndex((module) => module.id === prevItem.module_id);
      setCurrentModuleIdx(prevModuleIdx >= 0 ? prevModuleIdx : 0);
      setCurrentItemIdx(
        runtimeItems.filter((item) => item.module_id === prevItem.module_id).indexOf(prevItem)
      );
    }
  }

  function goToItem(itemIdx: number) {
    stop();
    if (itemIdx >= 0 && itemIdx < currentModuleItems.length) {
      setCurrentItemIdx(itemIdx);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  function endClass() {
    stop();
    onExit();
  }

  const classroomModeStyle = (
    <style jsx global>{`
      body.classroom-mode header {
        display: none;
      }

      body.classroom-mode main {
        max-width: none !important;
        padding: 0 !important;
      }
    `}</style>
  );

  if (playState === 'completed') {
    return (
      <>
        {classroomModeStyle}
        <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,225,159,0.42),transparent_26%),linear-gradient(180deg,#fffdf7_0%,#fff3d0_48%,#edf7ff_100%)] text-[#5d4b2e]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(235,186,78,0.06)_1px,transparent_1px),linear-gradient(rgba(235,186,78,0.06)_1px,transparent_1px)] [background-size:54px_54px]" />
          <div className="absolute left-[-6%] top-[-4%] h-80 w-80 rounded-full bg-[#ffe08c]/34 blur-3xl" />
          <div className="absolute bottom-[-8%] right-[-4%] h-96 w-96 rounded-full bg-[#b7e6ff]/42 blur-3xl" />

          <div className="relative flex h-full items-center justify-center px-6">
            <div className="w-full max-w-3xl rounded-[36px] border border-[#f0dba6] bg-[rgba(255,252,245,0.92)] px-8 py-12 text-center shadow-[0_36px_100px_rgba(255,201,93,0.2)] backdrop-blur-xl md:px-14">
              <div className="mx-auto inline-flex rounded-full border border-[#f3dfaf] bg-[#fff8e8] px-4 py-2 text-xs tracking-[0.24em] text-[#8a6a2b]">
                课堂完成
              </div>
              <h1 className="portal-title mt-8 text-4xl font-semibold text-[#5b4727] md:text-5xl">
                {completionTitle}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#7c6641]">
                {completionDescription ||
                  `${lessonTitle} 已按当前教案流程播放完成，课堂节奏与流程路径已全部走完。`}
              </p>
              <div className="mt-8 flex justify-center gap-4">
                {modules.map((_, index) => (
                  <Star key={index} className="h-8 w-8 text-[#f0b83f]" fill="#ffd76d" />
                ))}
              </div>
              <button
                onClick={endClass}
                className="mt-10 rounded-full bg-[linear-gradient(180deg,#ffcf62,#f2ad34)] px-8 py-3 text-base font-medium text-[#5f4515] shadow-[0_18px_36px_rgba(242,173,52,0.26)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                {completionExitLabel || exitLabel}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {classroomModeStyle}

      <div className="classroom-fullscreen fixed inset-0 z-[70] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,225,159,0.42),transparent_24%),linear-gradient(180deg,#fffdf6_0%,#fff8e7_38%,#f2fbff_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(240,184,63,0.05)_1px,transparent_1px),linear-gradient(rgba(240,184,63,0.05)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="pointer-events-none absolute left-[-8%] top-[-4%] h-80 w-80 rounded-full bg-[#ffe18d]/34 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-10%] right-[-5%] h-96 w-96 rounded-full bg-[#bfe3ff]/36 blur-3xl" />

        <div className="absolute inset-0">
          <div className="flex h-full flex-col">
            <div className="flex-1 px-3 pb-20 pt-3 md:px-5 md:pb-16 md:pt-4">
              <div
                className={`mx-auto flex h-full w-full justify-center ${
                  isInteractiveStage ? 'max-w-[1760px] items-stretch' : 'max-w-[1680px] items-end'
                }`}
              >
                <div
                  className={`relative w-full ${isInteractiveStage ? 'h-full' : ''}`}
                  style={
                    isInteractiveStage
                      ? { height: stageViewportHeight }
                      : {
                          width: 'min(96vw, 1600px, calc((100vh - 8.1rem) * 16 / 9))',
                          maxHeight: stageViewportHeight,
                        }
                  }
                >
                  <div className="relative overflow-hidden rounded-[34px] border border-[#f1dfb4] bg-[linear-gradient(180deg,rgba(255,252,246,0.96),rgba(248,251,255,0.94))] p-3 shadow-[0_28px_70px_rgba(240,184,63,0.14)] backdrop-blur-xl md:p-4">
                    <div
                      className={`relative overflow-hidden rounded-[28px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_14px_34px_rgba(123,181,255,0.12)] ${
                        isInteractiveStage
                          ? 'h-full min-h-[520px] border-[#cfe6ff] bg-[linear-gradient(180deg,#ffffff,#f2faff)]'
                          : 'aspect-video border-[#f6dfab] bg-[radial-gradient(circle_at_top,rgba(255,244,207,0.7),rgba(255,255,255,0.95)_34%,rgba(242,249,255,0.95)_100%)]'
                      }`}
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,214,114,0.26),transparent_68%)]" />
                      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#fff8ea]" />

                      {currentItem ? (
                        <div
                          className={`absolute inset-0 z-10 flex items-center justify-center ${
                            isInteractiveStage ? 'p-2 md:p-3' : 'p-3 md:p-5'
                          }`}
                        >
                          <MediaPreview
                            item={currentItem}
                            lessonId={lessonId}
                            playState={playState}
                            onItemEnd={nextItem}
                            immersive
                          />
                        </div>
                      ) : (
                        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
                          <div className="rounded-[26px] border border-[#f1dfb4] bg-[rgba(255,252,246,0.92)] px-8 py-10 text-center text-[#7c6540] shadow-[0_16px_40px_rgba(240,184,63,0.12)]">
                            <p className="text-xl">该流程暂无内容</p>
                            <button
                              onClick={nextItem}
                              className="mt-6 rounded-full border border-[#f3dfaf] bg-[#fff8e8] px-6 py-2.5 text-sm text-[#7a5e2d] transition-colors hover:border-[#f0b83f]"
                            >
                              跳过此流程
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(255,248,226,0.52)_28%,rgba(244,250,255,0.96))]" />

            <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-2.5 md:px-6 md:pb-3.5">
              <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                <div className="order-2 md:order-1 md:min-w-0 md:flex-1">
                  <div className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-[#f2e1b7] bg-[rgba(255,252,245,0.92)] px-4 text-sm text-[#6b5226] shadow-[0_12px_28px_rgba(240,184,63,0.12)] backdrop-blur-xl">
                    <span className="rounded-full bg-[#fff4d5] px-2 py-1 text-xs font-medium text-[#9b7431]">
                      {stageLabel}
                    </span>
                    <span className="truncate">{lessonTitle}</span>
                    <span className="text-[#c7a25f]">·</span>
                    <span className="truncate text-[#7b6540]">
                      {currentModule?.module_name || '课堂进行中'}
                    </span>
                  </div>
                </div>

                <div className="order-1 flex justify-center md:order-2 md:flex-1">
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-[#f2e1b7] bg-[rgba(255,252,245,0.92)] px-2.5 py-2 shadow-[0_14px_34px_rgba(240,184,63,0.14)] backdrop-blur-xl md:px-3">
                    <button
                      onClick={endClass}
                      className={toolbarButtonClass}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      返回
                    </button>

                    <button
                      onClick={toggleFullscreen}
                      className={`${toolbarButtonClass} ${
                        isFullscreen
                          ? 'border-[#dfbf7c] bg-[#fff0c3] text-[#8b6621]'
                          : ''
                      }`}
                    >
                      <Maximize2 className="h-4 w-4" />
                      {isFullscreen ? '退出全屏' : '全屏'}
                    </button>

                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={prevItem}
                        disabled={safeCurrentIndex === 0}
                        className={toolbarIconButtonClass}
                      >
                        <SkipBack className="h-5 w-5" />
                      </button>

                      {playState === 'playing' ? (
                        <button
                          onClick={pause}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dfbf7c] bg-[#fff0c3] text-[#7f5e18] shadow-[0_10px_24px_rgba(240,184,63,0.14)] transition-colors hover:bg-[#ffe498]"
                        >
                          <Pause className="h-5 w-5" />
                        </button>
                      ) : (
                        <button
                          onClick={play}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#efc15d] bg-[linear-gradient(180deg,#ffcf62,#f2ad34)] text-[#5f4515] shadow-[0_10px_24px_rgba(242,173,52,0.24)] transition-transform duration-300 hover:-translate-y-0.5"
                        >
                          <Play className="ml-0.5 h-5 w-5" />
                        </button>
                      )}

                      <button
                        onClick={nextItem}
                        disabled={safeCurrentIndex === runtimeItems.length - 1}
                        className={toolbarIconButtonClass}
                      >
                        <SkipForward className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="order-3 flex flex-wrap items-center justify-between gap-2 text-[#7f6640] md:min-w-[320px] md:justify-end">
                  <span className="inline-flex h-11 items-center rounded-full border border-[#f2e1b7] bg-[rgba(255,252,245,0.92)] px-4 text-sm shadow-[0_12px_28px_rgba(240,184,63,0.12)] backdrop-blur-xl">
                    {Math.min(safeCurrentIndex + 1, Math.max(runtimeItems.length, 1))} / {runtimeItems.length}
                  </span>
                  <span className="inline-flex h-11 items-center rounded-full border border-[#f2e1b7] bg-[rgba(255,252,245,0.92)] px-4 text-sm shadow-[0_12px_28px_rgba(240,184,63,0.12)] backdrop-blur-xl">
                    进度 {Math.round(progressPercent)}%
                  </span>
                  <div className="flex h-11 items-center gap-2 rounded-full border border-[#f2e1b7] bg-[rgba(255,252,245,0.92)] px-3 shadow-[0_12px_28px_rgba(240,184,63,0.12)] backdrop-blur-xl">
                    {currentModuleItems.map((item, index) => (
                      <button
                        key={`${item.module_id}-${item.id}-${index}`}
                        onClick={() => goToItem(index)}
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${
                          index === currentItemIdx ? 'bg-[#f0b83f]' : 'bg-[#d8e7f4]'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
