import { NextResponse } from 'next/server';
import { getCurrentAccessContext } from '@/lib/access-context';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await getCurrentAccessContext();
  if (!access) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  const { user } = access;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name,
      access: {
        primaryRole: access.primaryRole,
        isAdmin: access.isAdmin,
        isTeacher: access.isTeacher,
        isStudent: access.isStudent,
        capabilityKeys: access.capabilityKeys,
        teacherProfile: access.teacherProfile,
        teacherCapabilities: access.teacherCapabilities,
      },
    },
  });
}
