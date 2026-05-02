import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth';
import LogoutButton from '@/app/teacher/LogoutButton';
import PortalShell from '@/components/portal/PortalShell';
import AiModelConfigButton from '@/components/teacher/AiModelConfigButton';

export default async function ManageLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'admin') {
    redirect('/login/admin');
  }

  return (
    <PortalShell
      roleLabel="管理端"
      userName={user.name}
      actions={
        <>
          <AiModelConfigButton />
          <LogoutButton />
        </>
      }
      hideHeaderMeta
    >
      {children}
    </PortalShell>
  );
}
