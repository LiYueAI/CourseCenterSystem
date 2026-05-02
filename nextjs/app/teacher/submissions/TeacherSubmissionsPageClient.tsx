'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
  Mic,
  RefreshCw,
  Video,
} from 'lucide-react';
import { getLessons, getUnits, type Lesson, type Unit } from '@/lib/directus';
import {
  toStudentAssignmentReviewPhase,
  type StudentAssignmentReviewPhase,
} from '@/lib/student-assignment-review';

export const dynamic = 'force-dynamic';

type ReviewStatus = Exclude<StudentAssignmentReviewPhase, 'draft'>;
type StatusFilter = 'all' | ReviewStatus;

interface SubmissionAttachment {
  id?: string;
  name: string;
  url: string;
  kind?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

interface SubmissionRecord {
  id: string;
  assignmentKey: string;
  assignmentTitle: string;
  assignmentContent: string;
  lessonId: number;
  lessonTitle: string;
  moduleId: number | null;
  moduleIndex: number | null;
  moduleName: string;
  moduleType: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  className: string;
  responseText: string;
  attachments: SubmissionAttachment[];
  submittedAt: string | null;
  updatedAt: string | null;
  isCompleted: boolean;
  reviewStatus: ReviewStatus;
  reviewNotes: string;
  teacherScore: number | null;
  reviewedAt: string | null;
  dueAt?: string | null;
  isRequired?: boolean;
}

interface ReviewTargetTeacher {
  userId: string;
  name: string;
  schoolName: string | null;
  gradeLevel: string | null;
  className: string | null;
  isSelf: boolean;
}

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: '待评分',
  graded: '已评分',
};

const REVIEW_STATUS_STYLES: Record<ReviewStatus, string> = {
  pending: 'border-[#e8c977]/70 bg-[#fff7df] text-[#946200]',
  graded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待评分' },
  { value: 'graded', label: '已评分' },
];

const COMMON_REVIEW_TEMPLATES: Array<{ label: string; value: string }> = [
  {
    label: '完成较好',
    value: '本次作业完成较好，表达完整，继续保持。',
  },
  {
    label: '补充细节',
    value: '整体完成度不错，但还可以补充关键细节，让表达更完整、更有条理。',
  },
  {
    label: '继续完善',
    value: '已看到你的思路，建议继续补充关键内容，让答案更完整。',
  },
  {
    label: '补充附件',
    value: '文字内容已收到，如有对应作品或资料，可继续补充附件。',
  },
];

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeReviewStatus(value: unknown): ReviewStatus {
  if (toStudentAssignmentReviewPhase(value) === 'graded') {
    return 'graded';
  }

  return 'pending';
}


function normalizeAttachment(raw: unknown, index: number): SubmissionAttachment | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const attachment = raw as Record<string, unknown>;
  const url =
    typeof attachment.url === 'string'
      ? attachment.url
      : typeof attachment.fileUrl === 'string'
        ? attachment.fileUrl
        : typeof attachment.file_url === 'string'
          ? attachment.file_url
          : typeof attachment.assetUrl === 'string'
            ? attachment.assetUrl
            : '';

  if (!url) {
    return null;
  }

  const name =
    typeof attachment.name === 'string'
      ? attachment.name
      : typeof attachment.fileName === 'string'
        ? attachment.fileName
        : typeof attachment.file_name === 'string'
          ? attachment.file_name
          : `附件 ${index + 1}`;

  const kind =
    typeof attachment.kind === 'string'
      ? attachment.kind
      : typeof attachment.type === 'string'
        ? attachment.type
        : typeof attachment.fileType === 'string'
          ? attachment.fileType
          : typeof attachment.itemType === 'string'
            ? attachment.itemType
          : typeof attachment.file_type === 'string'
            ? attachment.file_type
            : null;

  const mimeType =
    typeof attachment.mimeType === 'string'
      ? attachment.mimeType
      : typeof attachment.mime_type === 'string'
        ? attachment.mime_type
        : null;

  return {
    id: typeof attachment.id === 'string' ? attachment.id : undefined,
    name,
    url,
    kind,
    mimeType,
    sizeBytes: typeof attachment.sizeBytes === 'number'
      ? attachment.sizeBytes
      : typeof attachment.size === 'number'
        ? attachment.size
      : typeof attachment.size_bytes === 'number'
        ? attachment.size_bytes
        : null,
  };
}

