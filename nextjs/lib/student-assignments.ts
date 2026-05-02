import 'server-only';

import { getLessons, getModules } from '@/lib/directus';
import { query, queryOne } from '@/lib/db';
import { resolveAssetUrl } from '@/lib/media-url';
import { resolvePrimaryTeacherForStudent } from '@/lib/school-classroom';
import { type StudentAssignmentReviewStatus } from '@/lib/student-assignment-review';
import {
  ensureTeacherPlanTables,
  listTeacherStudentAssignments,
} from '@/lib/teacher-plan';

export interface StudentAssignmentSubmissionRecord {
  id: string;
  student_id: string;
  teacher_auth_user_id: string | null;
  lesson_id: number;
  module_id: number;
  assignment_key: string;
  assignment_source: 'standard' | 'teacher_custom';
  standard_item_id: number | null;
  teacher_assignment_id: number | null;
  response_text: string;
  is_completed: boolean;
  completed_at: string | null;
  review_status: StudentAssignmentReviewStatus;
  teacher_review_note: string;
  teacher_score: number | null;
  reviewer_auth_user_id: string | null;
  reviewed_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StudentAssignmentSubmissionAttachmentRecord {
  id: number;
  submission_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  item_type: 'audio' | 'video' | 'image' | 'doc' | 'ppt';
  file_size: number;
  created_at?: string;
}

export interface StudentAssignmentSubmissionWithAttachments
  extends StudentAssignmentSubmissionRecord {
  attachments: StudentAssignmentSubmissionAttachmentRecord[];
}

export interface StudentAssignmentSubmissionInput {
  studentId: string;
  teacherAuthUserId?: string | null;
  lessonId: number;
  moduleId: number;
  assignmentKey: string;
  assignmentSource: 'standard' | 'teacher_custom';
  standardItemId?: number | null;
  teacherAssignmentId?: number | null;
  responseText?: string;
  isCompleted?: boolean;
}

export interface StudentAssignmentSubmissionAttachmentInput {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  itemType: 'audio' | 'video' | 'image' | 'doc' | 'ppt';
  fileSize: number;
}

export interface StudentAssignmentReviewInput {
  ownerTeacherAuthUserId: string;
  reviewerAuthUserId: string;
  submissionId: string;
  teacherScore: number;
  teacherReviewNote?: string;
}

export interface StudentAssignmentBatchReviewInput {
  ownerTeacherAuthUserId: string;
  reviewerAuthUserId: string;
  submissionIds: string[];
  teacherScore: number;
  teacherReviewNote?: string;
}

type TeacherSubmissionRow = StudentAssignmentSubmissionRecord & {
  student_name: string | null;
  student_email: string | null;
};

export interface TeacherAssignmentSubmissionRecord
  extends StudentAssignmentSubmissionWithAttachments {
  studentName: string;
  studentEmail: string;
  assignmentTitle: string;
  assignmentContent: string;
  moduleName: string;
  moduleIndex: number;
}

let initialized = false;
let progressInitialized = false;

function normalizeReviewStatus(
  isCompleted: boolean
): StudentAssignmentReviewStatus {
  return isCompleted ? 'pending' : 'draft';
}

function normalizeTeacherReviewNote(teacherReviewNote?: string): string {
  return (teacherReviewNote || '').trim();
}

function uniquePositiveIntegers(values: number[]): number[] {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0))
  );
}

