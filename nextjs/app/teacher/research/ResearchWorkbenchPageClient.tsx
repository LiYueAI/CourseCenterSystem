'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  Loader2,
  Microscope,
  Sparkles,
} from 'lucide-react';

import { getLessons, getUnits, type Lesson, type Unit } from '@/lib/directus';

type TeacherCapabilityScopeLevel = 'platform' | 'school' | 'school_classroom';
type ResearchPlanMode = 'assembled' | 'legacy' | 'empty';
type ResearchFocusLevel = 'warning' | 'info' | 'success';

interface TeacherAccessCapability {
  assignmentId: number;
  capabilityKey: string;
  capabilityName: string;
  scopeLevel: TeacherCapabilityScopeLevel;
  schoolName: string | null;
  className: string | null;
  classCode: string | null;
}

interface CurrentUser {
  id: string;
  role: string;
  access?: {
    teacherCapabilities?: TeacherAccessCapability[];
  };
}

interface ResearchTargetTeacher {
  userId: string;
  name: string;
  schoolName: string | null;
  gradeLevel: string | null;
  className: string | null;
  isSelf: boolean;
}

interface TeacherCurrentClassroomSummary {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  studentCount: number;
}

interface TeacherResearchSummary {
  lessonId: number | null;
  currentStudentCount: number;
  moduleCount: number;
  modulesWithAssembledContent: number;
  modulesWithAssignments: number;
  assembledItemCount: number;
  standardAssembledCount: number;
  teacherAssembledCount: number;
  teacherResourceCount: number;
  teacherAssignmentCount: number;
  requiredAssignmentCount: number;
  pendingReviewCount: number;
  approvedSubmissionCount: number;
  rejectedSubmissionCount: number;
  missingSubmissionCount: number;
  overdueMissingSubmissionCount: number;
  legacySelectionCount: number;
  emptyModuleCount: number;
  modulesNeedingAttention: number;
  planMode: ResearchPlanMode;
  usesLegacyFallback: boolean;
}

interface ResearchFocusItem {
  key: string;
  title: string;
  description: string;
  level: ResearchFocusLevel;
  value: string;
}

interface TeacherResearchModuleBoard {
  moduleId: number;
  moduleIndex: number;
  moduleName: string;
  moduleType: string;
  standardResourceCount: number;
  standardAssignmentCount: number;
  assembledCount: number;
  standardAssembledCount: number;
  teacherAssembledCount: number;
  teacherResourceCount: number;
  teacherAssignmentCount: number;
  requiredAssignmentCount: number;
  pendingReviewCount: number;
  approvedSubmissionCount: number;
  rejectedSubmissionCount: number;
  missingSubmissionCount: number;
  overdueMissingSubmissionCount: number;
  needsAttention: boolean;
  attentionReasons: string[];
}

function buildCapabilityScopeLabel(capability: TeacherAccessCapability): string {
  if (capability.scopeLevel === 'platform') {
    return '全平台';
  }

  if (capability.scopeLevel === 'school') {
    return capability.schoolName ? `学校：${capability.schoolName}` : '当前学校';
  }

  const classLabel = [capability.schoolName, capability.className]
    .filter(Boolean)
    .join(' / ');

  if (classLabel) {
    return classLabel;
  }

  return capability.classCode ? `班级编码：${capability.classCode}` : '当前班级';
}

function getPlanModeLabel(planMode: ResearchPlanMode): string {
  if (planMode === 'assembled') {
    return '装配教案';
  }

  if (planMode === 'legacy') {
    return '旧兼容层';
  }

  return '暂无内容';
}

function getFocusTone(level: ResearchFocusLevel): string {
  if (level === 'warning') {
    return 'border-amber-200/80 bg-amber-50/90 text-amber-900';
  }

  if (level === 'success') {
    return 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900';
  }

  return 'border-[#d9c29b]/45 bg-white/86 text-stone-900';
}

