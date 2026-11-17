"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, LoaderCircle, RefreshCw, Trash2, Video, X } from "lucide-react";
import { activeMediaStatuses, deleteMediaTask, getMediaTask, listMediaTasks, mediaStageLabel, mediaStatusLabels, retryMediaTask, type MediaArtifact, type MediaTask, type MediaTaskPage } from "@/lib/mediaTasks";

function ArtifactPreview({ artifact }: { artifact: MediaArtifact }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [artifact.url]);
  if (!/^https:\/\//i.test(artifact.url)) return <p className="p-4 text-sm text-red-700">预览链接无效</p>;
  return <div className="overflow-hidden rounded border border-ink/10 bg-white">
    {artifact.type === "video" ? <video src={artifact.url} controls playsInline preload="metadata" onError={() => setFailed(true)} className="max-h-[65vh] w-full bg-black" aria-label={artifact.name} /> : <a href={artifact.url} target="_blank" rel="noreferrer"><img src={artifact.url} alt={artifact.name} loading="lazy" onError={() => setFailed(true)} className="max-h-[65vh] w-full object-contain" /></a>}
    <div className="flex items-center justify-between gap-3 p-3 text-sm"><span className="truncate">{artifact.name}</span><a href={artifact.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-teal"><Download size={15} />打开原文件</a></div>
    {failed && <p role="alert" className="px-3 pb-3 text-sm text-red-700">媒体暂时无法播放，请打开原文件或稍后重试。</p>}
  </div>;
}

export function MediaTasksPanel({ accounts, focusId, onGenerate, onDeleted, notify }: {
  accounts: Array<{ id: number; name: string }>; focusId?: string;
  onGenerate: (kind: "image" | "video") => void;
  onDeleted?: (id: string) => void;
  notify: (message: string, tone: "success" | "error") => void;
}) {
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState(0);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<MediaTaskPage>({ items: [], total: 0, page: 1, pageSize: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<MediaTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [retrying, setRetrying] = useState("");
  const [deleting, setDeleting] = useState("");
  const [refresh, setRefresh] = useState(0);
  const mutationBusy = useRef(false);
  const detailId = detail?.id;
  const requestSequence = useRef(0);
  const openedTaskId = useRef<string>();
  const open = useCallback(async (id: string) => {
    openedTaskId.current = id;
    const sequence = ++requestSequence.current;
    setDetailLoading(true); setDetailError(""); setDetail(null);
    try { const item = await getMediaTask(id); if (sequence === requestSequence.current) setDetail(item); }
    catch (err) { if (sequence === requestSequence.current) setDetailError(err instanceof Error ? err.message : "读取详情失败"); }
    finally { if (sequence === requestSequence.current) setDetailLoading(false); }
  }, []);
  useEffect(() => { if (focusId) void open(focusId); }, [focusId, open]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    setLoading(true); setError("");
    async function load() {
      try {
        const result = await listMediaTasks({ page, accountId, kind, status }, controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "读取任务失败"); }
      finally { if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(() => { if (document.visibilityState === "visible") void load(); else timer = setTimeout(load, 5000); }, 5000); } }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [page, accountId, kind, status, refresh]);
  useEffect(() => {
    if (!detailId || !detail || !activeMediaStatuses.includes(detail.status)) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try { const item = await getMediaTask(detailId!, controller.signal); if (!controller.signal.aborted) { setDetail(item); setDetailError(""); if (activeMediaStatuses.includes(item.status)) timer = setTimeout(update, 4000); else setRefresh(value => value + 1); } }
      catch (err) { if (!controller.signal.aborted) { setDetailError(err instanceof Error ? err.message : "进度刷新失败"); timer = setTimeout(update, 5000); } }
    }
    timer = setTimeout(update, 4000); return () => { controller.abort(); clearTimeout(timer); };
  }, [detailId, detail?.status]);
  async function retry(task: MediaTask) {
    if (mutationBusy.current) return;
    mutationBusy.current = true; setRetrying(task.id);
    try { const child = await retryMediaTask(task.id); setPage(1); setRefresh(value => value + 1); await open(child.id); notify(task.stage === "uploading" ? "正在补传已有结果，不会重新生成媒体。" : "重试任务已提交，可在这里查看进度。", "success"); }
    catch (err) { notify(err instanceof Error ? err.message : "重试失败", "error"); }
    finally { mutationBusy.current = false; setRetrying(""); }
  }
  const close = () => { openedTaskId.current = undefined; requestSequence.current++; setDetail(null); setDetailError(""); setDetailLoading(false); };
  async function remove(task: MediaTask) {
    if (mutationBusy.current || task.status !== "failed") return;
    if (!window.confirm(`确定删除失败任务「${task.title || task.id}」吗？`)) return;
    mutationBusy.current = true; setDeleting(task.id);
    try {
      await deleteMediaTask(task.id);
      if (openedTaskId.current === task.id) close();
      onDeleted?.(task.id);
      if (page > 1 && data.items.length === 1 && data.items[0].id === task.id) setPage(value => value - 1);
      setRefresh(value => value + 1);
      notify("失败任务已删除。", "success");
    } catch (err) { notify(err instanceof Error ? err.message : "删除任务失败", "error"); }
    finally { mutationBusy.current = false; setDeleting(""); }
  }
  const changeFilter = (change: () => void) => { change(); setPage(1); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">生成任务</h1><p className="mt-1 text-sm text-ink/60">查看制作进度，预览已保存的图片和视频。</p></div><div className="flex gap-2"><button className="secondary-button" onClick={() => onGenerate("image")}><ImageIcon size={16} />生成图片</button><button className="primary-button" onClick={() => onGenerate("video")}><Video size={16} />生成视频</button></div></div>
    <div className="panel flex flex-wrap items-center gap-3">
      <select aria-label="筛选账号" value={accountId} onChange={e => changeFilter(() => setAccountId(Number(e.target.value)))} className="rounded border border-ink/15 bg-white p-2 text-sm"><option value={0}>全部账号</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select aria-label="筛选类型" value={kind} onChange={e => changeFilter(() => setKind(e.target.value))} className="rounded border border-ink/15 bg-white p-2 text-sm"><option value="">全部类型</option><option value="image">图片</option><option value="video">视频</option></select>
      <select aria-label="筛选状态" value={status} onChange={e => changeFilter(() => setStatus(e.target.value))} className="rounded border border-ink/15 bg-white p-2 text-sm"><option value="">全部状态</option><option value="active">进行中</option><option value="completed">已完成</option><option value="failed">失败</option><option value="unknown">结果待核实</option></select>
      <button onClick={() => setRefresh(value => value + 1)} disabled={loading} className="secondary-button ml-auto"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</button>
    </div>
    {error && <div role="alert" className="rounded bg-red-50 p-4 text-sm text-red-700">{error}<button className="ml-3 underline" onClick={() => setRefresh(v => v + 1)}>重新加载</button></div>}
    {loading && !data.items.length && <p role="status" className="flex items-center gap-2 p-6 text-ink/60"><LoaderCircle className="animate-spin" size={18} />正在读取任务…</p>}
    {!loading && !error && data.items.length === 0 && <div className="panel py-14 text-center text-ink/60">暂无任务。前往图片或视频方案，点击生成即可开始制作。</div>}
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{data.items.map(task => <article key={task.id} className="panel flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{task.title || (task.kind === "video" ? "视频生成" : "图片生成")}</h2><span className={`shrink-0 rounded px-2 py-1 text-xs ${task.status === "failed" ? "bg-red-50 text-red-700" : task.status === "completed" ? "bg-teal/10 text-teal" : "bg-ink/5 text-ink/70"}`}>{mediaStatusLabels[task.status] || task.status}</span></div>
      <p className="text-xs text-ink/55">{accounts.find(a => a.id === task.accountId)?.name || `账号 ${task.accountId}`} · {task.kind === "video" ? "视频" : "图片"} · {new Date(task.createdAt).toLocaleString("zh-CN")}</p>
      <progress aria-label="流程进度" max={100} value={task.status === "completed" ? 100 : task.progress || 0} className="h-1.5 w-full accent-teal" /><p className="text-xs text-ink/60">{mediaStageLabel(task)}{task.retryOf ? " · 重试任务" : ""}</p>
      {!!task.artifacts?.length && <button onClick={() => void open(task.id)} aria-label={`预览${task.title || "媒体"}`} className="relative overflow-hidden rounded bg-ink/5">{task.artifacts[0].type === "image" ? <img src={task.artifacts[0].url} alt={task.artifacts[0].name} loading="lazy" className="h-44 w-full object-contain" /> : <div className="flex h-32 items-center justify-center gap-2 text-teal"><Video size={28} />播放已生成视频</div>}<span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white">{task.artifacts.length} 个文件</span></button>}
      {task.error && <p className="break-words text-sm text-red-700">{task.error}</p>}
      <div className="mt-auto flex flex-wrap gap-2"><button className="secondary-button" onClick={() => void open(task.id)}>查看详情</button>{task.status === "failed" && <><button className="primary-button" disabled={!!retrying || !!deleting} onClick={() => void retry(task)}>{retrying === task.id ? "提交中…" : task.stage === "uploading" ? "重试上传" : "重试"}</button><button className="secondary-button text-red-700" aria-label={`删除任务${task.title || task.id}`} disabled={!!retrying || !!deleting} onClick={() => void remove(task)}><Trash2 size={15} />{deleting === task.id ? "删除中…" : "删除"}</button></>}</div>
    </article>)}</div>
    <div className="flex items-center justify-between text-sm text-ink/60"><span>共 {data.total} 个任务</span><div className="flex items-center gap-3"><button className="secondary-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>第 {page} 页</span><button className="secondary-button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一页</button></div></div>
    {(detail || detailLoading || detailError) && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={close}><section role="dialog" aria-modal="true" aria-label="任务详情" className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-paper p-5 shadow-xl" onClick={e => e.stopPropagation()}><div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">{detail?.title || "任务详情"}</h2><button autoFocus onClick={close} aria-label="关闭任务详情"><X size={22} /></button></div>{detailLoading && <p>正在读取详情…</p>}{detailError && <p role="alert" className="mb-3 text-red-700">{detailError}</p>}{detail && <><p className="mb-2 text-sm text-ink/60">{mediaStageLabel(detail)} · 任务 {detail.id}</p><progress className="mb-4 h-2 w-full accent-teal" max={100} value={detail.status === "completed" ? 100 : detail.progress || 0} aria-label="任务流程进度" />{detail.error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{detail.error}</p>}{detail.status === "unknown" && <p className="mb-4 text-sm text-amber-800">执行结果尚未确认，暂不重新提交制作，以免重复扣费。</p>}<div className="grid gap-4 sm:grid-cols-2">{detail.artifacts?.map(artifact => <ArtifactPreview key={artifact.cosPath} artifact={artifact} />)}</div>{detail.status === "failed" && <div className="mt-4"><p className="mb-2 text-xs text-ink/55">{detail.stage === "uploading" ? "仅重传已有文件，不重新调用媒体生成。" : "重新制作会使用当前用户额度，并优先复用已有有效产物。"}</p><div className="flex flex-wrap gap-2"><button className="primary-button" disabled={!!retrying || !!deleting} onClick={() => void retry(detail)}>{retrying ? "提交中…" : detail.stage === "uploading" ? "重试上传" : "重试任务"}</button><button className="secondary-button text-red-700" disabled={!!retrying || !!deleting} onClick={() => void remove(detail)}><Trash2 size={15} />{deleting === detail.id ? "删除中…" : "删除任务"}</button></div></div>}</>}</section></div>}
  </div>;
}
