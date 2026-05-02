import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export async function POST() {
  await clearAuthCookie();

  const response = NextResponse.json({ success: true });
  response.cookies.delete('directus_session_token');
  return response;
}