export default function ResearchWorkbenchPageClient() {
  const searchParams = useSearchParams();
  const requestedTeacherUserId = useMemo(
    () => (searchParams.get('teacherUserId') || '').trim() || null,
    [searchParams]
  );
  const requestedLessonId = useMemo(() => {
    const raw = searchParams.get('lessonId');
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState<string | null>(null);
  const [researchTargets, setResearchTargets] = useState<ResearchTargetTeacher[]>([]);
  const [classroom, setClassroom] = useState<TeacherCurrentClassroomSummary | null>(null);
  const [summary, setSummary] = useState<TeacherResearchSummary | null>(null);
  const [focusItems, setFocusItems] = useState<ResearchFocusItem[]>([]);
  const [modules, setModules] = useState<TeacherResearchModuleBoard[]>([]);
  const [loadingWorkbench, setLoadingWorkbench] = useState(true);
  const [switchingUnit, setSwitchingUnit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const researchCapabilities = useMemo(
    () =>
      (currentUser?.access?.teacherCapabilities || []).filter(
        (item) => item.capabilityKey === 'teaching-researcher'
      ),
    [currentUser]
  );
  const hasResearchAccess =
    currentUser?.role === 'admin' || researchCapabilities.length > 0;
  const selectedResearchTarget =
    researchTargets.find((target) => target.userId === selectedTeacherUserId) || null;
  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedLessonId) || null;

  useEffect(() => {
    setSelectedTeacherUserId(requestedTeacherUserId);
  }, [requestedTeacherUserId]);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      setLoadingUser(true);
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { user?: CurrentUser };
        if (active) {
          setCurrentUser(payload.user || null);
        }
      } catch (loadError) {
        console.error('Failed to load research workbench user', loadError);
      } finally {
        if (active) {
          setLoadingUser(false);
        }
      }
    }

    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasResearchAccess) {
      return;
    }

    let cancelled = false;

    async function loadSelection() {
      try {
        const unitData = await getUnits();
        if (cancelled) {
          return;
        }

        setUnits(unitData);
        if (unitData.length === 0) {
          setLessons([]);
          setSelectedUnitId(null);
          setSelectedLessonId(null);
          return;
        }

        let resolvedUnitId = unitData[0].id;
        let resolvedLessons = await getLessons(resolvedUnitId);
        let resolvedLessonId = resolvedLessons[0]?.id || null;

        if (requestedLessonId) {
          for (const unit of unitData) {
            const lessonData =
              unit.id === resolvedUnitId ? resolvedLessons : await getLessons(unit.id);
            const matchedLesson = lessonData.find(
              (lesson) => lesson.id === requestedLessonId
            );

            if (matchedLesson) {
              resolvedUnitId = unit.id;
              resolvedLessons = lessonData;
              resolvedLessonId = matchedLesson.id;
              break;
            }
          }
        }

        if (cancelled) {
          return;
        }

        setSelectedUnitId(resolvedUnitId);
        setLessons(resolvedLessons);
        setSelectedLessonId(resolvedLessonId);
      } catch (loadError) {
        console.error('Failed to load research workbench selection', loadError);
        if (!cancelled) {
          setError('教研工作台课时加载失败，请稍后重试。');
        }
      }
    }

    void loadSelection();
    return () => {
      cancelled = true;
    };
  }, [hasResearchAccess, requestedLessonId]);

  useEffect(() => {
    if (!hasResearchAccess || !selectedLessonId) {
      return;
    }

    let active = true;

    async function loadWorkbench() {
      setLoadingWorkbench(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('lessonId', String(selectedLessonId));
        if (selectedTeacherUserId) {
          params.set('teacherUserId', selectedTeacherUserId);
        }

        const response = await fetch(`/api/teacher/research?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          const payload = await response
            .json()
            .catch(() => ({ error: '教研工作台读取失败。' }));
          throw new Error(payload.error || '教研工作台读取失败。');
        }

        const payload = (await response.json()) as {
          classroom?: TeacherCurrentClassroomSummary | null;
          researchTargets?: ResearchTargetTeacher[];
          activeTargetTeacherUserId?: string | null;
          summary?: TeacherResearchSummary | null;
          focusItems?: ResearchFocusItem[];
          modules?: TeacherResearchModuleBoard[];
        };

        if (!active) {
          return;
        }

        setClassroom(payload.classroom || null);
        setResearchTargets(payload.researchTargets || []);
        setSelectedTeacherUserId(payload.activeTargetTeacherUserId || null);
        setSummary(payload.summary || null);
        setFocusItems(payload.focusItems || []);
        setModules(payload.modules || []);

        if (typeof window !== 'undefined') {
          const nextParams = new URLSearchParams();
          nextParams.set('lessonId', String(selectedLessonId));
          if (payload.activeTargetTeacherUserId) {
            nextParams.set('teacherUserId', payload.activeTargetTeacherUserId);
          }
          const nextQuery = nextParams.toString();
          window.history.replaceState(
            {},
            '',
            `/teacher/research${nextQuery ? `?${nextQuery}` : ''}`
          );
        }
      } catch (loadError) {
        console.error('Failed to load research workbench', loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : '教研工作台读取失败，请稍后重试。'
          );
          setSummary(null);
          setFocusItems([]);
          setModules([]);
        }
      } finally {
        if (active) {
          setLoadingWorkbench(false);
        }
      }
    }

    void loadWorkbench();
    return () => {
      active = false;
    };
  }, [hasResearchAccess, selectedLessonId, selectedTeacherUserId]);

  async function handleUnitChange(unitId: number) {
    setSelectedUnitId(unitId);
    setSwitchingUnit(true);
    setError(null);

    try {
      const lessonData = await getLessons(unitId);
      setLessons(lessonData);
      setSelectedLessonId(lessonData[0]?.id || null);
    } catch (loadError) {
      console.error('Failed to switch research workbench unit', loadError);
      setError('课时切换失败，请重新选择。');
      setLessons([]);
      setSelectedLessonId(null);
    } finally {
      setSwitchingUnit(false);
    }
  }

  if (loadingUser) {
    return (
      <div className="portal-panel flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
          <p className="mt-4 text-stone-600">正在载入教研工作台...</p>
        </div>
      </div>
    );
  }

  if (!hasResearchAccess) {
    return (
      <div className="portal-panel mx-auto max-w-3xl p-10">
        <Link
          href="/teacher"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-[#8f2017]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回老师首页
        </Link>
        <h1 className="mt-6 text-3xl font-semibold text-stone-900">教研工作台</h1>
        <div className="mt-6 rounded-[28px] border border-[#d9c29b]/45 bg-white/82 px-6 py-6 text-sm leading-7 text-stone-600">
          当前账号没有“教研员”职能，也不是管理员，不能进入教研工作台。
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.14)] md:p-8">
        <Link
          href="/teacher"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-[#8f2017]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回老师首页
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.18em] text-stone-500">兼职工作台 · 教研员</div>
            <h1 className="mt-3 text-3xl font-semibold text-stone-900">教研工作台</h1>
          </div>

          <div className="flex max-w-[360px] flex-wrap gap-2">
            {researchCapabilities.map((capability) => (
              <div
                key={capability.assignmentId}
                className="rounded-full border border-[#d9c29b]/45 bg-[#fffaf0] px-3 py-1.5 text-xs text-stone-700"
              >
                {buildCapabilityScopeLabel(capability)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-[#d9c29b]/45 bg-white/82 p-5 shadow-[0_16px_30px_rgba(97,73,33,0.08)]">
          <div className="text-xs tracking-[0.16em] text-stone-500">选择老师</div>
          <select
            value={selectedTeacherUserId || ''}
            onChange={(event) =>
              setSelectedTeacherUserId(event.target.value ? event.target.value : null)
            }
            className="mt-3 w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {researchTargets.map((target) => (
              <option key={target.userId} value={target.userId}>
                {target.name}
                {target.isSelf ? '（我）' : ''}
                {target.schoolName || target.className
                  ? ` · ${[target.schoolName, target.gradeLevel, target.className]
                      .filter(Boolean)
                      .join('/')}`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-[28px] border border-[#d9c29b]/45 bg-white/82 p-5 shadow-[0_16px_30px_rgba(97,73,33,0.08)]">
          <div className="text-xs tracking-[0.16em] text-stone-500">选择单元</div>
          <select
            value={selectedUnitId || ''}
            onChange={(event) => handleUnitChange(Number(event.target.value))}
            className="mt-3 w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                第 {unit.unit_index} 单元 · {unit.title}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-[28px] border border-[#d9c29b]/45 bg-white/82 p-5 shadow-[0_16px_30px_rgba(97,73,33,0.08)]">
          <div className="text-xs tracking-[0.16em] text-stone-500">选择课时</div>
          <select
            value={selectedLessonId || ''}
            onChange={(event) => setSelectedLessonId(Number(event.target.value))}
            className="mt-3 w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                第 {lesson.lesson_index} 课 · {lesson.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm leading-7 text-red-600">
          {error}
        </div>
      ) : null}

      {loadingWorkbench || switchingUnit ? (
        <div className="portal-panel flex min-h-[320px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#8f2017]" />
            <p className="mt-4 text-sm text-stone-600">
              {switchingUnit ? '正在切换课时...' : '正在生成教研任务池...'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.12)] md:p-8">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                {selectedResearchTarget?.name || '未选择老师'}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                待评分 {summary?.pendingReviewCount || 0}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                待关注 {summary?.modulesNeedingAttention || 0}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                未交 {summary?.missingSubmissionCount || 0}
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.12)] md:p-8">
            <h2 className="text-2xl font-semibold text-stone-900">模块列表</h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {modules.map((module) => (
                <div
                  key={module.moduleId}
                  className={`rounded-[28px] border p-5 shadow-[0_16px_30px_rgba(97,73,33,0.08)] ${
                    module.needsAttention
                      ? 'border-amber-200/80 bg-amber-50/90'
                      : 'border-[#d9c29b]/45 bg-white/86'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs tracking-[0.16em] text-stone-500">
                        模块 {module.moduleIndex}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-stone-900">
                        {module.moduleName}
                      </div>
                      <div className="mt-2 text-sm text-stone-500">{module.moduleType}</div>
                    </div>

                    <div className="rounded-full border border-[#d9c29b]/45 bg-[#fffaf0] px-3 py-1.5 text-xs text-stone-700">
                      {module.needsAttention ? '需关注' : '稳定'}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-stone-700">
                    <div className="rounded-[20px] border border-[#d9c29b]/40 bg-white/86 px-4 py-3">
                      <div className="text-xs tracking-[0.14em] text-stone-500">课堂装配</div>
                      <div className="mt-2 font-semibold text-stone-900">{module.assembledCount}</div>
                    </div>
                    <div className="rounded-[20px] border border-[#d9c29b]/40 bg-white/86 px-4 py-3">
                      <div className="text-xs tracking-[0.14em] text-stone-500">老师资源</div>
                      <div className="mt-2 font-semibold text-stone-900">{module.teacherResourceCount}</div>
                    </div>
                    <div className="rounded-[20px] border border-[#d9c29b]/40 bg-white/86 px-4 py-3">
                      <div className="text-xs tracking-[0.14em] text-stone-500">作业要求</div>
                      <div className="mt-2 font-semibold text-stone-900">{module.requiredAssignmentCount}</div>
                    </div>
                    <div className="rounded-[20px] border border-[#d9c29b]/40 bg-white/86 px-4 py-3">
                      <div className="text-xs tracking-[0.14em] text-stone-500">待评分</div>
                      <div className="mt-2 font-semibold text-stone-900">{module.pendingReviewCount}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2 text-sm text-stone-600">
                    <div className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
                      <span>标准资源 / 活动</span>
                      <span className="font-semibold text-stone-900">
                        {module.standardAssembledCount}/{module.standardResourceCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
                      <span>老师装配内容</span>
                      <span className="font-semibold text-stone-900">
                        {module.teacherAssembledCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
                      <span>估算未交</span>
                      <span className="font-semibold text-stone-900">
                        {module.missingSubmissionCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
                      <span>逾期未交</span>
                      <span className="font-semibold text-stone-900">
                        {module.overdueMissingSubmissionCount}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[22px] border border-[#d9c29b]/40 bg-white/78 px-4 py-4">
                    <div className="text-sm font-semibold text-stone-900">建议</div>
                    <div className="mt-3 grid gap-2">
                      {module.attentionReasons.map((reason, index) => (
                        <div
                          key={`${module.moduleId}-${index}`}
                          className="rounded-2xl bg-[#fffaf0] px-3 py-2 text-sm leading-6 text-stone-600"
                        >
                          {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!modules.length ? (
              <div className="mt-6 rounded-[28px] border border-[#d9c29b]/45 bg-white/82 px-5 py-4 text-sm leading-7 text-stone-600">
                当前课时还没有生成模块任务池，请先确认课时内容或稍后重试。
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
