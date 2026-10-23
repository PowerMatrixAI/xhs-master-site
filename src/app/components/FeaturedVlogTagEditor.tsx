"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { normalizeTemplateTags } from "@/lib/featuredVlogTags";

export function FeaturedVlogTagEditor({ value, options, onChange, disabled }: {
  value: string[];
  options: string[];
  onChange: (tags: string[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const selected = normalizeTemplateTags(value);
  const available = normalizeTemplateTags([...options, ...selected]);
  const key = (tag: string) => tag.toLocaleLowerCase();

  function select(tags: string[]) {
    setError("");
    if (tags.length > 20) { setError("每个模板最多选择20个标签。"); return; }
    onChange(tags);
  }

  function add() {
    const incoming = normalizeTemplateTags(draft.split(/[,，、\n]+/));
    if (!incoming.length) return;
    if (incoming.some((tag) => Array.from(tag).length > 30)) { setError("每个标签最多30字。"); return; }
    const next = normalizeTemplateTags([...selected, ...incoming.map((tag) => available.find((item) => key(item) === key(tag)) || tag)]);
    if (next.length > 20) { setError("每个模板最多选择20个标签。"); return; }
    select(next);
    setDraft("");
  }

  return <fieldset disabled={disabled} className="space-y-3 rounded-lg border border-ink/10 p-4">
    <legend className="px-1 text-sm font-medium">模板标签（至少选择1个）</legend>
    <div className="flex flex-wrap gap-2">
      {selected.length ? selected.map((tag) => <span key={key(tag)} className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal">{tag}<button type="button" onClick={() => select(selected.filter((item) => key(item) !== key(tag)))} aria-label={`移除标签 ${tag}`} className="rounded p-0.5 hover:bg-teal/10"><X size={12} /></button></span>) : <span className="text-xs text-ink/45">还未选择标签</span>}
    </div>
    <div className="flex gap-2">
      <input aria-label="搜索或新建模板标签" value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="搜索已有标签，或输入新标签后添加" className="min-w-0 flex-1 rounded border border-ink/15 px-3 py-2 text-sm outline-none focus:border-teal" />
      <button type="button" onClick={add} disabled={disabled || !draft.trim()} className="secondary-button shrink-0"><Plus size={14} /> 添加标签</button>
    </div>
    {available.length > 0 && <div className="flex max-h-32 flex-wrap gap-2 overflow-auto" aria-label="已有模板标签">
      {available.filter((tag) => !draft.trim() || key(tag).includes(key(draft.trim()))).map((tag) => {
        const active = selected.some((item) => key(item) === key(tag));
        return <button type="button" key={key(tag)} aria-pressed={active} onClick={() => select(active ? selected.filter((item) => key(item) !== key(tag)) : [...selected, tag])} className={`rounded border px-2 py-1 text-xs ${active ? "border-teal/30 bg-teal/10 text-teal" : "border-ink/10 bg-white text-ink/65 hover:border-teal/30"}`}>{tag}</button>;
      })}
    </div>}
    <p className="text-xs text-ink/50">可多选；每个标签最多30字，最多20个。新标签随模板保存后可复用。</p>
    {error && <p role="alert" className="text-xs text-coral">{error}</p>}
  </fieldset>;
}
