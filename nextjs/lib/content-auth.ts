import 'server-only';
import { getCurrentUser } from '@/lib/auth';

export async function requireContentManager() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return user;
}
