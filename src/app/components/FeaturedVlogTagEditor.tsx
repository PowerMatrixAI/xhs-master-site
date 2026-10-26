"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { normalizeTemplateTagIds, type VlogTagDimension, type VlogTemplateTag } from "@/lib/featuredVlogTags";

export function FeaturedVlogTagEditor({ value, dimensions, previousTags = [], onChange, disabled }: {
  value: number[];
  dimensions: VlogTagDimension[];
  previousTags?: VlogTemplateTag[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  const selected = normalizeTemplateTagIds(value);
  const available = new Map([...previousTags, ...dimensions.flatMap((dimension) => dimension.tags)].map((tag) => [tag.id, tag]));

  function add(id: number) {
    if (!id || selected.includes(id)) return;
    if (selected.length >= 20) { setError("每个模板最多选择20个标签。"); return; }
    setError("");
    onChange([...selected, id]);
  }

  return <fieldset disabled={disabled} className="space-y-3 rounded-lg border border-ink/10 p-4">
    <legend className="px-1 text-sm font-medium">模板标签（至少选择1个）</legend>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {dimensions.map((dimension) => <label key={dimension.id} className="field"><span>{dimension.name}</span>
        <select value="" aria-label={`选择${dimension.name}标签`} onChange={(event) => add(Number(event.target.value))}>
          <option value="">{dimension.tags.length ? "选择已有标签" : "该维度暂无标签"}</option>
          {dimension.tags.map((tag) => <option key={tag.id} value={tag.id} disabled={selected.includes(tag.id)}>{tag.name}{selected.includes(tag.id) ? "（已选）" : ""}</option>)}
        </select>
      </label>)}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="模板已选标签">
      {selected.length ? selected.map((id) => {
        const tag = available.get(id);
        return <span key={id} className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal">{tag ? `${tag.dimensionName || "未分类"}：${tag.name}` : "标签已不可用"}<button type="button" aria-label={`移除标签 ${tag?.name || id}`} onClick={() => { setError(""); onChange(selected.filter((item) => item !== id)); }} className="rounded p-0.5 hover:bg-teal/10"><X size={12} /></button></span>;
      }) : <span className="text-xs text-ink/45">还未选择标签</span>}
    </div>
    {!dimensions.length && <p className="text-xs text-ink/50">暂无可选维度，请在标签管理中维护后刷新。</p>}
    <p className="text-xs text-ink/50">标签统一在“平台管理 → 标签管理”维护；此处仅选择已有标签，支持多选，最多20个。</p>
    {selected.some((id) => !available.get(id)?.dimensionId) && <p className="text-xs text-ink/50">旧标签尚未分类，可先保留；请在标签管理中为其设置所属维度。</p>}
    {error && <p role="alert" className="text-xs text-coral">{error}</p>}
  </fieldset>;
}
