'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Loader2,
  Users,
  XCircle,
} from 'lucide-react';
import { getLessons, getUnits, type Lesson, type Unit } from '@/lib/directus';

type TeacherCapabilityScopeLevel = 'platform' | 'school' | 'school_classroom';

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
  name: string;
  access?: {
    teacherCapabilities?: TeacherAccessCapability[];
  };
}

interface ReviewTargetTeacher {
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

interface TeacherTaskboardSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  trackedAssignments: number;
  requiredAssignments: number;
  missingAssignments: number;
  missingSubmissions: number;
  overdueAssignments: number;
  overdueMissingSubmissions: number;
}

interface TeacherTaskboard {
  lessonId: number | null;
  currentStudentCount: number;
  pendingReviewCount: number;
  missingSubmissions: number;
  overdueMissingSubmissions: number;
  approvedSubmissions: number;
  rejectedSubmissions: number;
  gradedSubmissions?: number;
  totalSubmissions?: number;
  summary: TeacherTaskboardSummary;
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

export default function ReviewerWorkbenchPageClient() {
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
  const [reviewTargets, setReviewTargets] = useState<ReviewTargetTeacher[]>([]);
  const [classroom, setClassroom] = useState<TeacherCurrentClassroomSummary | null>(null);
  const [taskboard, setTaskboard] = useState<TeacherTaskboard | null>(null);
  const [loadingWorkbench, setLoadingWorkbench] = useState(true);
  const [switchingUnit, setSwitchingUnit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewerCapabilities = useMemo(
    () =>
      (currentUser?.access?.teacherCapabilities || []).filter(
        (item) => item.capabilityKey === 'reviewer'
      ),
    [currentUser]
  );
  const hasReviewerAccess =
    currentUser?.role === 'admin' || reviewerCapabilities.length > 0;
  const selectedReviewTarget =
    reviewTargets.find((target) => target.userId === selectedTeacherUserId) || null;
  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedLessonId) || null;
  const rosterHref = selectedTeacherUserId
    ? `/teacher/roster?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
    : '/teacher/roster';
  const submissionsHref = (() => {
    const params = new URLSearchParams();
    if (selectedLessonId) {
      params.set('lessonId', String(selectedLessonId));
    }
    if (selectedTeacherUserId) {
      params.set('teacherUserId', selectedTeacherUserId);
    }
    const query = params.toString();
    return `/teacher/submissions${query ? `?${query}` : ''}`;
  })();

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
        console.error('Failed to load reviewer workbench user', loadError);
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
    if (!hasReviewerAccess) {
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
        console.error('Failed to load reviewer workbench selection', loadError);
        if (!cancelled) {
          setError('评审工作台课时加载失败，请稍后重试。');
        }
      }
    }

    void loadSelection();
    return () => {
      cancelled = true;
    };
  }, [hasReviewerAccess, requestedLessonId]);

  useEffect(() => {
    if (!hasReviewerAccess) {
      return;
    }

    let active = true;

    async function loadWorkbench() {
      setLoadingWorkbench(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (selectedLessonId) {
          params.set('lessonId', String(selectedLessonId));
        }
        if (selectedTeacherUserId) {
          params.set('teacherUserId', selectedTeacherUserId);
        }

        const response = await fetch(
          `/api/teacher/classroom${params.toString() ? `?${params.toString()}` : ''}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          const payload = await response
            .json()
            .catch(() => ({ error: '评审工作台读取失败。' }));
          throw new Error(payload.error || '评审工作台读取失败。');
        }

        const payload = (await response.json()) as {
          classroom?: TeacherCurrentClassroomSummary | null;
          taskboard?: TeacherTaskboard | null;
          reviewTargets?: ReviewTargetTeacher[];
          activeTargetTeacherUserId?: string | null;
        };

        if (!active) {
          return;
        }

        setClassroom(payload.classroom || null);
        setTaskboard(payload.taskboard || null);
        setReviewTargets(payload.reviewTargets || []);
        setSelectedTeacherUserId(payload.activeTargetTeacherUserId || null);

        if (typeof window !== 'undefined') {
          const nextParams = new URLSearchParams();
          if (selectedLessonId) {
            nextParams.set('lessonId', String(selectedLessonId));
          }
          if (payload.activeTargetTeacherUserId) {
            nextParams.set('teacherUserId', payload.activeTargetTeacherUserId);
          }
          const nextQuery = nextParams.toString();
          window.history.replaceState(
            {},
            '',
            `/teacher/reviewer${nextQuery ? `?${nextQuery}` : ''}`
          );
        }
      } catch (loadError) {
        console.error('Failed to load reviewer workbench', loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : '评审工作台读取失败，请稍后重试。'
          );
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
  }, [hasReviewerAccess, selectedLessonId, selectedTeacherUserId]);

  async function handleUnitChange(unitId: number) {
    setSelectedUnitId(unitId);
    setSwitchingUnit(true);
    setError(null);

    try {
      const lessonData = await getLessons(unitId);
      setLessons(lessonData);
      setSelectedLessonId(lessonData[0]?.id || null);
    } catch (loadError) {
      console.error('Failed to switch reviewer workbench unit', loadError);
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
          <p className="mt-4 text-stone-600">正在载入评审工作台...</p>
        </div>
      </div>
    );
  }

  if (!hasReviewerAccess) {
    return (
      <div className="portal-panel mx-auto max-w-3xl p-10">
        <Link
          href="/teacher"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-[#8f2017]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回老师首页
        </Link>
        <h1 className="mt-6 text-3xl font-semibold text-stone-900">评审工作台</h1>
        <div className="mt-6 rounded-[28px] border border-[#d9c29b]/45 bg-white/82 px-6 py-6 text-sm leading-7 text-stone-600">
          当前账号没有“评审员”职能，也不是管理员，不能进入评审工作台。
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.14)] md:p-8">
        <Link
          href={
            selectedTeacherUserId
              ? `/teacher?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
              : '/teacher'
          }
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-[#8f2017]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回老师首页
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.18em] text-stone-500">兼职工作台 · 评审员</div>
            <h1 className="mt-3 text-3xl font-semibold text-stone-900">评审工作台</h1>
          </div>

          <div className="flex max-w-[360px] flex-wrap gap-2">
            {reviewerCapabilities.map((capability) => (
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
            {reviewTargets.map((target) => (
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
              {switchingUnit ? '正在切换课时...' : '正在读取评审摘要...'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.12)] md:p-8">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                {selectedReviewTarget?.name || '未选择老师'}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                待评分 {taskboard?.pendingReviewCount || 0}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                已评分 {taskboard?.gradedSubmissions || taskboard?.approvedSubmissions || 0}
              </div>
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                总提交 {taskboard?.totalSubmissions || 0}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Link
                href={rosterHref}
                className="flex items-center justify-between rounded-[24px] border border-[#d9c29b]/45 bg-white px-5 py-4 transition-colors hover:border-[#c58d3e]"
              >
                <div className="text-base font-semibold text-stone-900">查看名册</div>
                <Users className="h-5 w-5 text-[#8f2017]" />
              </Link>

              <Link
                href={submissionsHref}
                className="flex items-center justify-between rounded-[24px] border border-[#d9c29b]/45 bg-white px-5 py-4 transition-colors hover:border-[#c58d3e]"
              >
                <div className="text-base font-semibold text-stone-900">进入作业评分</div>
                <ClipboardCheck className="h-5 w-5 text-[#8f2017]" />
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
