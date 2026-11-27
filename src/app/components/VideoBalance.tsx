"use client";

import { useEffect, useState } from "react";
import { fetchMembership } from "@/lib/billing";

export function VideoBalance({ onClick }: { onClick: () => void }) {
  const [seconds, setSeconds] = useState<number>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const status = await fetchMembership(controller.signal);
        if (!controller.signal.aborted) { setSeconds(status.remainingVideoSeconds); setError(""); }
      } catch (error) {
        if (!controller.signal.aborted) { setSeconds(undefined); setError(error instanceof Error ? error.message : "读取剩余视频时长失败"); }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 30000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return <button type="button" onClick={onClick} title={error || "查看会员权益与充值"} className={`rounded-lg border px-3 py-2 whitespace-nowrap text-sm font-medium hover:underline ${seconds !== undefined && seconds <= 0 ? "border-coral/20 bg-coral/5 text-coral" : "border-teal/15 bg-teal/5 text-teal"}`}>
    {error ? "视频时长暂不可用" : seconds === undefined ? "视频时长加载中…" : `视频剩余 ${seconds.toLocaleString("zh-CN")} 秒`}
  </button>;
}