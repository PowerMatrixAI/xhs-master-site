"use client";

import { VLOG_CHARACTERS, type VlogCharacterSelection } from "@/lib/vlogCharacters";

export function FeaturedVlogCharacterSettings({ value, disabled, onChange }: {
  value: VlogCharacterSelection; disabled: boolean; onChange: (value: VlogCharacterSelection) => void;
}) {
  return <div className="mt-4 space-y-2">
    <label className="field"><span>人物形象</span><select aria-label="人物形象" value={value} disabled={disabled} onChange={e => onChange(e.target.value as VlogCharacterSelection)}>
      <option value="none">不添加人物（纯环境视频）</option>
      {Object.entries(VLOG_CHARACTERS).map(([key, person]) => <option key={key} value={key}>{person.bindName}</option>)}
    </select></label>
    <p className="text-xs text-ink/55">按模板决定人物出现的镜头，不会每镜都加人。更换形象会适配外观与道具；不添加人物会将人物动作转换为环境呈现，不生成手部、剪影或其他人物。原确认脚本保留，适配结果用于本次制作任务。</p>
  </div>;
}
