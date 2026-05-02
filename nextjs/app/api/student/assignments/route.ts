import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  deleteDirectusFileByAssetUrl,
  uploadDirectusFile,
} from '@/lib/directus-admin';
import {
  getStudentAssignmentSubmissionById,
  replaceStudentAssignmentSubmissionAttachments,
  upsertStudentAssignmentSubmission,
  type StudentAssignmentSubmissionAttachmentInput,
} from '@/lib/student-assignments';
import { toStudentAssignmentReviewPhase } from '@/lib/student-assignment-review';

type AssignmentPayload = {
  lessonId?: number;
  moduleId?: number;
  assignmentKey?: string;
  assignmentSource?: 'standard' | 'teacher_custom';
  standardItemId?: number;
  teacherAssignmentId?: number;
  teacherId?: string | null;
  responseText?: string;
  isCompleted?: boolean;
};

function parsePositiveInt(value: FormDataEntryValue | string | null | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value: FormDataEntryValue | string | null | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return value === 'true' || value === '1';
}

function parseRetainedAttachmentIds(
  value: FormDataEntryValue | null
): number[] | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  } catch {
    return null;
  }
}

function detectAttachmentType(
  file: File
): StudentAssignmentSubmissionAttachmentInput['itemType'] {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
    return 'ppt';
  }

  return 'doc';
}

function isValidPayload(body: AssignmentPayload) {
  return (
    Number.isInteger(body.lessonId) &&
    Number(body.lessonId) > 0 &&
    Number.isInteger(body.moduleId) &&
    Number(body.moduleId) > 0 &&
    typeof body.assignmentKey === 'string' &&
    body.assignmentKey.length > 0 &&
    (body.assignmentSource === 'standard' || body.assignmentSource === 'teacher_custom') &&
    (body.responseText === undefined || typeof body.responseText === 'string') &&
    (body.assignmentSource !== 'standard' ||
      (Number.isInteger(body.standardItemId) && Number(body.standardItemId) > 0)) &&
    (body.assignmentSource !== 'teacher_custom' ||
      (Number.isInteger(body.teacherAssignmentId) && Number(body.teacherAssignmentId) > 0))
  );
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !['student', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let payload: AssignmentPayload;
    let newFiles: File[] = [];
    let retainedAttachmentIds: number[] | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      payload = {
        lessonId: parsePositiveInt(formData.get('lessonId')) || undefined,
        moduleId: parsePositiveInt(formData.get('moduleId')) || undefined,
        assignmentKey: typeof formData.get('assignmentKey') === 'string'
          ? String(formData.get('assignmentKey'))
          : undefined,
        assignmentSource:
          formData.get('assignmentSource') === 'standard' ||
          formData.get('assignmentSource') === 'teacher_custom'
            ? (formData.get('assignmentSource') as 'standard' | 'teacher_custom')
            : undefined,
        standardItemId: parsePositiveInt(formData.get('standardItemId')) || undefined,
        teacherAssignmentId:
          parsePositiveInt(formData.get('teacherAssignmentId')) || undefined,
        teacherId:
          typeof formData.get('teacherId') === 'string'
            ? String(formData.get('teacherId'))
            : null,
        responseText:
          typeof formData.get('responseText') === 'string'
            ? String(formData.get('responseText'))
            : '',
        isCompleted: parseBoolean(formData.get('isCompleted')),
      };

      newFiles = formData
        .getAll('attachments')
        .filter((value): value is File => value instanceof File && value.size > 0);
      retainedAttachmentIds = parseRetainedAttachmentIds(formData.get('retainedAttachmentIds'));
    } else {
      payload = (await request.json()) as AssignmentPayload;
    }

    if (!isValidPayload(payload)) {
      return NextResponse.json({ error: '无效的作业提交数据' }, { status: 400 });
    }

    const normalizedResponseText = (payload.responseText || '').trim();
    if (payload.isCompleted && normalizedResponseText.length === 0) {
      return NextResponse.json(
        { error: '提交作业时至少需要填写文字内容' },
        { status: 400 }
      );
    }

    const record = await upsertStudentAssignmentSubmission({
      studentId: currentUser.id,
      teacherAuthUserId: payload.teacherId || null,
      lessonId: Number(payload.lessonId),
      moduleId: Number(payload.moduleId),
      assignmentKey: payload.assignmentKey!,
      assignmentSource: payload.assignmentSource!,
      standardItemId: payload.standardItemId || null,
      teacherAssignmentId: payload.teacherAssignmentId || null,
      responseText: normalizedResponseText,
      isCompleted: Boolean(payload.isCompleted),
    });

    if (contentType.includes('multipart/form-data')) {
      const existingSubmission = await getStudentAssignmentSubmissionById(record.id);
      const retainedIds =
        retainedAttachmentIds ||
        existingSubmission?.attachments.map((attachment) => attachment.id) ||
        [];
      const uploadedAttachmentInputs: StudentAssignmentSubmissionAttachmentInput[] = [];
      const uploadedFileUrls: string[] = [];

      try {
        for (const file of newFiles) {
          const uploadedUrl = await uploadDirectusFile(
            file,
            `${payload.assignmentKey}-${file.name}`
          );
          uploadedFileUrls.push(uploadedUrl);
          uploadedAttachmentInputs.push({
            fileName: file.name,
            fileUrl: uploadedUrl,
            mimeType: file.type || 'application/octet-stream',
            itemType: detectAttachmentType(file),
            fileSize: file.size,
          });
        }

        const attachmentResult = await replaceStudentAssignmentSubmissionAttachments({
          studentId: currentUser.id,
          submissionId: record.id,
          retainedAttachmentIds: retainedIds,
          newAttachments: uploadedAttachmentInputs,
        });

        for (const removedFileUrl of attachmentResult.removedFileUrls) {
          try {
            await deleteDirectusFileByAssetUrl(removedFileUrl);
          } catch (deleteError) {
            console.error('Failed to delete removed student attachment file:', deleteError);
          }
        }
      } catch (error) {
        for (const uploadedFileUrl of uploadedFileUrls) {
          try {
            await deleteDirectusFileByAssetUrl(uploadedFileUrl);
          } catch (deleteError) {
            console.error('Failed to rollback uploaded student attachment file:', deleteError);
          }
        }

        throw error;
      }
    }

    const submission = await getStudentAssignmentSubmissionById(record.id);
    if (!submission) {
      throw new Error('Missing saved submission');
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        assignmentKey: submission.assignment_key,
        responseText: submission.response_text,
        isCompleted: submission.is_completed,
        completedAt: submission.completed_at,
        reviewStatus: toStudentAssignmentReviewPhase(submission.review_status),
        teacherReviewNote: submission.teacher_review_note,
        teacherScore: submission.teacher_score,
        reviewedAt: submission.reviewed_at,
        attachments: submission.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.file_name,
          fileUrl: attachment.file_url,
          mimeType: attachment.mime_type,
          itemType: attachment.item_type,
          size: attachment.file_size,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to save student assignment submission:', error);
    return NextResponse.json({ error: '保存作业失败' }, { status: 500 });
  }
}
