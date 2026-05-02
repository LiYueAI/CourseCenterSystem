'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Copy,
  Microscope,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCcw,
  Star,
  Users,
  X,
} from 'lucide-react';

import {
  getCourses,
  getLessons,
  getModules,
  getUnits,
  type Course,
  type Lesson,
  type LessonModule,
  type Unit,
} from '@/lib/directus';
import { COURSE_CATALOG, isTeacherHiddenCourse } from '@/lib/course-catalog';

export const dynamic = 'force-dynamic';

interface TeacherCurrentClassroomSummary {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  classCodeEnabled?: boolean;
  classCodeStatus?: 'enabled' | 'disabled';
  studentCount: number;
  students: Array<{
    userId: string;
    name: string;
  }>;
}

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

interface TeacherPageCurrentUser {
  id: string;
  email: string;
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

interface TeacherCourseCard {
  key: string;
  title: string;
  courseId: number | null;
  courseIndex: number | null;
  isAvailable: boolean;
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

function getModuleDisplayName(module: LessonModule): string {
  return module.module_name || module.module_type || `流程 ${module.module_index}`;
}

export default function TeacherPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedTeacherUserId = useMemo(
    () => (searchParams.get('teacherUserId') || '').trim() || null,
    [searchParams]
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingClassroom, setLoadingClassroom] = useState(true);
  const [switchingUnit, setSwitchingUnit] = useState(false);
  const [switchingLesson, setSwitchingLesson] = useState(false);
  const [classroomSummary, setClassroomSummary] = useState<TeacherCurrentClassroomSummary | null>(null);
  const [classroomFeedback, setClassroomFeedback] = useState<string | null>(null);
  const [classCodeActionLoading, setClassCodeActionLoading] = useState<'rotate' | 'disable' | 'enable' | null>(
    null
  );
  const [showClassroomSetup, setShowClassroomSetup] = useState(false);
  const [setupClassCode, setSetupClassCode] = useState('');
  const [savingClassroomSetup, setSavingClassroomSetup] = useState(false);
  const [classroomSetupError, setClassroomSetupError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<TeacherPageCurrentUser | null>(null);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState<string | null>(null);
  const [reviewTargets, setReviewTargets] = useState<ReviewTargetTeacher[]>([]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );
  const courseCards = useMemo<TeacherCourseCard[]>(() => {
    const actualByTitle = new Map(
      courses.map((course) => [course.title.trim(), course])
    );
    const usedIds = new Set<number>();
    const cards: TeacherCourseCard[] = [];

    for (const entry of COURSE_CATALOG) {
      const matchedCourse = actualByTitle.get(entry.title.trim()) || null;
      if (matchedCourse) {
        usedIds.add(matchedCourse.id);
      }

      cards.push({
        key: matchedCourse ? `course:${matchedCourse.id}` : `placeholder:${entry.title}`,
        title: entry.title,
        courseId: matchedCourse?.id || null,
        courseIndex: matchedCourse?.course_index || entry.desiredIndex,
        isAvailable: Boolean(matchedCourse),
      });
    }

    const extraCourses = courses
      .filter((course) => !usedIds.has(course.id))
      .sort(
        (left, right) =>
          (left.course_index || Number.MAX_SAFE_INTEGER) -
            (right.course_index || Number.MAX_SAFE_INTEGER) ||
          left.title.localeCompare(right.title, 'zh-CN')
      )
      .map((course) => ({
        key: `course:${course.id}`,
        title: course.title,
        courseId: course.id,
        courseIndex: course.course_index || null,
        isAvailable: true,
      }));

    return [...cards, ...extraCourses];
  }, [courses]);
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === selectedUnitId) || null,
    [selectedUnitId, units]
  );
  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) || null,
    [lessons, selectedLessonId]
  );
  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) || null,
    [activeModuleId, modules]
  );
  const activeCapabilities = currentUser?.access?.teacherCapabilities || [];
  const reviewerCapabilities = activeCapabilities.filter(
    (capability) => capability.capabilityKey === 'reviewer'
  );
  const researchCapabilities = activeCapabilities.filter(
    (capability) => capability.capabilityKey === 'teaching-researcher'
  );
  const showReviewerWorkbench =
    currentUser?.role === 'admin' || reviewerCapabilities.length > 0;
  const showResearchWorkbench =
    currentUser?.role === 'admin' || researchCapabilities.length > 0;
  const selectedReviewTarget =
    reviewTargets.find((target) => target.userId === selectedTeacherUserId) || null;
  const canManageViewedTeacher = selectedReviewTarget ? selectedReviewTarget.isSelf : true;

  function returnToCourseSelection() {
    setSelectedCourseId(null);
    setSelectedUnitId(null);
    setSelectedLessonId(null);
    setActiveModuleId(null);
    setUnits([]);
    setLessons([]);
    setModules([]);
    setError(null);
  }

  useEffect(() => {
    setSelectedTeacherUserId(requestedTeacherUserId);
  }, [requestedTeacherUserId]);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          user?: TeacherPageCurrentUser;
        };
        setCurrentUser(payload.user || null);
      } catch (loadError) {
        console.error('Failed to load teacher access context', loadError);
      }
    }

    void loadCurrentUser();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const courseData = await getCourses();
        setCourses(courseData.filter((course) => !isTeacherHiddenCourse(course)));
      } catch (loadError) {
        console.error('Failed to load teacher page', loadError);
        setError('无法读取老师端课程，请稍后重试。');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function loadTeacherClassroom() {
    setLoadingClassroom(true);

    try {
      const params = new URLSearchParams();
      if (selectedTeacherUserId) {
        params.set('teacherUserId', selectedTeacherUserId);
      }

      const response = await fetch(
        `/api/teacher/classroom${params.toString() ? `?${params.toString()}` : ''}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        classroom?: TeacherCurrentClassroomSummary | null;
        reviewTargets?: ReviewTargetTeacher[];
        activeTargetTeacherUserId?: string | null;
      };

      setClassroomSummary(payload.classroom || null);
      setReviewTargets(payload.reviewTargets || []);
      setSelectedTeacherUserId(payload.activeTargetTeacherUserId || null);

      if (typeof window !== 'undefined') {
        const nextParams = new URLSearchParams(window.location.search);
        if (payload.activeTargetTeacherUserId) {
          nextParams.set('teacherUserId', payload.activeTargetTeacherUserId);
        } else {
          nextParams.delete('teacherUserId');
        }
        const nextQuery = nextParams.toString();
        window.history.replaceState(
          {},
          '',
          `/teacher${nextQuery ? `?${nextQuery}` : ''}`
        );
      }
    } catch (loadError) {
      console.error('Failed to load teacher classroom summary', loadError);
    } finally {
      setLoadingClassroom(false);
    }
  }

  useEffect(() => {
    void loadTeacherClassroom();
  }, [selectedTeacherUserId]);


  async function handleCourseChange(courseId: number) {
    setSelectedCourseId(courseId);
    setSelectedUnitId(null);
    setSelectedLessonId(null);
    setActiveModuleId(null);
    setUnits([]);
    setLessons([]);
    setModules([]);
    setSwitchingUnit(true);
    setError(null);

    try {
      const unitData = await getUnits(courseId);
      setUnits(unitData);
      const defaultUnitId = unitData[0]?.id || null;
      setSelectedUnitId(defaultUnitId);

      if (!defaultUnitId) {
        return;
      }

      const lessonData = await getLessons(defaultUnitId);
      setLessons(lessonData);
      setSelectedLessonId(lessonData[0]?.id || null);
    } catch (loadError) {
      console.error('Failed to switch course', loadError);
      setError('课程切换失败，请重新选择。');
      setUnits([]);
      setLessons([]);
      setModules([]);
    } finally {
      setSwitchingUnit(false);
    }
  }

  async function handleUnitChange(unitId: number) {
    setSelectedUnitId(unitId);
    setSelectedLessonId(null);
    setActiveModuleId(null);
    setSwitchingUnit(true);
    setError(null);

    try {
      const lessonData = await getLessons(unitId);
      setLessons(lessonData);
      setSelectedLessonId(lessonData[0]?.id || null);
    } catch (loadError) {
      console.error('Failed to switch unit', loadError);
      setError('课时切换失败，请重新选择。');
      setLessons([]);
      setModules([]);
    } finally {
      setSwitchingUnit(false);
    }
  }

  useEffect(() => {
    async function loadModulesForLesson() {
      if (!selectedLessonId) {
        setModules([]);
        setActiveModuleId(null);
        return;
      }

      setSwitchingLesson(true);
      setError(null);

      try {
        const moduleData = await getModules(selectedLessonId);
        setModules(moduleData);
      } catch (loadError) {
        console.error('Failed to load lesson modules', loadError);
        setError('流程读取失败，请重新选择课时。');
        setModules([]);
      } finally {
        setSwitchingLesson(false);
      }
    }

    void loadModulesForLesson();
  }, [selectedLessonId]);

  async function copyClassCode() {
    const classCodeEnabled = classroomSummary
      ? classroomSummary.classCodeEnabled ?? classroomSummary.classCodeStatus !== 'disabled'
      : false;

    if (
      !classroomSummary?.classCode ||
      !classCodeEnabled ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(classroomSummary.classCode);
      setClassroomFeedback('班级编码已复制');
      window.setTimeout(() => setClassroomFeedback(null), 2000);
    } catch (copyError) {
      console.error('Failed to copy class code', copyError);
      setClassroomFeedback('复制失败，请手动复制');
      window.setTimeout(() => setClassroomFeedback(null), 2000);
    }
  }

  async function handleClassCodeAction(action: 'rotate' | 'disable' | 'enable') {
    if (!classroomSummary) {
      return;
    }

    setClassCodeActionLoading(action);
    setClassroomFeedback(null);

    try {
      const response = await fetch('/api/teacher/classroom', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action:
            action === 'rotate'
              ? 'rotateClassCode'
              : action === 'disable'
                ? 'disableClassCode'
                : 'enableClassCode',
        }),
      });

      let nextFeedback =
        action === 'rotate'
          ? '班级编码已轮换。'
          : action === 'disable'
            ? '班级编码已停用。'
            : '班级编码已重新启用。';

      if (!response.ok) {
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            nextFeedback = payload.error;
          }
        } catch {
          nextFeedback = '班级编码操作失败，请稍后再试。';
        }

        setClassroomFeedback(nextFeedback);
        return;
      }

      try {
        const payload = (await response.json()) as {
          classroom?: TeacherCurrentClassroomSummary | null;
          message?: string;
        };

        if (payload.classroom) {
          setClassroomSummary(payload.classroom);
        } else {
          await loadTeacherClassroom();
        }

        if (payload.message) {
          nextFeedback = payload.message;
        }
      } catch {
        await loadTeacherClassroom();
      }

      setClassroomFeedback(nextFeedback);
    } catch (actionError) {
      console.error('Failed to update teacher classroom code', actionError);
      setClassroomFeedback('班级编码操作失败，请稍后再试。');
    } finally {
      setClassCodeActionLoading(null);
      window.setTimeout(() => setClassroomFeedback(null), 2400);
    }
  }

  function openModuleActions(moduleId: number) {
    setActiveModuleId(moduleId);
  }

  function closeModuleActions() {
    setActiveModuleId(null);
  }

  function openClassroomSetup() {
    setShowClassroomSetup(true);
    setClassroomSetupError(null);
  }

  function closeClassroomSetup() {
    if (savingClassroomSetup) {
      return;
    }

    setShowClassroomSetup(false);
    setClassroomSetupError(null);
  }

  async function handleSaveClassroomSetup() {
    if (!classroomSummary) {
      return;
    }

    setSavingClassroomSetup(true);
    setClassroomSetupError(null);

    try {
      const response = await fetch('/api/teacher/classroom', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'setClassCode',
          classCode: setupClassCode,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        classroom?: TeacherCurrentClassroomSummary | null;
        error?: string;
      };

      if (!response.ok || !payload.classroom) {
        throw new Error(payload.error || '班级配置失败');
      }

      setClassroomSummary(payload.classroom);
      setShowClassroomSetup(false);
      setSetupClassCode('');
      setClassroomFeedback('班级编码已更新');
      window.setTimeout(() => setClassroomFeedback(null), 2400);
    } catch (setupError) {
      console.error('Failed to configure classroom', setupError);
      setClassroomSetupError(setupError instanceof Error ? setupError.message : '班级配置失败');
    } finally {
      setSavingClassroomSetup(false);
    }
  }

  function goTo(path: string, preserveTeacherTarget = false) {
    closeModuleActions();
    const url = new URL(path, window.location.origin);
    if (preserveTeacherTarget && selectedTeacherUserId) {
      url.searchParams.set('teacherUserId', selectedTeacherUserId);
    }
    router.push(`${url.pathname}${url.search}`);
  }

  const classCodeEnabled = classroomSummary
    ? classroomSummary.classCodeEnabled ?? classroomSummary.classCodeStatus !== 'disabled'
    : false;

  if (loading) {
    return (
      <div className="portal-panel flex min-h-[360px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
          <p className="mt-4 text-stone-600">正在读取老师端...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {showReviewerWorkbench || showResearchWorkbench ? (
        <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_24px_60px_rgba(45,31,11,0.12)] md:p-8">
          <div className="flex flex-wrap gap-4">
            {showReviewerWorkbench ? (
              <Link
                href={
                  selectedTeacherUserId
                    ? `/teacher/reviewer?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
                    : '/teacher/reviewer'
                }
                className="flex-1 rounded-[24px] border border-[#d9c29b]/45 bg-white/86 px-5 py-4 transition-colors hover:border-[#c58d3e]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-stone-900">评审工作台</div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[#8f2017]" />
                </div>
              </Link>
            ) : null}

            {showResearchWorkbench ? (
              <Link
                href="/teacher/research"
                className="flex-1 rounded-[24px] border border-[#d9c29b]/45 bg-white/86 px-5 py-4 transition-colors hover:border-[#c58d3e]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-stone-900">教研工作台</div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[#8f2017]" />
                </div>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {loadingClassroom || classroomSummary ? (
        <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_24px_60px_rgba(45,31,11,0.12)] md:p-8">
        {loadingClassroom ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#8f2017]" />
              <p className="mt-3 text-sm text-stone-600">正在读取班级信息...</p>
            </div>
          </div>
        ) : classroomSummary ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
              {classroomSummary.gradeLevel} · {classroomSummary.className}
            </div>
            <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
              {classroomSummary.studentCount} 名学生
            </div>
            <div className="rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2 text-sm text-[#8f2017]">
              班级编码 {classroomSummary.classCode}
            </div>
            <button
              type="button"
              onClick={copyClassCode}
              disabled={!classCodeEnabled}
              className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              复制编码
            </button>
            <Link
              href={
                selectedTeacherUserId
                  ? `/teacher/roster?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
                  : '/teacher/roster'
              }
              className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
            >
              查看名册
            </Link>
            {canManageViewedTeacher ? (
              <>
                <button
                  type="button"
                  onClick={() => handleClassCodeAction('rotate')}
                  disabled={classCodeActionLoading !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                >
                  <RefreshCcw className="h-4 w-4" />
                  轮换编码
                </button>
                <button
                  type="button"
                  onClick={() => handleClassCodeAction(classCodeEnabled ? 'disable' : 'enable')}
                  disabled={classCodeActionLoading !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2 text-sm font-medium text-[#8f2017] transition-colors hover:border-[#c58d3e] hover:bg-white disabled:opacity-60"
                >
                  {classCodeEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                  {classCodeEnabled ? '停用编码' : '启用编码'}
                </button>
                <button
                  type="button"
                  onClick={openClassroomSetup}
                  disabled={classCodeActionLoading !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                >
                  <Users className="h-4 w-4" />
                  修改编码
                </button>
              </>
            ) : null}
            {classroomFeedback ? <div className="text-xs text-stone-500">{classroomFeedback}</div> : null}
          </div>
        ) : null}
        </section>
      ) : null}

      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_24px_60px_rgba(45,31,11,0.12)] md:p-8">
        {!selectedCourseId ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {courseCards.map((course) => (
              <div
                key={course.key}
                className={`rounded-[24px] border px-5 py-5 shadow-[0_14px_28px_rgba(97,73,33,0.08)] ${
                  course.isAvailable
                    ? 'border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,251,244,0.96),rgba(255,255,255,0.94))]'
                    : 'border-[#e4d8c4]/70 bg-[linear-gradient(180deg,rgba(250,246,239,0.96),rgba(244,239,231,0.94))]'
                }`}
              >
                <h2 className="text-xl font-semibold text-stone-900">{course.title}</h2>
                <button
                  type="button"
                  onClick={() => course.courseId && handleCourseChange(course.courseId)}
                  disabled={!course.isAvailable}
                  className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
                    course.isAvailable
                      ? 'bg-[linear-gradient(180deg,#b83226,#7f1712)] text-[#f8ead1] shadow-[0_12px_26px_rgba(127,23,18,0.22)]'
                      : 'cursor-not-allowed border border-[#d9c29b]/55 bg-white/70 text-stone-400'
                  }`}
                >
                  {course.isAvailable ? '进入课程' : '课程待开发'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={returnToCourseSelection}
              className="rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm text-stone-600 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
            >
              返回选课
            </button>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <select
                value={selectedCourseId || ''}
                onChange={(event) => handleCourseChange(Number(event.target.value))}
                className="w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              >
                {courseCards
                  .filter((course) => course.courseId)
                  .map((course) => (
                    <option key={course.key} value={course.courseId || ''}>
                      {course.title}
                    </option>
                  ))}
              </select>

              <select
                value={selectedUnitId || ''}
                onChange={(event) => handleUnitChange(Number(event.target.value))}
                disabled={!selectedCourseId || units.length === 0}
                className="w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-55"
              >
                {units.length === 0 ? <option value="">暂无单元</option> : null}
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    第 {unit.unit_index} 单元 · {unit.title}
                  </option>
                ))}
              </select>

              <select
                value={selectedLessonId || ''}
                onChange={(event) => setSelectedLessonId(Number(event.target.value))}
                disabled={!selectedUnitId || lessons.length === 0}
                className="w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-55"
              >
                {lessons.length === 0 ? <option value="">暂无课时</option> : null}
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    第 {lesson.lesson_index} 课 · {lesson.title}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/85 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {selectedCourseId && selectedLesson ? (
          <div className="mt-6">
            <div className="text-xs tracking-[0.18em] text-stone-500">
              {selectedCourse?.title || '当前课程'} · 第 {selectedUnit?.unit_index || '-'} 单元 · 第 {selectedLesson.lesson_index} 课
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-stone-900">{selectedLesson.title}</h2>
          </div>
        ) : null}

        {switchingUnit || switchingLesson ? (
          <div className="mt-8 flex min-h-[220px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
              <p className="mt-4 text-stone-600">
                {switchingUnit ? '正在切换课程内容...' : '正在读取这节课的流程...'}
              </p>
            </div>
          </div>
        ) : selectedCourseId && selectedLesson ? (
          <div className="relative mt-8">
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 100 ${Math.max(modules.length, 1) * 132}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {modules.slice(0, -1).map((_, index) => (
                <line
                  key={`path-${index}`}
                  x1={index % 2 === 0 ? 24 : 76}
                  y1={index * 132 + 66}
                  x2={(index + 1) % 2 === 0 ? 24 : 76}
                  y2={(index + 1) * 132 + 66}
                  stroke="rgba(197,141,62,0.65)"
                  strokeWidth="1.8"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                />
              ))}
            </svg>

            <div className="relative">
              {modules.map((module, index) => {
                const alignRight = index % 2 === 1;
                const isActive = module.id === activeModuleId;

                return (
                  <div key={module.id} className="relative h-[132px]">
                    <button
                      type="button"
                      onClick={() => openModuleActions(module.id)}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${
                        alignRight ? 'left-[76%]' : 'left-[24%]'
                      }`}
                      aria-label={`打开第 ${module.module_index} 个流程的操作`}
                    >
                      <div
                        className={`relative flex h-24 w-24 items-center justify-center rounded-full border transition-all ${
                          isActive
                            ? 'border-[#c58d3e]/75 bg-[radial-gradient(circle_at_30%_30%,#fffdf7,#f6e5ba_55%,#e2bf68_100%)] shadow-[0_16px_34px_rgba(197,141,62,0.22)]'
                            : 'border-[#ddd2c4] bg-[radial-gradient(circle_at_30%_30%,#ffffff,#f6efe5_70%,#e8dfd2_100%)] shadow-[0_12px_26px_rgba(97,73,33,0.08)]'
                        }`}
                      >
                        <Star className={`h-10 w-10 ${isActive ? 'text-[#b77910]' : 'text-stone-300'}`} />
                        <span className="absolute bottom-2 text-xs font-semibold text-stone-700">
                          {module.module_index}
                        </span>
                      </div>
                      <div className="mt-3 w-32 -translate-x-1/2 text-center">
                        <div className="line-clamp-2 text-sm font-semibold text-stone-800">
                          {getModuleDisplayName(module)}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {modules.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-6 py-10 text-center text-sm text-stone-500">
                这节课还没有配置流程。
              </div>
            ) : null}
          </div>
        ) : selectedCourseId ? (
          <div className="mt-8 rounded-[24px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-6 py-10 text-center text-sm text-stone-500">
            先选择课程、单元和课时。
          </div>
        ) : null}
      </section>

      {activeModule && selectedLesson ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.42)] px-4">
          <div className="w-full max-w-md rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.22)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs tracking-[0.18em] text-stone-500">第 {activeModule.module_index} 个流程</div>
                <h3 className="mt-3 text-2xl font-semibold text-stone-900">{getModuleDisplayName(activeModule)}</h3>
              </div>
              <button
                type="button"
                onClick={closeModuleActions}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-white/86 text-stone-600 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                aria-label="关闭操作面板"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => goTo(`/teacher/prepare?lessonId=${selectedLesson.id}&moduleId=${activeModule.id}`)}
                className="flex items-center gap-3 rounded-[24px] border border-[#d9c29b]/55 bg-white/86 px-5 py-4 text-left transition-colors hover:border-[#c58d3e]"
              >
                <BookOpen className="h-5 w-5 text-[#8f2017]" />
                <div>
                  <div className="text-base font-semibold text-stone-900">一键备课</div>
                  <div className="mt-1 text-sm text-stone-600">直接进入备课并安排资源</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => goTo(`/teacher/classroom?lessonId=${selectedLesson.id}`)}
                className="flex items-center gap-3 rounded-[24px] border border-[#d9c29b]/55 bg-white/86 px-5 py-4 text-left transition-colors hover:border-[#c58d3e]"
              >
                <Play className="h-5 w-5 text-[#8f2017]" />
                <div>
                  <div className="text-base font-semibold text-stone-900">开始上课</div>
                  <div className="mt-1 text-sm text-stone-600">按当前内容直接上课</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => goTo(`/teacher/submissions?lessonId=${selectedLesson.id}`, true)}
                className="flex items-center gap-3 rounded-[24px] border border-[#d9c29b]/55 bg-white/86 px-5 py-4 text-left transition-colors hover:border-[#c58d3e]"
              >
                <Users className="h-5 w-5 text-[#8f2017]" />
                <div>
                  <div className="text-base font-semibold text-stone-900">作业评分</div>
                  <div className="mt-1 text-sm text-stone-600">看学生提交、评分和评语</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showClassroomSetup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.42)] px-4">
          <div className="w-full max-w-md rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.22)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs tracking-[0.18em] text-stone-500">班级配置</div>
                <h3 className="mt-3 text-2xl font-semibold text-stone-900">
                  输入班级编码
                </h3>
              </div>
              <button
                type="button"
                onClick={closeClassroomSetup}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-white/86 text-stone-600 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                aria-label="关闭班级配置"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <input
                type="text"
                value={setupClassCode}
                onChange={(event) => setSetupClassCode(event.target.value.toUpperCase())}
                placeholder="输入班级编码"
                maxLength={16}
                className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
              <p className="text-xs leading-6 text-stone-500">
                班级编码为 16 位，仅使用大写字母和数字，不含 0、1、4、I、O。
              </p>
            </div>

            {classroomSetupError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                {classroomSetupError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeClassroomSetup}
                disabled={savingClassroomSetup}
                className="rounded-full border border-[#d9c29b]/55 bg-white/86 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveClassroomSetup()}
                disabled={savingClassroomSetup}
                className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_28px_rgba(127,23,18,0.22)] disabled:opacity-50"
              >
                {savingClassroomSetup ? '正在保存...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
