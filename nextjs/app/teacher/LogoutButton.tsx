'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (e) {
      console.error('Logout failed', e);
    }
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/75 px-4 py-2 text-sm text-stone-600 shadow-[0_8px_20px_rgba(89,52,25,0.05)] transition-all hover:border-[#b83226]/30 hover:text-[#8f2017]"
      title="退出登录"
    >
      <LogOut className="w-4 h-4" />
      <span className="hidden sm:inline">退出</span>
    </button>
  );
}
