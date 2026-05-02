import { ensureDefaultPlaceholderCourses } from '@/lib/directus-admin';
import TeacherPageClient from './TeacherPageClient';

export const dynamic = 'force-dynamic';

export default async function TeacherPage() {
  await ensureDefaultPlaceholderCourses();

  return <TeacherPageClient />;
}
