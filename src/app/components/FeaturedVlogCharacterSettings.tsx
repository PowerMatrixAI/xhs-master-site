"use client";

import Image from "next/image";
import { VLOG_CHARACTERS, type VlogCharacterSelection } from "@/lib/vlogCharacters";

export function FeaturedVlogCharacterSettings({ value, disabled, onChange }: {
  value: VlogCharacterSelection; disabled: boolean; onChange: (value: VlogCharacterSelection) => void;
}) {
  const person = value === "none" ? undefined : VLOG_CHARACTERS[value];
  return <div className="mt-4 space-y-2">
    <label className="field"><span>人物形象</span><select aria-label="人物形象" value={value} disabled={disabled} onChange={e => onChange(e.target.value as VlogCharacterSelection)}>
      <option value="none">不添加人物（纯环境视频）</option>
      {Object.entries(VLOG_CHARACTERS).map(([key, person]) => <option key={key} value={key}>{person.bindName}</option>)}
    </select></label>
    {person && <div className="flex items-start gap-4 rounded-lg border border-ink/10 bg-white/60 p-3"><a href={`/vlog-characters/${value}-full.png`} target="_blank" rel="noreferrer" aria-label={`查看${person.bindName}形象大图`}><Image width={256} height={480} sizes="128px" key={value} src={`/vlog-characters/${value}-full.png`} alt={person.bindName + "人物形象"} className="h-60 w-32 rounded-md bg-ink/5 object-contain" /></a><div className="min-w-0"><p className="text-sm font-medium">{person.bindName}</p><p className="mt-2 text-xs leading-6 text-ink/60">{person.appearance}</p><p className="mt-2 text-xs text-teal">点击图片查看大图</p></div></div>}
    <p className="text-xs text-ink/55">按模板决定人物出现的镜头，不会每镜都加人。更换形象会适配外观与道具；不添加人物会将人物动作转换为环境呈现，不生成手部、剪影或其他人物。原确认脚本保留，适配结果用于本次制作任务。</p>
  </div>;
}
