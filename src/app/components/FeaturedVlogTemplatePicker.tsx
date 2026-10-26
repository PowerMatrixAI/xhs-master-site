"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { FeaturedVlogTemplate } from "@/lib/featuredVlog";
import { filterTemplatesByTagIds, templateTagLabels, type VlogTagDimension } from "@/lib/featuredVlogTags";
import { FeaturedVlogFilterDrawer } from "@/app/components/FeaturedVlogFilterDrawer";

export function FeaturedVlogTemplatePicker({ templates, dimensions, value, onChange, disabled }: {
  templates: FeaturedVlogTemplate[];
  dimensions: VlogTagDimension[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [filters, setFilters] = useState<number[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selectedTags = dimensions.flatMap((dimension) => dimension.tags.filter((tag) => filters.includes(tag.id)));
  const selectedIds = selectedTags.map((tag) => tag.id);
  const query = nameQuery.trim().toLocaleLowerCase();
  const filtered = filterTemplatesByTagIds(templates, selectedIds).filter((template) => !query || template.name.toLocaleLowerCase().includes(query));
  const selected = templates.find((template) => template.id === value);
  const outsideFilter = Boolean(selected && !filtered.some((template) => template.id === value));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 focus-within:border-teal/50"><Search size={16} className="shrink-0 text-ink/40" /><input aria-label="搜索模板名称" disabled={disabled} value={nameQuery} onChange={(event) => setNameQuery(event.target.value)} placeholder="搜索模板名称" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />{nameQuery && <button type="button" aria-label="清除模板名称搜索" disabled={disabled} onClick={() => setNameQuery("")} className="text-ink/45"><X size={14} /></button>}</label>
      <button type="button" disabled={disabled} onClick={() => setDrawerOpen(true)} aria-label="打开标签筛选" aria-haspopup="dialog" aria-expanded={drawerOpen} className="secondary-button"><SlidersHorizontal size={15} /> 标签筛选{selectedTags.length > 0 && <span className="rounded bg-teal/10 px-1.5 py-0.5 text-xs text-teal">已选 {selectedTags.length}</span>}</button>
      <button type="button" disabled={disabled || (!selectedTags.length && !nameQuery)} onClick={() => { setFilters([]); setNameQuery(""); }} className="text-xs text-teal hover:underline disabled:text-ink/30">清空条件</button>
    </div>
    <div className="flex flex-wrap items-center gap-2" aria-label="已选筛选标签"><span className="text-xs text-ink/55">已选标签：</span>{selectedTags.length ? selectedTags.map((tag) => <span key={tag.id} className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal">{tag.dimensionName}：{tag.name}<button type="button" disabled={disabled} aria-label={`取消筛选 ${tag.dimensionName}：${tag.name}`} onClick={() => setFilters((current) => current.filter((id) => id !== tag.id))}><X size={12} /></button></span>) : <span className="text-xs text-ink/45">不限标签</span>}</div>
    <p className="text-xs text-ink/55">符合筛选的模板 {filtered.length} 个 / 共 {templates.length} 个；需同时包含所有已选标签。</p>
    {outsideFilter && <p className="rounded bg-ink/5 p-3 text-xs text-ink/60">当前选择“{selected?.name}”不在筛选结果中；已保留当前脚本，可从下方另选模板。</p>}
    {!filtered.length && templates.length > 0 && <p className="rounded border border-dashed border-ink/15 p-5 text-center text-sm text-ink/55">没有符合条件的模板，可清空条件或调整筛选。</p>}
    <div className="grid max-h-96 gap-3 overflow-auto sm:grid-cols-2" role="radiogroup" aria-label="筛选后的Vlog模板">
      {filtered.map((template) => <label key={template.id} className={`cursor-pointer space-y-2 rounded-lg border p-3 ${template.id === value ? "border-teal/40 bg-teal/5" : "border-ink/10 bg-white hover:border-teal/30"}`}>
        <span className="flex items-center gap-2 text-sm font-medium"><input type="radio" name="featured-vlog-template" value={template.id} checked={value === template.id} disabled={disabled} onChange={() => onChange(template.id)} />{template.name}</span>
        <span className="flex flex-wrap gap-1.5">{templateTagLabels(template).length ? templateTagLabels(template).map((tag, index) => <span key={index} className="rounded bg-teal/10 px-2 py-1 text-xs text-teal">{tag}</span>) : <span className="text-xs text-ink/45">未设置标签</span>}</span>
        <span className="line-clamp-2 block text-xs leading-5 text-ink/55">{template.outline}</span>
      </label>)}
    </div>
    {drawerOpen && <FeaturedVlogFilterDrawer dimensions={dimensions} selectedIds={selectedIds} onChange={setFilters} matchCount={filtered.length} disabled={disabled} onClose={() => setDrawerOpen(false)} />}
  </div>;
}
