import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ensureStudentProgressTables } from '@/lib/student-assignments';

interface ProgressRow {
  id: string;
  student_id: string;
  lesson_id: number;
  completed_items: number[];
  item_progress: Record<string, { position: number; completed: boolean; updatedAt: string }>;
  current_star_count: number;
  last_accessed: string;
}

interface ProgressResponse {
  lesson_id: number;
  completed_items: number[];
  current_star_count: number;
  last_accessed: string;
  item_progress?: Record<string, { position: number; completed: boolean; updatedAt: string }>;
}

// GET /api/student/progress?lesson_id=X
export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser || (currentUser.role !== 'student' && currentUser.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const lessonId = searchParams.get('lesson_id');

  try {
    await ensureStudentProgressTables();

    if (lessonId) {
      // Get specific lesson progress
      const progress = await queryOne<ProgressRow>(
        'SELECT * FROM student_progress WHERE student_id = $1 AND lesson_id = $2',
        [currentUser.id, parseInt(lessonId)]
      );

      if (!progress) {
        return NextResponse.json({
          lesson_id: parseInt(lessonId),
          completed_items: [],
          current_star_count: 0,
          last_accessed: null
        });
      }

      return NextResponse.json({
        lesson_id: progress.lesson_id,
        completed_items: progress.completed_items || [],
        item_progress: progress.item_progress || {},
        current_star_count: progress.current_star_count || 0,
        last_accessed: progress.last_accessed
      });
    } else {
      // Get all progress for the student
      const progressList = await query<ProgressRow>(
        'SELECT * FROM student_progress WHERE student_id = $1 ORDER BY last_accessed DESC',
        [currentUser.id]
      );

      return NextResponse.json({
        progress: progressList.map(p => ({
          lesson_id: p.lesson_id,
          completed_items: p.completed_items || [],
          item_progress: p.item_progress || {},
          current_star_count: p.current_star_count || 0,
          last_accessed: p.last_accessed
        }))
      });
    }
  } catch (error) {
    console.error('Failed to fetch progress:', error);
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}

// PATCH /api/student/progress - Update progress
export async function PATCH(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser || (currentUser.role !== 'student' && currentUser.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureStudentProgressTables();

    const body = await request.json();
    const { lesson_id, completed_items, current_star_count, item_progress } = body;

    if (!lesson_id) {
      return NextResponse.json({ error: 'lesson_id is required' }, { status: 400 });
    }

    // Get existing progress to merge item_progress
    let existingItemProgress: Record<string, { position: number; completed: boolean; updatedAt: string }> = {};
    if (item_progress) {
      const existing = await queryOne<ProgressRow>(
        'SELECT item_progress FROM student_progress WHERE student_id = $1 AND lesson_id = $2',
        [currentUser.id, lesson_id]
      );
      if (existing?.item_progress) {
        existingItemProgress = existing.item_progress;
      }
      // Merge new item_progress with existing
      existingItemProgress = { ...existingItemProgress, ...item_progress };
    }

    // Upsert progress
    await query(`
      INSERT INTO student_progress (student_id, lesson_id, completed_items, item_progress, current_star_count, last_accessed, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (student_id, lesson_id)
      DO UPDATE SET
        completed_items = COALESCE($3, student_progress.completed_items),
        item_progress = COALESCE($4, student_progress.item_progress),
        current_star_count = COALESCE($5, student_progress.current_star_count),
        last_accessed = NOW(),
        updated_at = NOW()
    `, [
      currentUser.id,
      lesson_id,
      completed_items ? `{${completed_items.join(',')}}` : null,
      item_progress ? JSON.stringify(existingItemProgress) : null,
      current_star_count ?? null
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update progress:', error);
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
  }
}
