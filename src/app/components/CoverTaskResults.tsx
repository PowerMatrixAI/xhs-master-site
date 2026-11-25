"use client";
import { useRef, useState } from "react";
import { coverStyles } from "@/lib/coverProduction";
import { retryMediaTask, type MediaTask } from "@/lib/mediaTasks";
import { createXhsRequestId } from "@/lib/xhs-signature";

export function CoverTaskResults({ task, onUpdated }: { task: MediaTask; onUpdated: (task: MediaTask) => void }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const retryIds = useRef<Record<string, string>>({});
  async function retry(variantId: string) {
    if (busy) return;
    setBusy(variantId); setError("");
    const key = task.id + ":" + variantId;
    retryIds.current[key] ||= createXhsRequestId();
    try {
      onUpdated(await retryMediaTask(task.id, variantId, retryIds.current[key]));
      delete retryIds.current[key];
    } catch (e) { setError(e instanceof Error ? e.message : "重试失败"); }
    finally { setBusy(""); }
  }
  return <div className="space-y-3">
    {error && <p role="alert" className="text-coral">{error}</p>}
    <div className="grid gap-4 md:grid-cols-3">
      {coverStyles.filter(style => !task.items?.length || task.items.some(item => item.variantId === style.id)).map(style => {
        const item = task.items?.find(i => i.variantId === style.id);
        const artifacts = item?.artifacts || task.artifacts?.filter(a => a.variantId === style.id) || [];
        return <div key={style.id} className="rounded-xl border border-ink/10 p-3">
          <h4 className="font-semibold">{style.name}</h4>
          <p className="my-2 text-xs text-ink/60">{item?.status === "completed" ? "已完成" : item?.status === "failed" ? "失败" : item?.status === "uploading" ? "保存图片中" : "等待或正在制作"}</p>
          {artifacts.filter(a => a.type === "image" && /^https:\/\//.test(a.url)).map(a => <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="block"><img src={a.url} alt={style.name + "成品"} className="aspect-[3/4] w-full rounded object-contain" /><span className="mt-2 block text-sm text-teal">查看 / 下载原图</span></a>)}
          {item?.error && <p className="my-2 text-sm text-coral">{item.error}</p>}
          {item?.status === "failed" && <button disabled={!!busy} className="secondary-button" onClick={() => void retry(style.id)}>{busy === style.id ? "提交中…" : "重试此版本"}</button>}
        </div>;
      })}
    </div>
    {task.bundleUrl && /^https:\/\//.test(task.bundleUrl) && <a className="secondary-button inline-flex" href={task.bundleUrl} target="_blank" rel="noreferrer">下载全部封面</a>}
  </div>;
}
