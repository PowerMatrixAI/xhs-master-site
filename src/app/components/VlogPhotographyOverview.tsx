import type { FeaturedVlogScript } from "@/lib/featuredVlog";
import { CAMERA_LABELS, SUBJECT_ROLES, photographyHints } from "@/lib/vlogPhotography";

export function VlogPhotographyOverview({ script }: { script: FeaturedVlogScript }) {
  if (script.productionVersion !== 3) return null;
  if (script.photographyVersion !== 1) return <p className="mt-3 text-xs text-ink/60">此为旧版摄影设计，重新生成脚本后可查看完整人物关系与起终构图。</p>;
  const hints = photographyHints(script);
  return <section className="mt-3 space-y-2 rounded border border-teal/20 p-3 text-sm" aria-label="全片摄影概览">
    <h4 className="font-semibold">全片摄影概览</h4>
    <p className="text-xs text-ink/60">以下为摄影意图。智能体看完全部场景图后统筹最终拍法；摄影提示供检查，不阻止生成。</p>
    {script.shots.map(s => s.direction && <div key={s.order} className="border-t border-ink/10 pt-2">
      <p>镜头{s.order} · {s.direction.subjectRole && SUBJECT_ROLES[s.direction.subjectRole]} · {s.direction.photography.scale} · {CAMERA_LABELS[s.direction.camera.type]}</p>
      <p>呈现：{s.direction.subjectPresentation}；焦点：{s.direction.focusTarget}</p>
      <p>起幅：{s.direction.camera.startFrame} → 终幅：{s.direction.camera.endFrame}</p>
      <p>预期变化：{s.direction.camera.visualChange}；目的：{s.direction.camera.reason}</p>
    </div>)}
    {hints.length > 0 && <div className="rounded bg-amber-50 p-2 text-xs"><p className="font-medium">摄影提示</p><ul className="list-inside list-disc">{hints.map(h=><li key={h}>{h}</li>)}</ul></div>}
  </section>;
}
