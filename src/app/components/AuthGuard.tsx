"use client";

import { useEffect, useState } from "react";
import { autoLogin, isLoggedIn, getUser, requireManualLogin, type LoginResponse } from "@/lib/api";
import { Loader2 } from "lucide-react";

/**
 * 认证守卫组件
 * 检查登录状态，未登录跳转 /login
 * 有 token 时尝试自动登录刷新
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LoginResponse | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      requireManualLogin();
      return;
    }
    // 已有 token，尝试自动登录验证
    autoLogin()
      .then((data) => {
        setUser(data);
        setChecking(false);
      })
      .catch(() => {
        // 自动登录三次失败，或 token 已失效：停止当前操作并要求手动登录。
        requireManualLogin();
      });
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3 text-ink/60">
          <Loader2 size={32} className="animate-spin" />
          <span className="text-sm">正在验证登录状态...</span>
        </div>
      </div>
    );
  }

  // 将 user 信息通过 context 传递（简化：直接 cloneElement 或 props）
  return <>{children}</>;
}

/**
 * 获取当前登录用户信息 (客户端)
 */
export function useCurrentUser(): LoginResponse | null {
  return getUser();
}