function normalizeSubmission(raw: unknown): SubmissionRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const submission = raw as Record<string, unknown>;
  const id =
    typeof submission.id === 'string'
      ? submission.id
      : typeof submission.submissionId === 'string'
        ? submission.submissionId
        : typeof submission.submission_id === 'string'
          ? submission.submission_id
          : '';

  if (!id) {
    return null;
  }

  const attachmentsSource = Array.isArray(submission.attachments)
    ? submission.attachments
    : Array.isArray(submission.files)
      ? submission.files
      : Array.isArray(submission.media)
        ? submission.media
        : [];
  const nestedStudent =
    submission.student && typeof submission.student === 'object'
      ? (submission.student as Record<string, unknown>)
      : null;

  return {
    id,
    assignmentKey:
      typeof submission.assignmentKey === 'string'
        ? submission.assignmentKey
        : typeof submission.assignment_key === 'string'
          ? submission.assignment_key
          : id,
    assignmentTitle:
      typeof submission.assignmentTitle === 'string'
        ? submission.assignmentTitle
        : typeof submission.assignment_title === 'string'
          ? submission.assignment_title
          : '未命名作业',
    assignmentContent:
      typeof submission.assignmentContent === 'string'
        ? submission.assignmentContent
        : typeof submission.assignment_content === 'string'
          ? submission.assignment_content
          : '',
    lessonId:
      typeof submission.lessonId === 'number'
        ? submission.lessonId
        : typeof submission.lesson_id === 'number'
          ? submission.lesson_id
          : 0,
    lessonTitle:
      typeof submission.lessonTitle === 'string'
        ? submission.lessonTitle
        : typeof submission.lesson_title === 'string'
          ? submission.lesson_title
          : '',
    moduleId:
      typeof submission.moduleId === 'number'
        ? submission.moduleId
        : typeof submission.module_id === 'number'
          ? submission.module_id
          : null,
    moduleIndex:
      typeof submission.moduleIndex === 'number'
        ? submission.moduleIndex
        : typeof submission.module_index === 'number'
          ? submission.module_index
          : null,
    moduleName:
      typeof submission.moduleName === 'string'
        ? submission.moduleName
        : typeof submission.module_name === 'string'
          ? submission.module_name
          : '未分组流程',
    moduleType:
      typeof submission.moduleType === 'string'
        ? submission.moduleType
        : typeof submission.module_type === 'string'
          ? submission.module_type
          : '',
    studentId:
      typeof submission.studentId === 'string'
        ? submission.studentId
        : typeof submission.student_id === 'string'
          ? submission.student_id
          : '',
    studentName:
      typeof submission.studentName === 'string'
        ? submission.studentName
        : typeof submission.student_name === 'string'
          ? submission.student_name
          : typeof submission.studentDisplayName === 'string'
            ? submission.studentDisplayName
            : typeof nestedStudent?.name === 'string'
              ? nestedStudent.name
              : '未命名学生',
    studentNumber:
      typeof submission.studentNumber === 'string'
        ? submission.studentNumber
        : typeof submission.student_number === 'string'
          ? submission.student_number
          : '',
    className:
      typeof submission.className === 'string'
        ? submission.className
        : typeof submission.class_name === 'string'
          ? submission.class_name
          : '',
    responseText:
      typeof submission.responseText === 'string'
        ? submission.responseText
        : typeof submission.response_text === 'string'
          ? submission.response_text
          : '',
    attachments: attachmentsSource
      .map((item, index) => normalizeAttachment(item, index))
      .filter((item): item is SubmissionAttachment => Boolean(item)),
    submittedAt:
      typeof submission.submittedAt === 'string'
        ? submission.submittedAt
        : typeof submission.submitted_at === 'string'
          ? submission.submitted_at
          : typeof submission.completedAt === 'string'
            ? submission.completedAt
            : typeof submission.completed_at === 'string'
              ? submission.completed_at
              : null,
    updatedAt:
      typeof submission.updatedAt === 'string'
        ? submission.updatedAt
        : typeof submission.updated_at === 'string'
          ? submission.updated_at
          : null,
    isCompleted:
      typeof submission.isCompleted === 'boolean'
        ? submission.isCompleted
        : typeof submission.is_completed === 'boolean'
          ? submission.is_completed
          : true,
    reviewStatus: normalizeReviewStatus(submission.reviewStatus ?? submission.review_status),
    reviewNotes:
      typeof submission.reviewNotes === 'string'
        ? submission.reviewNotes
        : typeof submission.teacherReviewNote === 'string'
          ? submission.teacherReviewNote
        : typeof submission.review_notes === 'string'
          ? submission.review_notes
          : typeof submission.teacher_review_note === 'string'
            ? submission.teacher_review_note
          : '',
    teacherScore:
      typeof submission.teacherScore === 'number'
        ? submission.teacherScore
        : typeof submission.teacher_score === 'number'
          ? submission.teacher_score
          : null,
    reviewedAt:
      typeof submission.reviewedAt === 'string'
        ? submission.reviewedAt
        : typeof submission.reviewed_at === 'string'
          ? submission.reviewed_at
          : null,
    dueAt:
      typeof submission.dueAt === 'string'
        ? submission.dueAt
        : typeof submission.due_at === 'string'
          ? submission.due_at
          : null,
    isRequired:
      typeof submission.isRequired === 'boolean'
        ? submission.isRequired
        : typeof submission.is_required === 'boolean'
          ? submission.is_required
          : false,
  };
}

