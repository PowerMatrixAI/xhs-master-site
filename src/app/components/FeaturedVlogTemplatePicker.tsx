"use client";

import { useState } from "react";
import type { FeaturedVlogTemplate } from "@/lib/featuredVlog";
import { collectTemplateTags, filterTemplatesByTags, normalizeTemplateTags } from "@/lib/featuredVlogTags";

export function FeaturedVlogTemplatePicker({ templates, value, onChange, disabled }: {
  templates: FeaturedVlogTemplate[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [filters, setFilters] = useState<string[]>([]);
  const tags = collectTemplateTags(templates);
  const filtered = filterTemplatesByTags(templates, filters);
  const selected = templates.find((template) => template.id === value);
  const outsideFilter = Boolean(selected && !filtered.some((template) => template.id === value));
  return <div className="space-y-3">
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-ink/55"><span>按标签筛选（可多选，需包含全部所选标签）</span>{filters.length > 0 && <button type="button" disabled={disabled} onClick={() => setFilters([])} className="text-teal hover:underline">清除筛选</button>}</div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="模板标签筛选">
        <button type="button" disabled={disabled} aria-pressed={!filters.length} onClick={() => setFilters([])} className={`rounded border px-3 py-1.5 text-xs ${!filters.length ? "border-teal/30 bg-teal/10 text-teal" : "border-ink/10 text-ink/60"}`}>全部模板</button>
        {tags.map((tag) => <button key={tag} type="button" disabled={disabled} aria-pressed={filters.includes(tag)} onClick={() => setFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} className={`rounded border px-3 py-1.5 text-xs ${filters.includes(tag) ? "border-teal/30 bg-teal/10 text-teal" : "border-ink/10 text-ink/60 hover:border-teal/30"}`}>{tag}</button>)}
      </div>
      <p className="text-xs text-ink/45">符合筛选的模板 {filtered.length} 个 / 共 {templates.length} 个</p>
    </div>
    <label className="field"><span>选择精选 Vlog 模板</span><select disabled={disabled || !templates.length} value={value} onChange={(event) => onChange(event.target.value)}>
      {!selected && <option value="">请选择模板</option>}
      {outsideFilter && selected && <option value={selected.id}>已选：{selected.name}（不匹配筛选）</option>}
      {filtered.map((template) => <option key={template.id} value={template.id}>{template.name}{template.tags?.length ? ` · ${template.tags.join(" / ")}` : " · 未设置标签"}</option>)}
    </select></label>
    {!filtered.length && templates.length > 0 && <p className="text-xs text-ink/55">没有符合标签的模板，可清除或调整筛选。</p>}
    {outsideFilter && <p className="text-xs text-ink/55">当前选择不在筛选结果中；已保留当前脚本，可从列表另选模板。</p>}
    {selected && <div className="flex flex-wrap gap-1.5" aria-label="当前模板标签">{normalizeTemplateTags(selected.tags).length ? normalizeTemplateTags(selected.tags).map((tag) => <span key={tag} className="rounded bg-teal/10 px-2 py-1 text-xs text-teal">{tag}</span>) : <span className="text-xs text-ink/45">当前模板未设置标签</span>}</div>}
  </div>;
}
