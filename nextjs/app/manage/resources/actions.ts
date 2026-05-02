'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';

async function updateResourceStatus(resourceId: number, status: 'approved' | 'rejected' | 'pending') {
  await query('update resources set status = $1 where id = $2', [status, resourceId]);
  revalidatePath('/manage/resources');
  revalidatePath('/manage');
}

export async function approveResourceAction(formData: FormData) {
  const resourceId = Number(formData.get('resourceId'));
  if (!resourceId) return;
  await updateResourceStatus(resourceId, 'approved');
}

export async function rejectResourceAction(formData: FormData) {
  const resourceId = Number(formData.get('resourceId'));
  if (!resourceId) return;
  await updateResourceStatus(resourceId, 'rejected');
}

export async function resetResourceAction(formData: FormData) {
  const resourceId = Number(formData.get('resourceId'));
  if (!resourceId) return;
  await updateResourceStatus(resourceId, 'pending');
}
