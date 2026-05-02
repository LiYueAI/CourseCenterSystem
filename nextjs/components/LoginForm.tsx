"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Smartphone,
  Star,
} from "lucide-react";
import PortalShell from "@/components/portal/PortalShell";
import { usePlatformSettings } from "@/components/platform/PlatformSettingsProvider";

interface LoginFormProps {
  role: "teacher" | "admin" | "student";
  roleLabel: string;
  hideLeftPanel?: boolean;
}

type LoginMode = "phone" | "email";

export default function LoginForm({
  role,
  roleLabel,
  hideLeftPanel,
}: LoginFormProps) {
  const router = useRouter();
  const settings = usePlatformSettings();
  const isPhoneFirstRole = role === "teacher" || role === "student";
  const [loginMode, setLoginMode] = useState<LoginMode>(
    isPhoneFirstRole ? "phone" : "email",
  );
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const highlights = settings.login.roleHighlights[role] || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = !isPhoneFirstRole
        ? {
            email: email.trim(),
            password,
          }
        : loginMode === "phone"
          ? {
              phone: phone.trim(),
              password,
              login_type: "phone",
              role,
            }
          : {
              email: email.trim(),
              password,
              login_type: "email",
              role,
            };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }

      const redirectMap: Record<string, string> = {
        teacher: "/teacher",
        admin: "/manage",
        student: "/student",
      };

      const redirectTo =
        typeof window !== "undefined"
          ? new URL(window.location.href).searchParams.get("redirect")
          : null;

      router.push(redirectTo || redirectMap[data.user.role] || "/");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalShell roleLabel={`${roleLabel}登录`} hideHeaderMeta={hideLeftPanel}>
      <div
        className={`grid items-stretch gap-8 ${hideLeftPanel ? "lg:grid-cols-[460px] justify-center" : "lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-10"}`}
      >
        {!hideLeftPanel && (
          <section className="flex items-center justify-center">
            <div className="w-full max-w-[760px] text-center">
              <div className="inline-flex items-center rounded-full border border-[#d9c29b]/55 bg-white/70 px-4 py-2 text-sm tracking-[0.2em] text-stone-700">
                {settings.login.marketingBadge}
              </div>
              <h1 className="portal-title mt-8 text-4xl font-semibold leading-[1.14] text-stone-900 sm:text-5xl md:text-6xl">
                <span className="block">
                  {settings.login.marketingTitlePrimary}
                </span>
                <span className="mt-2 block text-[0.82em] tracking-[0.18em] text-[#8f2017]">
                  {settings.login.marketingTitleSecondary}
                </span>
              </h1>
              <div className="mx-auto mt-5 h-px w-28 bg-[linear-gradient(90deg,transparent,rgba(143,32,23,0.35),rgba(197,154,93,0.75),rgba(143,32,23,0.35),transparent)]" />
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {highlights.map((item) => (
                  <div key={item} className="portal-panel p-5">
                    <div className="relative flex flex-col items-center text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                        <Star className="h-4 w-4" />
                      </div>
                      <p className="mt-4 text-sm leading-7 text-stone-700">
                        {item}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="portal-panel p-8 md:p-10">
          <div className="relative">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center rounded-full border border-[#d9c29b]/55 bg-white/75 px-3 py-1.5 text-xs tracking-[0.2em] text-stone-600">
                {roleLabel}
              </div>
              <h2 className="portal-title mt-5 text-3xl font-semibold text-stone-900">
                登录平台
              </h2>
            </div>

            {isPhoneFirstRole ? (
              <div className="mb-5 grid grid-cols-2 gap-3 rounded-2xl bg-[#f6efe2] p-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode("phone");
                    setError("");
                  }}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                    loginMode === "phone"
                      ? "bg-white text-[#8f2017] shadow-[0_8px_18px_rgba(89,52,25,0.08)]"
                      : "text-stone-500"
                  }`}
                >
                  手机号登录
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode("email");
                    setError("");
                  }}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                    loginMode === "email"
                      ? "bg-white text-[#8f2017] shadow-[0_8px_18px_rgba(89,52,25,0.08)]"
                      : "text-stone-500"
                  }`}
                >
                  邮箱登录
                </button>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-5">
              {loginMode === "phone" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-stone-700">
                    手机号
                  </span>
                  <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                    <Smartphone className="h-5 w-5 text-stone-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入手机号"
                      required
                      className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                    />
                  </div>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-stone-700">
                    邮箱
                  </span>
                  <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                    <Mail className="h-5 w-5 text-stone-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      required
                      className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-700">
                  密码
                </span>
                <div className="flex items-center gap-3 rounded-2xl border border-[#dbc7a6] bg-white/85 px-4 py-3 shadow-[0_8px_20px_rgba(89,52,25,0.04)]">
                  <LockKeyhole className="h-5 w-5 text-stone-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    required
                    minLength={6}
                    className="w-full bg-transparent text-stone-900 outline-none placeholder:text-stone-400"
                  />
                </div>
              </label>

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
                    登录中...
                  </>
                ) : isPhoneFirstRole ? (
                  loginMode === "phone" ? (
                    "用手机号进入"
                  ) : (
                    "用邮箱进入"
                  )
                ) : (
                  "进入平台"
                )}
              </button>
            </form>

            {isPhoneFirstRole ? (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dbc7a6] bg-[#f9f4ea] px-4 py-3 text-sm text-stone-400"
                >
                  <MessageCircle className="h-4 w-4" />
                  微信登录（即将开通）
                </button>
              </div>
            ) : null}

            <div className="mt-6 text-center">
              {role === "teacher" || role === "student" ? (
                <div className="mb-3 text-sm text-stone-500">
                  还没有账号？
                  <Link
                    href={`/register/${role}`}
                    className="ml-2 font-medium text-[#8f2017] transition-colors hover:text-[#b83226]"
                  >
                    立即注册
                  </Link>
                </div>
              ) : null}
              <Link
                href="/"
                className="text-sm text-stone-500 transition-colors hover:text-[#8f2017]"
              >
                返回首页
              </Link>
            </div>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