function getAttachmentMeta(attachment: SubmissionAttachment): string {
  const kind = `${attachment.kind || ''} ${attachment.mimeType || ''}`.toLowerCase();

  if (kind.includes('image') || kind.includes('png') || kind.includes('jpg') || kind.includes('jpeg')) {
    return '图片';
  }

  if (kind.includes('video') || kind.includes('mp4') || kind.includes('mov')) {
    return '视频';
  }

  if (kind.includes('audio') || kind.includes('mp3') || kind.includes('wav')) {
    return '音频';
  }

  return '文档';
}

function AttachmentIcon({ attachment }: { attachment: SubmissionAttachment }) {
  const kind = getAttachmentMeta(attachment);

  if (kind === '图片') {
    return <FileImage className="h-4 w-4 text-[#8f2017]" />;
  }

  if (kind === '视频') {
    return <Video className="h-4 w-4 text-[#8f2017]" />;
  }

  if (kind === '音频') {
    return <Mic className="h-4 w-4 text-[#8f2017]" />;
  }

  return <FileText className="h-4 w-4 text-[#8f2017]" />;
}

export default function TeacherSubmissionsPage() {
  const searchParams = useSearchParams();
  const requestedLessonId = useMemo(
    () => parsePositiveInt(searchParams.get('lessonId')),
    [searchParams]
  );
  const requestedTeacherUserId = useMemo(
    () => (searchParams.get('teacherUserId') || '').trim() || null,
    [searchParams]
  );
  const [units, setUnits] = useState<Unit[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState<string | null>(null);
  const [reviewTargets, setReviewTargets] = useState<ReviewTargetTeacher[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [activeDraftSubmissionId, setActiveDraftSubmissionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [loadingSelection, setLoadingSelection] = useState(true);
  const [switchingUnit, setSwitchingUnit] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [savingSubmissionId, setSavingSubmissionId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTeacherUserId(requestedTeacherUserId);
  }, [requestedTeacherUserId]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSelection() {
      setLoadingSelection(true);
      setError(null);

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
            const lessonData = unit.id === resolvedUnitId ? resolvedLessons : await getLessons(unit.id);
            const matchedLesson = lessonData.find((lesson) => lesson.id === requestedLessonId);

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
        console.error('Failed to load teacher submissions selection', loadError);
        if (!cancelled) {
          setError('老师端课时加载失败，请稍后重试。');
        }
      } finally {
        if (!cancelled) {
          setLoadingSelection(false);
        }
      }
    }

    loadInitialSelection();

    return () => {
      cancelled = true;
    };
  }, [requestedLessonId]);

  useEffect(() => {
    if (!selectedLessonId) {
      setSubmissions([]);
      setReviewDrafts({});
      return;
    }

    let cancelled = false;

    async function loadSubmissions() {
      setLoadingSubmissions(true);
      setError(null);
      setFeedback(null);

      try {
        const lessonId = selectedLessonId;
        if (!lessonId) {
          return;
        }

        const params = new URLSearchParams({ lessonId: String(lessonId) });
        if (selectedTeacherUserId) {
          params.set('teacherUserId', selectedTeacherUserId);
        }

        const submissionResponse = await fetch(
          `/api/teacher/submissions?${params.toString()}`,
          {
            cache: 'no-store',
          }
        );

        if (!submissionResponse.ok) {
          const payload = await submissionResponse
            .json()
            .catch(() => ({ error: '作业提交通道暂不可用。' }));
          throw new Error(payload.error || '作业提交通道暂不可用。');
        }

        const payload = (await submissionResponse.json()) as {
          submissions?: unknown[];
          items?: unknown[];
          reviewTargets?: ReviewTargetTeacher[];
          activeTargetTeacherUserId?: string | null;
        };
        const normalized = (payload.submissions || payload.items || [])
          .map((item) => normalizeSubmission(item))
          .filter((item): item is SubmissionRecord => Boolean(item));

        if (cancelled) {
          return;
        }

        setSubmissions(normalized);
        setReviewTargets(payload.reviewTargets || []);
        setSelectedTeacherUserId(payload.activeTargetTeacherUserId || null);
        setActiveDraftSubmissionId(null);
        setReviewDrafts(
          Object.fromEntries(normalized.map((item) => [item.id, item.reviewNotes || '']))
        );
        setScoreDrafts(
          Object.fromEntries(
            normalized.map((item) => [
              item.id,
              typeof item.teacherScore === 'number' ? String(item.teacherScore) : '',
            ])
          )
        );

        if (typeof window !== 'undefined') {
          const nextParams = new URLSearchParams({
            lessonId: String(selectedLessonId),
          });
          if (payload.activeTargetTeacherUserId) {
            nextParams.set('teacherUserId', payload.activeTargetTeacherUserId);
          }
          const nextUrl = `/teacher/submissions?${nextParams.toString()}`;
          window.history.replaceState({}, '', nextUrl);
        }
      } catch (loadError) {
        console.error('Failed to load teacher submissions', loadError);
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '作业提交加载失败，请稍后重试。');
          setSubmissions([]);
          setReviewDrafts({});
        }
      } finally {
        if (!cancelled) {
          setLoadingSubmissions(false);
        }
      }
    }

    loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce, selectedLessonId, selectedTeacherUserId]);

  async function handleUnitChange(unitId: number) {
    setSelectedUnitId(unitId);
    setSwitchingUnit(true);
    setError(null);
    setFeedback(null);

    try {
      const lessonData = await getLessons(unitId);
      setLessons(lessonData);
      setSelectedLessonId(lessonData[0]?.id || null);
    } catch (loadError) {
      console.error('Failed to switch teacher submissions unit', loadError);
      setError('课时加载失败，请重新选择。');
      setLessons([]);
      setSelectedLessonId(null);
    } finally {
      setSwitchingUnit(false);
    }
  }

  async function requestGradeUpdate(
    submissionId: string,
    teacherScore: number,
    draftNotes: string
  ): Promise<SubmissionRecord | null> {
    if (!selectedLessonId) {
      return null;
    }

    const response = await fetch('/api/teacher/submissions', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submissionId,
        id: submissionId,
        teacherUserId: selectedTeacherUserId,
        lessonId: selectedLessonId,
        lesson_id: selectedLessonId,
        teacherScore,
        teacherReviewNote: draftNotes,
        teacher_review_note: draftNotes,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: '评分保存失败。' }));
      throw new Error(payload.error || '评分保存失败。');
    }

    const payload = (await response.json().catch(() => null)) as {
      submission?: unknown;
    } | null;

    return payload?.submission ? normalizeSubmission(payload.submission) : null;
  }

  async function saveGrade(submissionId: string) {
    if (!selectedLessonId) {
      return;
    }

    const scoreValue = (scoreDrafts[submissionId] || '').trim();
    const teacherScore = Number(scoreValue);
    const draftNotes = (reviewDrafts[submissionId] || '').trim();

    if (!Number.isInteger(teacherScore) || teacherScore < 0 || teacherScore > 100) {
      setError('请填写 0 到 100 之间的整数分数。');
      setFeedback(null);
      return;
    }

    if (!draftNotes) {
      setError('请先填写老师评语，再保存评分。');
      setFeedback(null);
      return;
    }

    setSavingSubmissionId(submissionId);
    setError(null);
    setFeedback(null);

    try {
      const normalized = await requestGradeUpdate(submissionId, teacherScore, draftNotes);

      setSubmissions((current) =>
        current.map((submission) => {
          if (submission.id !== submissionId) {
            return submission;
          }

          return {
            ...submission,
            ...(normalized || {}),
            reviewStatus: normalized?.reviewStatus || 'graded',
            reviewNotes: normalized?.reviewNotes ?? draftNotes,
            teacherScore: normalized?.teacherScore ?? teacherScore,
            reviewedAt: normalized?.reviewedAt || new Date().toISOString(),
          };
        })
      );

      setReviewDrafts((current) => ({
        ...current,
        [submissionId]: normalized?.reviewNotes ?? draftNotes,
      }));
      setScoreDrafts((current) => ({
        ...current,
        [submissionId]: String(normalized?.teacherScore ?? teacherScore),
      }));
      setFeedback('评分已保存。');
    } catch (saveError) {
      console.error('Failed to save submission grade', saveError);
      setError(saveError instanceof Error ? saveError.message : '评分保存失败。');
    } finally {
      setSavingSubmissionId(null);
    }
  }

  const filteredSubmissions = useMemo(() => {
    if (statusFilter === 'all') {
      return submissions;
    }

    return submissions.filter((submission) => submission.reviewStatus === statusFilter);
  }, [statusFilter, submissions]);
  const backHref = selectedLessonId
    ? `/teacher?lessonId=${selectedLessonId}${
        selectedTeacherUserId ? `&teacherUserId=${encodeURIComponent(selectedTeacherUserId)}` : ''
      }`
    : selectedTeacherUserId
      ? `/teacher?teacherUserId=${encodeURIComponent(selectedTeacherUserId)}`
      : '/teacher';
  const activeDraftTargetId = useMemo(() => {
    if (activeDraftSubmissionId && submissions.some((submission) => submission.id === activeDraftSubmissionId)) {
      return activeDraftSubmissionId;
    }

    return filteredSubmissions[0]?.id || null;
  }, [activeDraftSubmissionId, filteredSubmissions, submissions]);
  const activeDraftTarget =
    submissions.find((submission) => submission.id === activeDraftTargetId) || null;

  useEffect(() => {
    if (
      activeDraftSubmissionId &&
      !submissions.some((submission) => submission.id === activeDraftSubmissionId)
    ) {
      setActiveDraftSubmissionId(null);
    }
  }, [activeDraftSubmissionId, submissions]);

  function applyReviewTemplate(templateValue: string) {
    if (!activeDraftTargetId) {
      setError('请先点击一条提交的评语输入框，再使用常用评语。');
      setFeedback(null);
      return;
    }

    setError(null);
    setFeedback('常用评语已填入当前草稿，可继续补充后保存。');
    setReviewDrafts((current) => {
      const existing = current[activeDraftTargetId] || '';
      const nextValue = existing.trim().length > 0 ? `${existing.trim()}\n${templateValue}` : templateValue;

      return {
        ...current,
        [activeDraftTargetId]: nextValue,
      };
    });
  }

  if (loadingSelection) {
    return (
      <div className="portal-panel flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
          <p className="mt-4 text-stone-600">正在载入作业评分页面</p>
        </div>
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="portal-panel mx-auto max-w-2xl p-10 text-center">
        <h1 className="portal-title text-3xl font-semibold text-stone-900">老师作业评分</h1>
        <p className="mt-4 text-stone-600">当前还没有可评分的课时，请先完成课程配置。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <section className="portal-panel p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-[#8f2017]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
          <button
            type="button"
            onClick={() => setRefreshNonce((current) => current + 1)}
            className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>

        <h1 className="mt-4 text-3xl font-semibold text-stone-900">老师作业评分</h1>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <select
            value={selectedUnitId || ''}
            onChange={(event) => handleUnitChange(Number(event.target.value))}
            className="w-full rounded-2xl border border-[#d9c29b]/60 bg-white px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                第 {unit.unit_index} 单元 · {unit.title}
              </option>
            ))}
          </select>

          <select
            value={selectedLessonId || ''}
            onChange={(event) => setSelectedLessonId(Number(event.target.value))}
            className="w-full rounded-2xl border border-[#d9c29b]/60 bg-white px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                第 {lesson.lesson_index} 课 · {lesson.title}
              </option>
            ))}
          </select>

          <select
            value={selectedTeacherUserId || ''}
            onChange={(event) =>
              setSelectedTeacherUserId(event.target.value ? event.target.value : null)
            }
            className="w-full rounded-2xl border border-[#d9c29b]/60 bg-white px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            {reviewTargets.map((target) => (
              <option key={target.userId} value={target.userId}>
                {target.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => {
            const active = statusFilter === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#8f2017] text-white'
                    : 'border border-[#d9c29b]/55 bg-white text-stone-700 hover:border-[#c58d3e] hover:text-[#8f2017]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {COMMON_REVIEW_TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => applyReviewTemplate(template.value)}
              disabled={!activeDraftTargetId}
              className="rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-3 py-1.5 text-sm text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {template.label}
            </button>
          ))}
        </div>

        {feedback ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
            {feedback}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        {switchingUnit || loadingSubmissions ? (
          <div className="portal-panel flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#8f2017]" />
          </div>
        ) : filteredSubmissions.length > 0 ? (
          filteredSubmissions.map((submission) => (
            <article
              key={submission.id}
              className="portal-panel rounded-[28px] p-5 md:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-stone-900">
                    {submission.assignmentTitle}
                  </h2>
                  <div className="mt-2 text-sm text-stone-600">
                    {submission.studentName}
                    {submission.className ? ` · ${submission.className}` : ''}
                    {submission.studentNumber ? ` · ${submission.studentNumber}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-medium ${
                      REVIEW_STATUS_STYLES[submission.reviewStatus]
                    }`}
                  >
                    {REVIEW_STATUS_LABELS[submission.reviewStatus]}
                  </span>
                  <span className="rounded-full border border-[#d9c29b]/55 bg-white px-3 py-1 text-sm text-stone-700">
                    {typeof submission.teacherScore === 'number'
                      ? `${submission.teacherScore} 分`
                      : '未评分'}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#d9c29b]/45 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                    {submission.responseText || '未填写文字内容'}
                  </div>

                  {submission.attachments.length > 0 ? (
                    <div className="space-y-2">
                      {submission.attachments.map((attachment) => (
                        <a
                          key={attachment.id || attachment.url}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9c29b]/40 bg-white px-4 py-3 text-sm text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                        >
                          <span className="flex items-center gap-3">
                            <AttachmentIcon attachment={attachment} />
                            <span>{attachment.name}</span>
                          </span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-2xl border border-[#d9c29b]/45 bg-white p-4">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={scoreDrafts[submission.id] || ''}
                    onChange={(event) =>
                      setScoreDrafts((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[#d9c29b]/50 bg-[#fffdf8] px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    placeholder="评分 0-100"
                  />

                  <textarea
                    value={reviewDrafts[submission.id] || ''}
                    onFocus={() => setActiveDraftSubmissionId(submission.id)}
                    onChange={(event) =>
                      setReviewDrafts((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
                      }))
                    }
                    rows={8}
                    className="w-full rounded-2xl border border-[#d9c29b]/50 bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    placeholder="老师评语"
                  />

                  <button
                    type="button"
                    onClick={() => saveGrade(submission.id)}
                    disabled={savingSubmissionId === submission.id}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingSubmissionId === submission.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    保存
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="portal-panel px-6 py-12 text-center text-stone-600">
            没有作业
          </div>
        )}
      </section>
    </div>
  );
}
