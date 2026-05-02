'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Search,
  Users,
  XCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface TeacherRosterClassroom {
  id: number | null;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  studentCount: number;
}

interface StudentSubmissionStats {
  totalSubmissions: number;
  pending: number;
  approved: number;
  needsRevision: number;
}

interface TeacherRosterStudent {
  userId: string;
  name: string;
  studentNumber: string;
  phone: string;
  email: string;
  joinedAt: string | null;
  submissionStats: StudentSubmissionStats;
}

interface TeacherRosterPayload {
  classroom: TeacherRosterClassroom | null;
  students: TeacherRosterStudent[];
}

interface ReviewTargetTeacher {
  userId: string;
  name: string;
  schoolName: string | null;
  gradeLevel: string | null;
  className: string | null;
  isSelf: boolean;
}

function readString(source: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  return fallback;
}

function readNumber(source: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function readNullableNumber(
  source: Record<string, unknown>,
  keys: string[],
  fallback: number | null = null
): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function normalizeSubmissionStats(raw: unknown): StudentSubmissionStats {
  if (!raw || typeof raw !== 'object') {
    return {
      totalSubmissions: 0,
      pending: 0,
      approved: 0,
      needsRevision: 0,
    };
  }

  const stats = raw as Record<string, unknown>;
  return {
    totalSubmissions: readNumber(stats, [
      'totalSubmissions',
      'total_submissions',
      'submissionCount',
      'submission_count',
      'total',
    ]),
    pending: readNumber(stats, ['pending', 'pendingCount', 'pending_count']),
    approved: readNumber(stats, ['approved', 'approvedCount', 'approved_count']),
    needsRevision: readNumber(stats, [
      'needsRevision',
      'needs_revision',
      'rejected',
      'rejectedCount',
      'rejected_count',
    ]),
  };
}

function normalizeClassroom(raw: unknown): TeacherRosterClassroom | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const classroom = raw as Record<string, unknown>;

  return {
    id: readNullableNumber(classroom, ['id', 'classroomId', 'classroom_id']),
    schoolName: readString(classroom, ['schoolName', 'school_name']),
    gradeLevel: readString(classroom, ['gradeLevel', 'grade_level']),
    className: readString(classroom, ['className', 'class_name']),
    classCode: readString(classroom, ['classCode', 'class_code']),
    studentCount: readNumber(classroom, ['studentCount', 'student_count']),
  };
}

function normalizeStudent(raw: unknown): TeacherRosterStudent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const student = raw as Record<string, unknown>;
  const userId = readString(student, ['userId', 'user_id', 'id']);
  const name = readString(student, ['name', 'studentName', 'student_name'], '未命名学生');

  if (!userId && !name) {
    return null;
  }

  return {
    userId: userId || name,
    name,
    studentNumber: readString(student, ['studentNumber', 'student_number']),
    phone: readString(student, ['phone', 'studentPhone', 'student_phone']),
    email: readString(student, ['email', 'studentEmail', 'student_email']),
    joinedAt:
      readString(student, ['joinedAt', 'joined_at', 'createdAt', 'created_at']) || null,
    submissionStats: normalizeSubmissionStats(
      student.submissionStats ?? student.submission_stats ?? student.stats ?? student.summary
    ),
  };
}