function normalizeSubmissionIds(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

function normalizeAttachment(
  attachment: StudentAssignmentSubmissionAttachmentRecord
): StudentAssignmentSubmissionAttachmentRecord {
  return {
    ...attachment,
    file_url: resolveAssetUrl(attachment.file_url),
  };
}

function buildAttachmentMap(
  attachments: StudentAssignmentSubmissionAttachmentRecord[]
): Map<string, StudentAssignmentSubmissionAttachmentRecord[]> {
  const grouped = new Map<string, StudentAssignmentSubmissionAttachmentRecord[]>();

  for (const attachment of attachments) {
    const current = grouped.get(attachment.submission_id) || [];
    current.push(normalizeAttachment(attachment));
    grouped.set(attachment.submission_id, current);
  }

  return grouped;
}

async function listSubmissionAttachmentsByIds(
  submissionIds: string[]
): Promise<StudentAssignmentSubmissionAttachmentRecord[]> {
  await ensureStudentAssignmentTables();

  if (submissionIds.length === 0) {
    return [];
  }

  return query<StudentAssignmentSubmissionAttachmentRecord>(
    `
      select
        id,
        submission_id,
        file_name,
        file_url,
        mime_type,
        item_type,
        file_size,
        created_at
      from student_assignment_submission_files
      where submission_id = any($1::uuid[])
      order by created_at asc, id asc
    `,
    [submissionIds]
  );
}

async function attachSubmissionFiles<T extends StudentAssignmentSubmissionRecord>(
  submissions: T[]
): Promise<Array<T & { attachments: StudentAssignmentSubmissionAttachmentRecord[] }>> {
  const attachments = await listSubmissionAttachmentsByIds(submissions.map((item) => item.id));
  const attachmentMap = buildAttachmentMap(attachments);

  return submissions.map((submission) => ({
    ...submission,
    attachments: attachmentMap.get(submission.id) || [],
  }));
}

export async function ensureStudentProgressTables() {
  if (progressInitialized) {
    return;
  }

  await query(`
    create table if not exists student_progress (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references auth_users(id) on delete cascade,
      lesson_id integer not null,
      completed_items integer[] default '{}',
      item_progress jsonb default '{}',
      current_star_count integer default 0,
      last_accessed timestamptz default now(),
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(student_id, lesson_id)
    );

    create index if not exists idx_student_progress_student_id
      on student_progress(student_id);
    create index if not exists idx_student_progress_lesson_id
      on student_progress(lesson_id);
  `);

  progressInitialized = true;
}

export async function ensureStudentAssignmentTables() {
  if (initialized) {
    return;
  }

  await query(`
    create table if not exists student_assignment_submissions (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references auth_users(id) on delete cascade,
      teacher_auth_user_id varchar(255),
      lesson_id integer not null,
      module_id integer not null,
      assignment_key text not null,
      assignment_source varchar(50) not null,
      standard_item_id integer,
      teacher_assignment_id integer,
      response_text text not null default '',
      is_completed boolean not null default false,
      completed_at timestamptz,
      review_status varchar(50) not null default 'draft',
      teacher_review_note text not null default '',
      teacher_score integer,
      reviewer_auth_user_id varchar(255),
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(student_id, assignment_key)
    );

    alter table student_assignment_submissions
      add column if not exists review_status varchar(50) not null default 'draft',
      add column if not exists teacher_review_note text not null default '',
      add column if not exists teacher_score integer,
      add column if not exists reviewer_auth_user_id varchar(255),
      add column if not exists reviewed_at timestamptz;

    update student_assignment_submissions
    set
      review_status = case when is_completed then 'pending' else 'draft' end,
      teacher_review_note = coalesce(teacher_review_note, ''),
      teacher_score = case when review_status in ('approved', 'rejected') then teacher_score else null end
    where review_status is null
       or review_status = '';

    create index if not exists idx_student_assignment_submissions_student_lesson
      on student_assignment_submissions (student_id, lesson_id, module_id);

    create index if not exists idx_student_assignment_submissions_teacher_lesson
      on student_assignment_submissions (teacher_auth_user_id, lesson_id, module_id);

    create table if not exists student_assignment_submission_files (
      id serial primary key,
      submission_id uuid not null references student_assignment_submissions(id) on delete cascade,
      file_name text not null,
      file_url text not null,
      mime_type text not null default '',
      item_type varchar(50) not null,
      file_size bigint not null default 0,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_student_assignment_submission_files_submission
      on student_assignment_submission_files (submission_id, created_at asc, id asc);
  `);

  initialized = true;
}

export async function resolveDefaultLessonId(studentId: string): Promise<number | null> {
  await ensureStudentProgressTables();

  const progress = await queryOne<{ lesson_id: number }>(
    `
      select lesson_id
      from student_progress
      where student_id = $1
      order by last_accessed desc nulls last, updated_at desc nulls last
      limit 1
    `,
    [studentId]
  );

  if (progress?.lesson_id) {
    return progress.lesson_id;
  }

  const lessons = await getLessons();
  return lessons[0]?.id || null;
}

export async function resolveTeacherContextForLesson(
  studentId: string,
  lessonId: number,
  requestedTeacherId?: string | null
): Promise<string | null> {
  await ensureTeacherPlanTables();

  if (requestedTeacherId) {
    return requestedTeacherId;
  }

  const assignmentOwner = await queryOne<{ auth_user_id: string }>(
    `
      select auth_user_id
      from teacher_student_assignments
      where lesson_id = $1
      order by updated_at desc, id desc
      limit 1
    `,
    [lessonId]
  );

  if (assignmentOwner?.auth_user_id) {
    return assignmentOwner.auth_user_id;
  }

  const planOwner = await queryOne<{ auth_user_id: string }>(
    `
      select auth_user_id
      from teacher_lesson_plan_items
      where lesson_id = $1
      order by created_at desc, id desc
      limit 1
    `,
    [lessonId]
  );

  if (planOwner?.auth_user_id) {
    return planOwner.auth_user_id;
  }

  const linkedTeacherId = await resolvePrimaryTeacherForStudent(studentId);
  return linkedTeacherId || null;
}

export async function listStudentAssignmentSubmissions(
  studentId: string,
  lessonId: number
): Promise<StudentAssignmentSubmissionWithAttachments[]> {
  await ensureStudentAssignmentTables();

  const submissions = await query<StudentAssignmentSubmissionRecord>(
    `
      select
        id,
        student_id,
        teacher_auth_user_id,
        lesson_id,
        module_id,
        assignment_key,
        assignment_source,
        standard_item_id,
        teacher_assignment_id,
        response_text,
        is_completed,
        completed_at,
        review_status,
        teacher_review_note,
        teacher_score,
        reviewer_auth_user_id,
        reviewed_at,
        created_at,
        updated_at
      from student_assignment_submissions
      where student_id = $1
        and lesson_id = $2
      order by module_id asc, updated_at desc, created_at desc
    `,
    [studentId, lessonId]
  );

  return attachSubmissionFiles(submissions);
}

export async function getStudentAssignmentSubmissionById(
  submissionId: string
): Promise<StudentAssignmentSubmissionWithAttachments | null> {
  await ensureStudentAssignmentTables();

  const submission = await queryOne<StudentAssignmentSubmissionRecord>(
    `
      select
        id,
        student_id,
        teacher_auth_user_id,
        lesson_id,
        module_id,
        assignment_key,
        assignment_source,
        standard_item_id,
        teacher_assignment_id,
        response_text,
        is_completed,
        completed_at,
        review_status,
        teacher_review_note,
        teacher_score,
        reviewer_auth_user_id,
        reviewed_at,
        created_at,
        updated_at
      from student_assignment_submissions
      where id = $1
    `,
    [submissionId]
  );

  if (!submission) {
    return null;
  }

  const [submissionWithAttachments] = await attachSubmissionFiles([submission]);
  return submissionWithAttachments || null;
}

export async function upsertStudentAssignmentSubmission(
  input: StudentAssignmentSubmissionInput
): Promise<StudentAssignmentSubmissionRecord> {
  await ensureStudentAssignmentTables();

  const isCompleted = Boolean(input.isCompleted);
  const reviewStatus = normalizeReviewStatus(isCompleted);

  const record = await queryOne<StudentAssignmentSubmissionRecord>(
    `
      insert into student_assignment_submissions (
        student_id,
        teacher_auth_user_id,
        lesson_id,
        module_id,
        assignment_key,
        assignment_source,
        standard_item_id,
        teacher_assignment_id,
        response_text,
        is_completed,
        completed_at,
        review_status,
        teacher_review_note,
        teacher_score,
        reviewer_auth_user_id,
        reviewed_at,
        updated_at
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        case when $10 then now() else null end,
        $11,
        '',
        null,
        null,
        null,
        now()
      )
      on conflict (student_id, assignment_key)
      do update set
        teacher_auth_user_id = excluded.teacher_auth_user_id,
        lesson_id = excluded.lesson_id,
        module_id = excluded.module_id,
        assignment_source = excluded.assignment_source,
        standard_item_id = excluded.standard_item_id,
        teacher_assignment_id = excluded.teacher_assignment_id,
        response_text = excluded.response_text,
        is_completed = excluded.is_completed,
        completed_at = case when excluded.is_completed then now() else null end,
        review_status = excluded.review_status,
        teacher_review_note = '',
        teacher_score = null,
        reviewer_auth_user_id = null,
        reviewed_at = null,
        updated_at = now()
      returning
        id,
        student_id,
        teacher_auth_user_id,
        lesson_id,
        module_id,
        assignment_key,
        assignment_source,
        standard_item_id,
        teacher_assignment_id,
        response_text,
        is_completed,
        completed_at,
        review_status,
        teacher_review_note,
        teacher_score,
        reviewer_auth_user_id,
        reviewed_at,
        created_at,
        updated_at
    `,
    [
      input.studentId,
      input.teacherAuthUserId || null,
      input.lessonId,
      input.moduleId,
      input.assignmentKey,
      input.assignmentSource,
      input.standardItemId || null,
      input.teacherAssignmentId || null,
      input.responseText || '',
      isCompleted,
      reviewStatus,
    ]
  );

  if (!record) {
    throw new Error('Failed to save student assignment submission');
  }

  return record;
}

export async function replaceStudentAssignmentSubmissionAttachments(params: {
  studentId: string;
  submissionId: string;
  retainedAttachmentIds: number[];
  newAttachments: StudentAssignmentSubmissionAttachmentInput[];
}): Promise<{
  attachments: StudentAssignmentSubmissionAttachmentRecord[];
  removedFileUrls: string[];
}> {
  await ensureStudentAssignmentTables();

  const existingAttachments = await query<StudentAssignmentSubmissionAttachmentRecord>(
    `
      select
        files.id,
        files.submission_id,
        files.file_name,
        files.file_url,
        files.mime_type,
        files.item_type,
        files.file_size,
        files.created_at
      from student_assignment_submission_files files
      inner join student_assignment_submissions submissions
        on submissions.id = files.submission_id
      where submissions.student_id = $1
        and files.submission_id = $2
      order by files.created_at asc, files.id asc
    `,
    [params.studentId, params.submissionId]
  );

  const retainedIds = new Set(uniquePositiveIntegers(params.retainedAttachmentIds));
  const attachmentsToDelete = existingAttachments.filter(
    (attachment) => !retainedIds.has(attachment.id)
  );
  const keptAttachments = existingAttachments
    .filter((attachment) => retainedIds.has(attachment.id))
    .map(normalizeAttachment);

  if (attachmentsToDelete.length > 0) {
    await query(
      `
        delete from student_assignment_submission_files
        where submission_id = $1
          and id = any($2::int[])
      `,
      [params.submissionId, attachmentsToDelete.map((attachment) => attachment.id)]
    );
  }

  const insertedAttachments: StudentAssignmentSubmissionAttachmentRecord[] = [];

  for (const attachment of params.newAttachments) {
    const inserted = await queryOne<StudentAssignmentSubmissionAttachmentRecord>(
      `
        insert into student_assignment_submission_files (
          submission_id,
          file_name,
          file_url,
          mime_type,
          item_type,
          file_size
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          id,
          submission_id,
          file_name,
          file_url,
          mime_type,
          item_type,
          file_size,
          created_at
      `,
      [
        params.submissionId,
        attachment.fileName,
        attachment.fileUrl,
        attachment.mimeType,
        attachment.itemType,
        attachment.fileSize,
      ]
    );

    if (inserted) {
      insertedAttachments.push(normalizeAttachment(inserted));
    }
  }

  return {
    attachments: [...keptAttachments, ...insertedAttachments],
    removedFileUrls: attachmentsToDelete.map((attachment) => attachment.file_url),
  };
}

export async function listTeacherAssignmentSubmissions(
  teacherAuthUserId: string,
  lessonId: number
): Promise<TeacherAssignmentSubmissionRecord[]> {
  await ensureStudentAssignmentTables();
  await ensureTeacherPlanTables();

  const [rows, modules, teacherAssignments] = await Promise.all([
    query<TeacherSubmissionRow>(
      `
        select
          submissions.id,
          submissions.student_id,
          submissions.teacher_auth_user_id,
          submissions.lesson_id,
          submissions.module_id,
          submissions.assignment_key,
          submissions.assignment_source,
          submissions.standard_item_id,
          submissions.teacher_assignment_id,
          submissions.response_text,
          submissions.is_completed,
          submissions.completed_at,
          submissions.review_status,
          submissions.teacher_review_note,
          submissions.teacher_score,
          submissions.reviewer_auth_user_id,
          submissions.reviewed_at,
          submissions.created_at,
          submissions.updated_at,
          students.name as student_name,
          auth_users.email as student_email
        from student_assignment_submissions submissions
        left join students
          on students.user_id = submissions.student_id
        left join auth_users
          on auth_users.id = submissions.student_id
        where submissions.teacher_auth_user_id = $1
          and submissions.lesson_id = $2
          and submissions.is_completed = true
        order by submissions.module_id asc, submissions.updated_at desc, submissions.created_at desc
      `,
      [teacherAuthUserId, lessonId]
    ),
    getModules(lessonId),
    listTeacherStudentAssignments(teacherAuthUserId, lessonId),
  ]);

  const submissions = await attachSubmissionFiles(rows);
  const moduleMap = new Map(
    modules.map((module) => [
      module.id,
      {
        moduleName: module.module_name,
        moduleIndex: module.module_index,
      },
    ])
  );
  const standardItemMap = new Map<
    number,
    {
      title: string;
      content: string;
    }
  >();

  for (const module of modules) {
    for (const item of module.items || []) {
      standardItemMap.set(item.id, {
        title: item.title,
        content: item.student_activity?.trim() || '',
      });
    }
  }

  const teacherAssignmentMap = new Map(
    teacherAssignments.map((assignment) => [
      assignment.id,
      {
        title: assignment.title,
        content: assignment.description,
      },
    ])
  );

  return submissions.map((submission) => {
    const moduleInfo = moduleMap.get(submission.module_id);
    const standardItem = submission.standard_item_id
      ? standardItemMap.get(submission.standard_item_id)
      : null;
    const teacherAssignment = submission.teacher_assignment_id
      ? teacherAssignmentMap.get(submission.teacher_assignment_id)
      : null;

    return {
      ...submission,
      studentName: submission.student_name?.trim() || '未命名学生',
      studentEmail: submission.student_email || '',
      assignmentTitle:
        teacherAssignment?.title ||
        standardItem?.title ||
        submission.assignment_key,
      assignmentContent:
        teacherAssignment?.content ||
        standardItem?.content ||
        '',
      moduleName: moduleInfo?.moduleName || `模块 ${submission.module_id}`,
      moduleIndex: moduleInfo?.moduleIndex || submission.module_id,
    };
  });
}

export async function reviewStudentAssignmentSubmission(
  input: StudentAssignmentReviewInput
): Promise<StudentAssignmentSubmissionWithAttachments> {
  const submissions = await reviewStudentAssignmentSubmissions({
    ownerTeacherAuthUserId: input.ownerTeacherAuthUserId,
    reviewerAuthUserId: input.reviewerAuthUserId,
    submissionIds: [input.submissionId],
    teacherScore: input.teacherScore,
    teacherReviewNote: input.teacherReviewNote,
  });

  const [submission] = submissions;
  if (!submission) {
    throw new Error('Submission not found');
  }

  return submission;
}

export async function reviewStudentAssignmentSubmissions(
  input: StudentAssignmentBatchReviewInput
): Promise<StudentAssignmentSubmissionWithAttachments[]> {
  await ensureStudentAssignmentTables();

  const submissionIds = normalizeSubmissionIds(input.submissionIds);
  if (submissionIds.length === 0) {
    throw new Error('No submission IDs provided');
  }

  const normalizedNote = normalizeTeacherReviewNote(input.teacherReviewNote);

  const updated = await query<StudentAssignmentSubmissionRecord>(
    `
      update student_assignment_submissions
      set
        review_status = 'approved',
        teacher_score = $3,
        teacher_review_note = $4,
        reviewer_auth_user_id = $2,
        reviewed_at = now(),
        updated_at = now()
      where id = any($5::uuid[])
        and teacher_auth_user_id = $1
        and is_completed = true
      returning
        id,
        student_id,
        teacher_auth_user_id,
        lesson_id,
        module_id,
        assignment_key,
        assignment_source,
        standard_item_id,
        teacher_assignment_id,
        response_text,
        is_completed,
        completed_at,
        review_status,
        teacher_review_note,
        teacher_score,
        reviewer_auth_user_id,
        reviewed_at,
        created_at,
        updated_at
    `,
    [
      input.ownerTeacherAuthUserId,
      input.reviewerAuthUserId,
      input.teacherScore,
      normalizedNote,
      submissionIds,
    ]
  );

  if (updated.length !== submissionIds.length) {
    throw new Error('Some submissions were not found');
  }

  const submissions = await attachSubmissionFiles(updated);
  const orderMap = new Map(submissionIds.map((id, index) => [id, index]));

  return submissions.sort(
    (left, right) =>
      (orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
}
