"use client";

import type { FeaturedVlogResolution } from "@/lib/featuredVlog";

export function FeaturedVlogResolutionSettings({ omni, value, disabled, onChange }: {
  omni: boolean; value: FeaturedVlogResolution; disabled: boolean;
  onChange: (value: FeaturedVlogResolution) => void;
}) {
  if (!omni) return <p className="mt-3 text-xs text-ink/55">重新生成Omni脚本后可选择生成清晰度。</p>;
  return <fieldset className="mt-4 space-y-2" disabled={disabled}>
    <legend className="text-sm font-medium">生成清晰度</legend>
    <div className="flex gap-5">{(["720p", "1080p"] as const).map(resolution => <label key={resolution} className="flex items-center gap-2 text-sm">
      <input type="radio" name="featured-vlog-resolution" value={resolution} checked={value === resolution} disabled={disabled} onChange={() => onChange(resolution)} />
      {resolution === "720p" ? "720P（默认）" : "1080P（原生生成）"}
    </label>)}</div>
    <p className="text-xs text-ink/55">最终文件均为1080×1920。720P会放大输出；1080P直接使用Kling高清生成，可能增加费用，不保证恢复低质参考图细节。</p>
  </fieldset>;
}
