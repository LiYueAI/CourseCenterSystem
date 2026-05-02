'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LockKeyhole, Mail, MessageCircle, School, Smartphone, User, Users } from 'lucide-react';
import PortalShell from '@/components/portal/PortalShell';
import { usePlatformSettings } from '@/components/platform/PlatformSettingsProvider';

interface RegisterFormProps {
  role: 'teacher' | 'student';
  roleLabel: string;
  roleDescription: string;
  compact?: boolean;
}

const ROLE_REDIRECTS = {
  teacher: '/teacher',
  student: '/student',
} as const;

export default function RegisterForm({
  role,
  roleLabel,
  roleDescription,
  compact = false,
}: RegisterFormProps) {
  const router = useRouter();
  const settings = usePlatformSettings();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    class_code: '',
    school: '',
    subject: '',
    grade_level: '',
    class_name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const resolvedRoleDescription =
    settings.register.roleDescriptions[role] || roleDescription;
  const highlights = settings.register.roleHighlights[role] || [];
  const submitLabel =
    settings.register.buttonLabels[role] || '创建账号';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          role,
        }),
      });

      const data = await res.json().catch(() => ({ error: '注册失败，请稍后重试' }));

      if (!res.ok) {
        setError(data.error || '注册失败，请稍后重试');
        return;
      }

      router.push(ROLE_REDIRECTS[role]);
      router.refresh();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalShell roleLabel={`${roleLabel}注册`}>
      <div
        className={
          compact
            ? 'mx-auto max-w-[500px]'
            : 'grid items-stretch gap-8 lg:grid-cols-[minmax(0,1fr)_500px] lg:gap-10'
        }
      >
        {!compact ? (
          <section className="flex items-center justify-center">
            <div className="w-full max-w-[760px] text-center">
              <div className="inline-flex items-center rounded-full border border-[#d9c29b]/55 bg-white/70 px-4 py-2 text-sm tracking-[0.2em] text-stone-700">
                {settings.register.marketingBadge}
              </div>
              <h1 className="portal-title mt-8 text-4xl font-semibold leading-[1.14] text-stone-900 sm:text-5xl md:text-6xl">
                <span className="block">{settings.register.marketingTitlePrimary}</span>
                <span className="mt-2 block text-[0.82em] tracking-[0.18em] text-[#8f2017]">
                  {settings.register.marketingTitleSecondary}
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-[620px] text-lg leading-9 text-stone-700">
                {resolvedRoleDescription}
              </p>
              <div className="mx-auto mt-5 h-px w-28 bg-[linear-gradient(90deg,transparent,rgba(143,32,23,0.35),rgba(197,154,93,0.75),rgba(143,32,23,0.35),transparent)]" />

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {highlights.map((item) => (
                  <div key={item} className="portal-panel p-5">
                    <div className="relative flex flex-col items-center text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="mt-4 text-sm leading-7 text-stone-700">{item}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="portal-panel p-8 md:p-10">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center rounded-full border border-[#d9c29b]/55 bg-white/75 px-3 py-1.5 text-xs tracking-[0.2em] text-stone-600">
              {roleLabel}
            </div>
            <h2 className="portal-title mt-5 text-3xl font-semibold text-stone-900">注册平台账号</h2>
            {!compact ? (
              <p className="mx-auto mt-3 max-w-[360px] text-sm leading-7 text-stone-600">
                {settings.register.formIntro}
              </p>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-stone-700">姓名</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                <User className="h-5 w-5 text-stone-400" />
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="请输入姓名"
                  required
                  className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-stone-700">手机号</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                <Smartphone className="h-5 w-5 text-stone-400" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="请输入手机号"
                  required
                  className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-stone-700">邮箱（选填）</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                <Mail className="h-5 w-5 text-stone-400" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="已有邮箱账号可填写"
                  className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-stone-700">密码</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                <LockKeyhole className="h-5 w-5 text-stone-400" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="至少 6 位"
                  required
                  minLength={6}
                  className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                />
              </div>
            </label>

            {role === 'student' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-700">班级编码</span>
                <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                  <Users className="h-5 w-5 text-stone-400" />
                  <input
                    type="text"
                  value={form.class_code}
                  onChange={(e) => updateField('class_code', e.target.value.toUpperCase())}
                  placeholder="填写老师提供的班级编码"
                  maxLength={16}
                  required
                  className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                />
                </div>
                <p className="mt-2 text-xs leading-6 text-stone-500">
                  学生使用老师提供的班级编码注册入班。
                </p>
              </label>
            ) : null}

            {role === 'teacher' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-700">学校</span>
                <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                  <School className="h-5 w-5 text-stone-400" />
                  <input
                    type="text"
                    value={form.school}
                    onChange={(e) => updateField('school', e.target.value)}
                    placeholder="请输入学校名称"
                    required
                    className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                  />
                </div>
              </label>
            ) : null}

            {role === 'teacher' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-700">学科</span>
                <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                  <Users className="h-5 w-5 text-stone-400" />
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => updateField('subject', e.target.value)}
                    placeholder="如音乐、科学、综合实践"
                    required
                    className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                  />
                </div>
              </label>
            ) : null}

            {role === 'teacher' ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-stone-700">年级</span>
                  <input
                    type="text"
                    value={form.grade_level}
                    onChange={(e) => updateField('grade_level', e.target.value)}
                    placeholder="如三年级、初一"
                    required
                    className="w-full rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 text-stone-900 outline-none placeholder:text-stone-400 shadow-[0_8px_20px_rgba(89,52,25,0.04)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-stone-700">班级</span>
                  <input
                    type="text"
                    value={form.class_name}
                    onChange={(e) => updateField('class_name', e.target.value)}
                    placeholder="如一班、2班"
                    required
                    className="w-full rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 text-stone-900 outline-none placeholder:text-stone-400 shadow-[0_8px_20px_rgba(89,52,25,0.04)]"
                  />
                </label>
              </div>
            ) : null}

            {role === 'teacher' ? (
              <p className="rounded-2xl border border-[#d9c29b]/45 bg-[#fff8eb] px-4 py-3 text-xs leading-6 text-stone-600">
                注册成功后，系统会自动生成 16 位班级编码，使用大写字母和数字，不含 0、1、4、I、O。老师复制给学生即可入班。
              </p>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-3.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_26px_rgba(127,23,18,0.24)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    注册中...
                  </>
                ) : (
                  submitLabel
                )}
              </button>
          </form>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dbc7a6] bg-[#f9f4ea] px-4 py-3 text-sm text-stone-400"
            >
              <MessageCircle className="h-4 w-4" />
              微信注册（敬请期待）
            </button>
            <p className="text-center text-xs leading-6 text-stone-500">
              邮箱只是兼容项，不填也可以注册。
            </p>
          </div>

          <div className="mt-6 text-center">
            <div className="mb-3 text-sm text-stone-500">
              已有账号？
              <Link
                href={`/login/${role}`}
                className="ml-2 font-medium text-[#8f2017] transition-colors hover:text-[#b83226]"
              >
                返回登录
              </Link>
            </div>
            <Link href="/" className="text-sm text-stone-500 transition-colors hover:text-[#8f2017]">
              返回首页
            </Link>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
