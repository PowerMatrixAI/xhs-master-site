"use client";

import { CircleCheck, Download, LoaderCircle, RefreshCw } from "lucide-react";
import type { StoryCharacter } from "@/lib/storyCharacters";

export function StoryCharacterPicker({ templateId, value, disabled, characters, loading, error, onRetry, onChange }: {
  templateId: string;
  value: string;
  disabled: boolean;
  characters: StoryCharacter[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onChange: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded border border-ink/10 bg-white/70 p-4 text-sm text-ink/60">
        <LoaderCircle size={17} className="animate-spin" /> 正在加载平台角色库...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm">
        <div className="text-coral">{error}</div>
        <button type="button" onClick={onRetry} disabled={disabled} className="secondary-button mt-3">
          <RefreshCw size={16} /> 重新加载角色
        </button>
      </div>
    );
  }

  if (!characters.length) {
    return <p className="rounded border border-dashed border-ink/20 bg-white/60 p-4 text-sm text-ink/60">当前模板暂未配置平台角色，请先联系平台管理员上传。</p>;
  }

  return <fieldset disabled={disabled}>
    <legend className="mb-3 text-sm font-medium">选择主角形象</legend>
    <div className="grid max-h-[480px] grid-cols-2 gap-3 overflow-y-auto">
      {characters.map((character) => <label key={character.id} className={`relative min-w-0 cursor-pointer overflow-hidden rounded border bg-white ${value === character.id ? "border-teal ring-1 ring-teal" : "border-ink/15"}`}>
        <input type="radio" name={`story-character-${templateId}`} value={character.id} checked={value === character.id} onChange={() => onChange(character.id)} className="absolute left-3 top-3 z-10 h-4 w-4 accent-teal" />
        <img src={character.imageUrl} alt={character.name} className="aspect-square max-h-64 w-full object-contain" />
        <div className="flex min-h-12 items-center justify-between gap-2 p-3 text-sm font-medium">
          <span className="min-w-0 truncate">{character.name}</span>
          {value === character.id && <CircleCheck size={18} className="shrink-0 text-teal" />}
        </div>
      </label>)}
    </div>
    {value && <a href={characters.find((item) => item.id === value)?.imageUrl} target="_blank" rel="noreferrer" download className="mt-3 inline-flex items-center gap-2 text-sm text-teal"><Download size={16} />下载角色图</a>}
  </fieldset>;
}
