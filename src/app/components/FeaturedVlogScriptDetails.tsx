import type { VlogScript } from "@/lib/featuredVlog";
import { videoTimelineDuration, type TimedVideoShot } from "@/lib/videoTimeline";
import { VlogPhotographyOverview } from "./VlogPhotographyOverview";

function VideoTimingDetails({ shot }: { shot: TimedVideoShot }) {
  const transition = shot.transitionToNext;
  return <div className="mt-2 space-y-1 text-xs text-teal">
    <p>镜头时长：{shot.duration} 秒 · {transition ? transition.type === "dissolve" ? `短叠化 ${transition.duration} 秒` : "自然切换" : "末镜自然收束"}</p>
    {transition && <p>{transition.reason}；{transition.outgoingState} → {transition.incomingState}</p>}
    {shot.narrationText && <p className="text-ink/70">旁白：{shot.narrationText}</p>}
  </div>;
}

export function FeaturedVlogScriptDetails({ script }: { script: VlogScript }) {
  return <>
            <p className="mt-3 text-sm leading-6 text-ink/75">{script.summary}</p>
            <p className="mt-2 text-sm"><span className="font-medium">叙事视角：</span>{script.perspective}</p>
            <p className="mt-2 text-sm"><span className="font-medium">整体情绪：</span>{script.moodTags.join("、") || "按脚本自然呈现"}</p>
            <p className="mt-2 text-sm"><span className="font-medium">建议配乐氛围：</span>{script.musicTags.join("、") || "由系统根据脚本自动匹配"}</p>
            <p className="mt-2 text-sm"><span className="font-medium">视频规格：</span>{script.shots.length} 个镜头 / 预计 {videoTimelineDuration(script.shots, script.timingVersion)} 秒{script.timingVersion === 2 && "（已扣除转场重叠）"}</p>
            {script.sceneVersion === 1 && <details className="mt-3 rounded border border-ink/10 p-3 text-sm">
              <summary className="cursor-pointer font-medium">人物与镜头起止状态</summary>
              <div className="mt-2 space-y-2 text-xs text-ink/70">{script.characters?.map(c => <p key={c.id}>{c.id}：{c.appearance} · 道具：{c.props.join("、") || "无"}</p>)}</div>
              {script.shots.map(s => <div key={s.order} className="mt-3 border-t border-ink/10 pt-2 text-xs leading-6">
                <p className="font-semibold">镜头 {s.order} · 起始出镜 {s.startState?.characters.length} 人</p>
                <p>起始：{s.startState?.location}；{s.startState?.characters.map(c => `${c.id} 在${c.position}，${c.pose}（${c.view}）`).join("；") || "无人出镜"}；道具：{s.startState?.props.join("、") || "无"}</p>
                <p>主要动作：{s.mainAction}</p>
                <p>结束：{s.endState?.location}；{s.endState?.characters.map(c => `${c.id} 在${c.position}，${c.pose}`).join("；") || "无人出镜"}；道具：{s.endState?.props.join("、") || "无"}</p>
                <p>承接：{s.continuityNote}；入场/离场：{s.characterChanges?.map(c => `${c.id} ${c.type}：${c.reason}`).join("；") || "无"}</p>
              </div>)}
            </details>}
            {script.timingVersion === 2 && <div className="mt-3 rounded border border-teal/15 p-3">{script.shots.map(shot => <div key={shot.order} className="mb-3"><span className="text-xs font-semibold">镜头 {shot.order} 时间线</span><VideoTimingDetails shot={shot} /></div>)}</div>}
            <VlogPhotographyOverview script={script} />
            {script.productionVersion === 3 && <div className="mt-3 space-y-3 rounded border border-teal/15 p-3"><p className="text-sm font-semibold">Omni 场景参考与暂定拍法 · 9:16</p><p className="text-xs text-ink/60">此处确认内容、游客A的出镜安排及时间线，不绑定具体人物；实际人物形象或无人模式在第二步选择。旧脚本已有人物描述时也以第二步制作适配为准。景别、机位、构图和运镜仅供参考，最终拍法由智能体查看实际图片后确定。</p>{script.shots.map(s => s.direction && <div key={s.order} className="text-sm"><p>镜头 {s.order} · {s.direction.focus}</p><p>暂定摄影：{s.direction.photography.scale} / {s.direction.photography.height} / {s.direction.photography.angle}；{s.direction.photography.composition}；{s.direction.photography.depth}</p><p>动作：{s.direction.action}</p><p>暂定运镜：{s.direction.camera.type}；{s.direction.camera.direction}；{s.direction.camera.speed}；{s.direction.camera.extent}</p><p>安排：{s.direction.timing.map(p => `${p.start}–${p.end}秒 ${p.action}`).join("；")}</p><p>结束：{s.direction.ending}</p></div>)}</div>}
            <div className="mt-4 divide-y divide-ink/10 border-y border-ink/10">{script.shots.map((shot) => <div key={shot.order} className="grid gap-1 py-3 text-sm sm:grid-cols-[74px_1fr]"><div className="font-semibold text-teal">镜头 {shot.order}</div><div><div className="font-medium">{shot.beat}｜{shot.role}</div><div className="mt-1 text-ink/70">{shot.description}</div><div className="mt-1 text-xs text-ink/50">建议素材：{shot.suggestedMaterial} · {shot.subjectPresence === "pov" ? "主观镜头" : shot.subjectPresence === "traveler" ? "游客入镜" : "环境镜头"}</div></div></div>)}</div>
  </>;
}