function normalizeRosterPayload(raw: unknown): TeacherRosterPayload {
  if (!raw || typeof raw !== 'object') {
    return { classroom: null, students: [] };
  }

  const payload = raw as Record<string, unknown>;
  const classroom = normalizeClassroom(payload.classroom ?? payload.currentClassroom ?? payload.summary);
  const nestedClassroom =
    payload.classroom && typeof payload.classroom === 'object'
      ? (payload.classroom as Record<string, unknown>)
      : null;
  const studentsSource = Array.isArray(payload.students)
    ? payload.students
    : Array.isArray(payload.roster)
      ? payload.roster
      : Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(nestedClassroom?.students)
          ? nestedClassroom.students
        : [];

  return {
    classroom,
    students: studentsSource.map((item) => normalizeStudent(item)).filter(Boolean) as TeacherRosterStudent[],
  };
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '暂未记录';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '暂未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default function TeacherRosterPage() {
  const searchParams = useSearchParams();
  const requestedTeacherUserId = useMemo(
    () => (searchParams.get('teacherUserId') || '').trim() || null,
    [searchParams]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState<string | null>(null);
  const [reviewTargets, setReviewTargets] = useState<ReviewTargetTeacher[]>([]);
  const [roster, setRoster] = useState<TeacherRosterPayload>({
    classroom: null,
    students: [],
  });
  const selectedReviewTarget =
    reviewTargets.find((target) => target.userId === selectedTeacherUserId) || null;

  useEffect(() => {
    setSelectedTeacherUserId(requestedTeacherUserId);
  }, [requestedTeacherUserId]);

  useEffect(() => {
    let active = true;

    async function loadRoster() {
      setLoading(true);
      setError(null);

      try {
        const query = searchKeyword.trim();
        const params = new URLSearchParams();
        if (query) {
          params.set('query', query);
        }
        if (selectedTeacherUserId) {
          params.set('teacherUserId', selectedTeacherUserId);
        }

        const response = await fetch(`/api/teacher/roster?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Roster request failed: ${response.status}`);
        }

        const rawPayload = (await response.json()) as {
          reviewTargets?: ReviewTargetTeacher[];
          activeTargetTeacherUserId?: string | null;
        } & Record<string, unknown>;
        const payload = normalizeRosterPayload(rawPayload);

        if (!active) {
          return;
        }

        setRoster(payload);
        setReviewTargets(
          Array.isArray(rawPayload.reviewTargets) ? rawPayload.reviewTargets : []
        );
        setSelectedTeacherUserId(rawPayload.activeTargetTeacherUserId || null);

        if (typeof window !== 'undefined') {
          const nextParams = new URLSearchParams(window.location.search);
          if (query) {
            nextParams.set('query', query);
          } else {
            nextParams.delete('query');
          }
          if (rawPayload.activeTargetTeacherUserId) {
            nextParams.set('teacherUserId', rawPayload.activeTargetTeacherUserId);
          } else {
            nextParams.delete('teacherUserId');
          }
          const nextQuery = nextParams.toString();
          window.history.replaceState(
            {},
            '',
            `/teacher/roster${nextQuery ? `?${nextQuery}` : ''}`
          );
        }
      } catch (loadError) {
        console.error('Failed to load teacher roster', loadError);

        if (!active) {
          return;
        }

        setError('暂时无法读取完整学生名册，请稍后刷新重试。');
        setRoster({
          classroom: null,
          students: [],
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRoster();

    return () => {
      active = false;
    };
  }, [searchKeyword, selectedTeacherUserId]);

  const filteredStudents = useMemo(() => {
    return roster.students;
  }, [roster.students, searchKeyword]);

  const aggregateStats = useMemo(() => {
    return filteredStudents.reduce(
      (summary, student) => ({
        totalStudents: summary.totalStudents + 1,
        totalSubmissions: summary.totalSubmissions + student.submissionStats.totalSubmissions,
        pending: summary.pending + student.submissionStats.pending,
        approved: summary.approved + student.submissionStats.approved,
        needsRevision: summary.needsRevision + student.submissionStats.needsRevision,
      }),
      {
        totalStudents: 0,
        totalSubmissions: 0,
        pending: 0,
        approved: 0,
        needsRevision: 0,
      }
    );
  }, [filteredStudents]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.14)] md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={
                selectedTeacherUserId
                  ? `/teacher?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
                  : '/teacher'
              }
              className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
            <h1 className="mt-4 text-3xl font-semibold text-stone-900">学生名册</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {roster.classroom ? (
              <div className="rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm text-stone-700">
                {roster.classroom.gradeLevel} · {roster.classroom.className}
              </div>
            ) : null}
            {roster.classroom?.classCode ? (
              <div className="rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2 text-sm text-[#8f2017]">
                {roster.classroom.classCode}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.12)] md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-[280px] flex-1 flex-col gap-3 md:max-w-xl">
            <select
              value={selectedTeacherUserId || ''}
              onChange={(event) =>
                setSelectedTeacherUserId(event.target.value ? event.target.value : null)
              }
              className="w-full rounded-full border border-[#d9c29b]/60 bg-white/92 px-5 py-4 text-center text-base text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
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

            <label className="flex items-center gap-3 rounded-full border border-[#d9c29b]/60 bg-white/90 px-4 py-3 text-stone-700 shadow-[0_10px_20px_rgba(97,73,33,0.05)]">
              <Search className="h-4 w-4 text-stone-500" />
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="输入学生姓名、手机号或邮箱"
                className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.12)] md:p-8">
        {roster.classroom ? (
          <div className="mb-4 rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm text-stone-600">
            班级人数 {roster.classroom.studentCount}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#8f2017]" />
              <p className="mt-4 text-sm text-stone-600">正在读取老师名册</p>
            </div>
          </div>
        ) : error ? (
          <div className="mt-6 rounded-[28px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm leading-7 text-red-600">
            {error}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-dashed border-[#d9c29b]/55 bg-white/82 px-6 py-8 text-center text-sm leading-7 text-stone-600">
            {roster.students.length === 0
              ? '当前班级还没有学生入班。'
              : '没有匹配到这个姓名的学生，请调整搜索关键词。'}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredStudents.map((student) => (
              <article
                key={student.userId}
                className="rounded-[28px] border border-[#d9c29b]/45 bg-white/86 p-5 shadow-[0_16px_28px_rgba(97,73,33,0.08)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-stone-900">{student.name}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone-600">
                      {student.studentNumber ? (
                        <span className="rounded-full border border-[#d9c29b]/45 bg-[#fffaf0] px-3 py-1.5">
                          学号 {student.studentNumber}
                        </span>
                      ) : null}
                      {student.phone ? (
                        <span className="rounded-full border border-[#d9c29b]/45 bg-[#fffaf0] px-3 py-1.5">
                          {student.phone}
                        </span>
                      ) : null}
                      {student.email ? (
                        <span className="rounded-full border border-[#d9c29b]/45 bg-[#fffaf0] px-3 py-1.5">
                          {student.email}
                        </span>
                      ) : null}
                      {!student.phone && !student.email ? (
                        <span className="rounded-full border border-[#d9c29b]/45 bg-[#fffaf0] px-3 py-1.5">
                          未记录联系方式
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right text-sm font-medium text-stone-700">{formatDateTime(student.joinedAt)}</div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[24px] border border-[#d9c29b]/45 bg-[#fffaf0] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-stone-500">累计提交</div>
                    <div className="mt-2 text-lg font-semibold text-stone-900">
                      {student.submissionStats.totalSubmissions}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#d9c29b]/45 bg-[#fffaf0] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-stone-500">待评分</div>
                    <div className="mt-2 text-lg font-semibold text-[#946200]">
                      {student.submissionStats.pending}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#d9c29b]/45 bg-[#fffaf0] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-stone-500">已评分</div>
                    <div className="mt-2 text-lg font-semibold text-emerald-700">
                      {student.submissionStats.approved + student.submissionStats.needsRevision}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#d9c29b]/45 bg-[#fffaf0] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-stone-500">已提交</div>
                    <div className="mt-2 text-lg font-semibold text-rose-700">
                      {student.submissionStats.pending +
                        student.submissionStats.approved +
                        student.submissionStats.needsRevision}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Link
            href={
              selectedTeacherUserId
                ? `/teacher/submissions?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
                : '/teacher/submissions'
            }
            className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
          >
            前往作业评分
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
