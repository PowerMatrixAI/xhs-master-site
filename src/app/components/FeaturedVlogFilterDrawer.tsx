"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Layers3, Search, X } from "lucide-react";
import type { VlogTagDimension } from "@/lib/featuredVlogTags";

export function FeaturedVlogFilterDrawer({ dimensions, selectedIds, onChange, matchCount, disabled, onClose }: {
  dimensions: VlogTagDimension[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  matchCount: number;
  disabled: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  const [dimensionId, setDimensionId] = useState<number | "all">(() => dimensions.find((dimension) => dimension.tags.some((tag) => selectedIds.includes(tag.id)))?.id || dimensions[0]?.id || "all");
  const [dimensionQuery, setDimensionQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onCloseRef.current();
      return;
    }
    // Keep a fallback for interrupted animations or unavailable styles.
    const timeout = window.setTimeout(() => onCloseRef.current(), 240);
    return () => window.clearTimeout(timeout);
  }, [closing]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const scrollPosition = { left: window.scrollX, top: window.scrollY, behavior: "instant" as const };
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("[data-vlog-tag-search]")?.focus({ preventScroll: true });
    // Native dialog autofocus may scroll its containing document; restore before paint.
    window.scrollTo(scrollPosition);
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      window.scrollTo(scrollPosition);
    };
  }, []);

  const query = tagQuery.trim().toLocaleLowerCase();
  const activeDimension = dimensions.find((dimension) => dimension.id === dimensionId);
  const activeId = query || !activeDimension ? "all" : dimensionId;
  const selectedTags = dimensions.flatMap((dimension) => dimension.tags.filter((tag) => selectedIds.includes(tag.id)));
  const visibleDimensions = dimensions.filter((dimension) => dimension.name.toLocaleLowerCase().includes(dimensionQuery.trim().toLocaleLowerCase()));
  const groups = dimensions.filter((dimension) => activeId === "all" || dimension.id === activeId).map((dimension) => ({ ...dimension,
    tags: dimension.tags.filter((tag) => !query || tag.name.toLocaleLowerCase().includes(query) || dimension.name.toLocaleLowerCase().includes(query))
  })).filter((dimension) => dimension.tags.length > 0);
  const tagCount = groups.reduce((count, group) => count + group.tags.length, 0);

  function selectDimension(id: number | "all") {
    setDimensionId(id);
    setTagQuery("");
  }

  function toggleTag(id: number) {
    if (disabled || closing) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  function requestClose() {
    if (!closing) setClosing(true);
  }

  return <dialog ref={ref} aria-modal="true" aria-labelledby="vlog-filter-drawer-title" aria-describedby="vlog-filter-drawer-description"
    data-closing={closing ? "true" : "false"}
    className="vlog-filter-drawer fixed inset-y-0 left-auto right-0 !m-0 h-[100dvh] max-h-none w-full max-w-2xl overflow-hidden border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/45"
    onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && event.animationName === "vlog-filter-drawer-exit" && closing) onCloseRef.current();
    }}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right) requestClose();
    }}>
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-4 border-b border-ink/10 p-5">
        <div className="flex items-start justify-between gap-4"><div><h3 id="vlog-filter-drawer-title" className="text-lg font-semibold">标签筛选</h3><p id="vlog-filter-drawer-description" className="mt-1 text-xs leading-5 text-ink/50">按维度选择标签，需同时包含所有已选标签。</p></div><button type="button" aria-label="关闭标签筛选" disabled={closing} onClick={requestClose} className="icon-button shrink-0"><X size={17} /></button></div>
        <label className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 focus-within:border-teal/50"><Search size={16} className="shrink-0 text-ink/40" /><input data-vlog-tag-search aria-label="搜索所有维度的标签" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="搜索所有维度的标签" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />{tagQuery && <button type="button" aria-label="清除标签关键词" onClick={() => setTagQuery("")} className="text-ink/45"><X size={14} /></button>}</label>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[128px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="筛选维度目录" className="flex min-h-0 flex-col border-r border-ink/10 bg-ink/[0.02]">
          <div className="shrink-0 space-y-2 p-3"><p className="flex items-center gap-1.5 text-xs font-medium text-ink/60"><Layers3 size={14} /> 维度 {dimensions.length}</p><input aria-label="查找筛选维度" value={dimensionQuery} onChange={(event) => setDimensionQuery(event.target.value)} placeholder="查找维度" className="w-full rounded border border-ink/10 bg-white px-2 py-2 text-xs outline-none focus:border-teal/40" /></div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            <button type="button" aria-pressed={activeId === "all"} onClick={() => selectDimension("all")} className={`w-full rounded-lg px-2 py-2.5 text-left text-xs sm:text-sm ${activeId === "all" ? "bg-teal/10 font-semibold text-teal" : "text-ink/60 hover:bg-ink/5"}`}>全部维度</button>
            {visibleDimensions.map((dimension) => {
              const count = dimension.tags.filter((tag) => selectedIds.includes(tag.id)).length;
              return <button type="button" key={dimension.id} aria-label={`筛选维度 ${dimension.name}`} aria-pressed={activeId === dimension.id} onClick={() => selectDimension(dimension.id)} className={`flex w-full items-center justify-between gap-1 rounded-lg px-2 py-2.5 text-left text-xs sm:text-sm ${activeId === dimension.id ? "bg-teal/10 font-semibold text-teal" : "text-ink/60 hover:bg-ink/5"}`}><span className="break-words">{dimension.name}</span>{count > 0 && <span className="shrink-0 rounded bg-teal/10 px-1.5 py-0.5 text-[10px] text-teal">{count}</span>}</button>;
            })}
            {!visibleDimensions.length && <p className="px-2 py-3 text-xs leading-5 text-ink/40">{dimensionQuery ? "没有匹配的维度" : "暂无标签维度"}</p>}
          </div>
        </nav>
        <section className="flex min-h-0 min-w-0 flex-col" aria-label="维度标签选项">
          <div className="shrink-0 border-b border-ink/5 px-4 py-3"><h4 className="text-sm font-semibold">{query ? "搜索结果 · 全部维度" : activeDimension?.name && activeId !== "all" ? activeDimension.name : "全部维度"}</h4><p className="mt-1 text-xs text-ink/45">{query ? `找到 ${tagCount} 个标签` : `${tagCount} 个标签，可多选`}</p></div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {groups.map((dimension) => <section key={dimension.id} className="space-y-2">{activeId === "all" && <h5 className="text-xs font-medium text-ink/50">{dimension.name} · {dimension.tags.length}</h5>}<div className="grid gap-2 sm:grid-cols-2">{dimension.tags.map((tag) => {
              const checked = selectedIds.includes(tag.id);
              return <label key={tag.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs leading-5 transition ${checked ? "border-teal/30 bg-teal/5 text-teal" : "border-ink/10 text-ink/70 hover:border-teal/30"}`}><input type="checkbox" aria-label={`${dimension.name}：${tag.name}`} checked={checked} disabled={disabled} onChange={() => toggleTag(tag.id)} className="mt-1 shrink-0 accent-teal" /><span className="min-w-0 flex-1 break-words">{tag.name}</span>{checked && <Check size={13} className="mt-1 shrink-0" />}</label>;
            })}</div></section>)}
            {!groups.length && <p className="py-10 text-center text-xs leading-6 text-ink/45">{query ? "没有匹配的标签，请更换关键词。" : dimensions.length ? "该维度暂无标签，可选择其他维度。" : "平台暂未配置标签维度。"}</p>}
          </div>
        </section>
      </div>
      <div className="shrink-0 space-y-3 border-t border-ink/10 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between text-xs"><span className="font-medium text-ink/60">已选标签 {selectedTags.length}</span><button type="button" disabled={disabled || !selectedTags.length} onClick={() => onChange([])} className="text-teal hover:underline disabled:text-ink/30">清空标签</button></div>
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" aria-label="抽屉已选标签">{selectedTags.length ? selectedTags.map((tag) => <span key={tag.id} className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal">{tag.dimensionName}：{tag.name}<button type="button" disabled={disabled} aria-label={`移除抽屉标签 ${tag.dimensionName}：${tag.name}`} onClick={() => toggleTag(tag.id)}><X size={12} /></button></span>) : <p className="text-xs text-ink/40">不限标签，展示全部匹配模板。</p>}</div>
        <button type="button" disabled={closing} onClick={requestClose} className="primary-button w-full">查看 {matchCount} 个模板</button>
      </div>
    </div>
  </dialog>;
}
