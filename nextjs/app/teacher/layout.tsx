import { redirect } from 'next/navigation';
import { getCurrentAccessContext } from '@/lib/access-context';
import LogoutButton from './LogoutButton';
import PortalShell from '@/components/portal/PortalShell';

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getCurrentAccessContext();

  if (!access || (!access.isTeacher && !access.isAdmin)) {
    redirect('/login/teacher');
  }

  return (
    <PortalShell
      roleLabel="教师端"
      userName={access.user.name}
      actions={<LogoutButton />}
      hideHeaderMeta
    >
      {children}
    </PortalShell>
  );
}
