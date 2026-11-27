"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { setAuth, type ApiResponse, type LoginResponse } from "@/lib/api";
import { getBackendApiBaseUrl } from "@/lib/backendApi";

export default function SSOPage() {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    // 读取后立即清掉地址栏里的 code，兑换失败也不会保留。
    window.history.replaceState(null, "", window.location.pathname);
    if (!code) {
      setError("登录凭证无效，请从官网重新进入");
      return;
    }

    async function exchange() {
      const response = await fetch(`${getBackendApiBaseUrl()}/login/v1/sso/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Xhs-Language": "zh-cn" },
        body: JSON.stringify({ code }),
        cache: "no-store"
      });
      if (!response.ok) throw new Error("登录凭证兑换失败，请重新进入");
      const result = await response.json() as ApiResponse<LoginResponse>;
      if (!result.status) throw new Error(result.message || "登录凭证已失效");
      setAuth(result.data);
      window.location.replace("/");
    }

    exchange().catch(err => setError(err instanceof Error ? err.message : "登录连接失败"));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="panel max-w-md text-center">
        {!error && <Loader2 className="mx-auto mb-4 animate-spin" size={28} />}
        <h1 className="text-xl font-semibold">{error ? "暂时无法进入控制台" : "正在登录"}</h1>
        <p role="status" className="mt-3 text-sm text-ink/65">{error || "正在验证登录状态，请稍候…"}</p>
        {error && <a className="primary-button mt-6 inline-flex" href="/login">返回登录</a>}
      </div>
    </main>
  );
}
