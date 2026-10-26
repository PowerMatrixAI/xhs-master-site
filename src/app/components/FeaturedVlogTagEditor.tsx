"use client";

import { useState } from "react";
import { Check, Layers3, Search, X } from "lucide-react";
import { normalizeTemplateTagIds, type VlogTagDimension, type VlogTemplateTag } from "@/lib/featuredVlogTags";

export function FeaturedVlogTagEditor({ value, dimensions, previousTags = [], onChange, disabled }: {
  value: number[];
  dimensions: VlogTagDimension[];
  previousTags?: VlogTemplateTag[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  const [dimensionId, setDimensionId] = useState<number | "all">(() => dimensions.find((dimension) => dimension.tags.some((tag) => value.includes(tag.id)))?.id || dimensions[0]?.id || "all");
  const [dimensionQuery, setDimensionQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const selected = normalizeTemplateTagIds(value);
  const available = new Map([...previousTags, ...dimensions.flatMap((dimension) => dimension.tags)].map((tag) => [tag.id, tag]));
  const query = tagQuery.trim().toLocaleLowerCase();
  const activeDimension = dimensions.find((dimension) => dimension.id === dimensionId);
  const activeId = query || !activeDimension ? "all" : dimensionId;
  const visibleDimensions = dimensions.filter((dimension) => dimension.name.toLocaleLowerCase().includes(dimensionQuery.trim().toLocaleLowerCase()));
  const groups = dimensions.filter((dimension) => activeId === "all" || dimension.id === activeId).map((dimension) => ({ ...dimension,
    tags: dimension.tags.filter((tag) => !query || tag.name.toLocaleLowerCase().includes(query) || dimension.name.toLocaleLowerCase().includes(query))
  })).filter((dimension) => dimension.tags.length > 0);
  const tagCount = groups.reduce((count, dimension) => count + dimension.tags.length, 0);

  function remove(id: number) {
    if (disabled) return;
    setError("");
    onChange(selected.filter((item) => item !== id));
  }

  function toggle(id: number) {
    if (disabled) return;
    if (selected.includes(id)) { remove(id); return; }
    if (selected.length >= 20) { setError("每个模板最多选择20个标签，请先移除部分已选标签。"); return; }
    setError("");
    onChange([...selected, id]);
  }

  function selectDimension(id: number | "all") {
    setDimensionId(id);
    setTagQuery("");
  }

  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border border-ink/10 p-3 sm:p-4">
    <legend className="px-1 text-sm font-medium">模板标签（至少选择1个）</legend>
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-white/70" aria-label="模板标签选择面板">
      <div className="border-b border-ink/10 p-3">
        <label className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 focus-within:border-teal/50"><Search size={16} className="shrink-0 text-ink/40" /><input aria-label="搜索已有模板标签" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="搜索所有维度的已有标签" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />{tagQuery && <button type="button" aria-label="清除模板标签搜索" onClick={() => setTagQuery("")} className="text-ink/45"><X size={14} /></button>}</label>
      </div>
      <div className="grid h-[360px] grid-cols-[120px_minmax(0,1fr)] sm:h-[380px] sm:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="模板标签维度" className="flex min-h-0 min-w-0 flex-col border-r border-ink/10 bg-ink/[0.02]">
          <div className="shrink-0 space-y-2 p-3"><p className="flex items-center gap-1.5 text-xs font-medium text-ink/60"><Layers3 size={14} /> 维度 {dimensions.length}</p><input aria-label="查找模板标签维度" value={dimensionQuery} onChange={(event) => setDimensionQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="查找维度" className="w-full min-w-0 rounded border border-ink/10 bg-white px-2 py-2 text-xs outline-none focus:border-teal/40" /></div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            <button type="button" aria-pressed={activeId === "all"} onClick={() => selectDimension("all")} className={`w-full rounded-lg px-2 py-2.5 text-left text-xs sm:text-sm ${activeId === "all" ? "bg-teal/10 font-semibold text-teal" : "text-ink/60 hover:bg-ink/5"}`}>全部维度</button>
            {visibleDimensions.map((dimension) => {
              const count = dimension.tags.filter((tag) => selected.includes(tag.id)).length;
              return <button type="button" key={dimension.id} aria-label={`选择模板标签维度 ${dimension.name}`} aria-pressed={activeId === dimension.id} onClick={() => selectDimension(dimension.id)} className={`flex w-full items-center justify-between gap-1 rounded-lg px-2 py-2.5 text-left text-xs sm:text-sm ${activeId === dimension.id ? "bg-teal/10 font-semibold text-teal" : "text-ink/60 hover:bg-ink/5"}`}><span className="min-w-0 break-words">{dimension.name}</span>{count > 0 && <span className="shrink-0 rounded bg-teal/10 px-1.5 py-0.5 text-[10px] text-teal">{count}</span>}</button>;
            })}
            {!visibleDimensions.length && <p className="px-2 py-3 text-xs leading-5 text-ink/40">{dimensionQuery ? "没有匹配的维度" : "暂无标签维度"}</p>}
          </div>
        </nav>
        <section aria-label="可选模板标签" className="flex min-h-0 min-w-0 flex-col">
          <div className="shrink-0 border-b border-ink/5 px-4 py-3"><h4 className="break-words text-sm font-semibold">{query ? "搜索结果 · 全部维度" : activeId !== "all" ? activeDimension?.name : "全部维度"}</h4><p className="mt-1 text-xs text-ink/45">{query ? `找到 ${tagCount} 个标签` : `${tagCount} 个标签，可多选`}</p></div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 sm:p-4">
            {groups.map((dimension) => <section key={dimension.id} className="space-y-2">{activeId === "all" && <h5 className="break-words text-xs font-medium text-ink/50">{dimension.name} · {dimension.tags.length}</h5>}<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{dimension.tags.map((tag) => {
              const checked = selected.includes(tag.id);
              return <label key={tag.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs leading-5 transition ${checked ? "border-teal/30 bg-teal/5 text-teal" : "border-ink/10 text-ink/70 hover:border-teal/30"}`}><input type="checkbox" aria-label={`${dimension.name}：${tag.name}`} checked={checked} onChange={() => toggle(tag.id)} className="mt-1 shrink-0 accent-teal" /><span className="min-w-0 flex-1 break-words">{tag.name}</span>{checked && <Check size={13} className="mt-1 shrink-0" />}</label>;
            })}</div></section>)}
            {!groups.length && <p className="py-8 text-center text-xs leading-6 text-ink/45">{query ? "没有匹配的标签，请更换关键词。" : dimensions.length ? "该维度暂无标签，可切换维度或在标签管理中维护。" : "暂无可选维度，请在标签管理中维护后刷新。"}</p>}
          </div>
        </section>
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-ink/60">已选标签 {selected.length} / 20</span><button type="button" disabled={disabled || !selected.length} onClick={() => { setError(""); onChange([]); }} className="text-teal hover:underline disabled:text-ink/30">清空已选</button></div>
    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto" aria-label="模板已选标签">
      {selected.length ? selected.map((id) => {
        const tag = available.get(id);
        const label = tag ? `${tag.dimensionName || "未分类"}：${tag.name}` : `标签已不可用（${id}）`;
        return <span key={id} className="inline-flex max-w-full items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal"><span className="min-w-0 break-words">{label}</span><button type="button" aria-label={`移除模板标签 ${label}`} onClick={() => remove(id)} className="shrink-0 rounded p-0.5 hover:bg-teal/10"><X size={12} /></button></span>;
      }) : <span className="text-xs text-ink/45">还未选择标签</span>}
    </div>
    <p className="text-xs leading-5 text-ink/50">标签统一在“平台管理 → 标签管理”维护；此处仅选择已有标签，至少1个、最多20个。</p>
    {selected.some((id) => !available.get(id)?.dimensionId) && <p className="text-xs text-ink/50">旧标签尚未分类，可先保留；请在标签管理中为其设置所属维度。</p>}
    {error && <p role="alert" className="text-xs text-coral">{error}</p>}
  </fieldset>;
}
