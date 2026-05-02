import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ManageClassroomMembershipsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'admin') {
    redirect('/login/admin');
  }

  redirect('/manage/classrooms');
}
