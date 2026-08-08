"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, Loader2 } from "lucide-react";
import { login, register, isLoggedIn } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [betaCode, setBetaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!name.trim()) {
          setError("请输入用户名");
          return;
        }
        if (!betaCode.trim()) {
          setError("请输入内测码");
          return;
        }
        await register(email, name, password, betaCode);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        {/* Logo 区域 */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 text-left">
            <Image
              src="/xhs-master-logo.png"
              alt="小红书运营策划大师 Logo"
              width={200}
              height={200}
              priority
              className="h-14 w-14 shrink-0 rounded-md object-cover"
            />
            <div className="text-lg font-semibold leading-6 text-ink">小红书运营策划大师</div>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {mode === "login" ? "登录" : "注册账号"}
          </h1>
          <p className="mt-1 text-sm text-ink/55">
            {mode === "login" ? "多账号类型小红书安全运营台" : "创建账号开始使用运营台"}
          </p>
        </div>

        {/* 表单卡片 */}
        <div className="panel">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <label className="field">
                <span>用户名</span>
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入用户名"
                    className="input-with-icon"
                    autoComplete="name"
                  />
                </div>
              </label>
            )}

            {mode === "register" && (
              <label className="field">
                <span>内测码</span>
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                  <input
                    type="text"
                    value={betaCode}
                    onChange={(e) => setBetaCode(e.target.value)}
                    placeholder="请输入 6 位内测码"
                    className="input-with-icon"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </div>
              </label>
            )}

            <label className="field">
              <span>邮箱</span>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  className="input-with-icon"
                  autoComplete="email"
                  required
                />
              </div>
            </label>

            <label className="field">
              <span>密码</span>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="input-with-icon"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
              </div>
            </label>

            {mode === "register" && (
              <label className="field">
                <span>内测码</span>
                <input
                  type="text"
                  value={betaCode}
                  onChange={(e) => setBetaCode(e.target.value)}
                  placeholder="请输入内测码"
                  autoComplete="off"
                  required
                />
              </label>
            )}

            {error && (
              <div className="rounded border border-coral/30 bg-coral/5 px-3 py-2 text-sm text-coral">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="primary-button w-full justify-center"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === "login" ? "登录" : "注册"}
            </button>
          </form>

          {/* 切换登录/注册 */}
          <div className="mt-5 border-t border-ink/10 pt-4 text-center text-sm text-ink/60">
            {mode === "login" ? (
              <>
                还没有账号？
                <button
                  type="button"
                  onClick={() => { setMode("register"); setError(""); }}
                  className="ml-1 font-medium text-teal hover:underline"
                >
                  注册
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(""); }}
                  className="ml-1 font-medium text-teal hover:underline"
                >
                  登录
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
