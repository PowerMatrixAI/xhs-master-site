"use client";

import { useState } from "react";
import { CircleCheck, Download } from "lucide-react";
import { getStoryCharacters } from "@/lib/storyCharacters";

export function StoryCharacterPicker({ templateId, value, disabled, onChange }: {
  templateId: string;
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const characters = getStoryCharacters(templateId);
  if (!characters.length) return <p className="text-sm text-ink/60">此故事暂未配置形象照片，将按模板描述设计主角。</p>;

  return <fieldset disabled={disabled}>
    <legend className="mb-3 text-sm font-medium">选择主角形象</legend>
    <div className="grid max-h-[480px] grid-cols-2 gap-3 overflow-y-auto">
      {characters.map((character) => <label key={character.id} className={`relative min-w-0 cursor-pointer overflow-hidden rounded border bg-white ${value === character.id ? "border-teal ring-1 ring-teal" : "border-ink/15"}`}>
        <input type="radio" name="story-character" value={character.id} checked={value === character.id} disabled={failed.includes(character.id)} onChange={() => onChange(character.id)} className="absolute left-3 top-3 z-10 h-4 w-4 accent-teal" />
        <img src={character.imagePath} alt={character.name} className="aspect-square max-h-64 w-full object-contain" onError={() => {
          setFailed((current) => current.includes(character.id) ? current : [...current, character.id]);
          if (value === character.id) onChange("");
        }} />
        <div className="flex min-h-12 items-center justify-between gap-2 p-3 text-sm font-medium">
          <span>{character.name}{failed.includes(character.id) ? "（图片加载失败）" : ""}</span>
          {value === character.id && <CircleCheck size={18} className="shrink-0 text-teal" />}
        </div>
      </label>)}
    </div>
    {value && <a href={characters.find((item) => item.id === value)?.imagePath} download className="mt-3 inline-flex items-center gap-2 text-sm text-teal"><Download size={16} />下载角色图</a>}
  </fieldset>;
}
