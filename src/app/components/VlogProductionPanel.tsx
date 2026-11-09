"use client";
import { useEffect, useState } from "react";
import type { FeaturedVlogScript, FeaturedVlogResolution } from "@/lib/featuredVlog";
import type { VlogCharacterSelection } from "@/lib/vlogCharacters";
import { productionScript, stableJson, type VlogProductionDraft, type ProductionOptions } from "@/lib/vlogProduction";
import { readVlogProduction, writeVlogProduction, VLOG_PRODUCTION_EVENT } from "@/lib/vlogProductionStore";
import { authenticatedFetch } from "@/lib/api";
import { VlogPhotographyOverview } from "./VlogPhotographyOverview";

export function VlogProductionPanel({ scope, script, choice, resolution, disabled, onContinue }: {
  scope: string; script: FeaturedVlogScript; choice: VlogCharacterSelection; resolution: FeaturedVlogResolution;
  disabled: boolean; onContinue: (options: ProductionOptions) => void;
}) {
  const [draft, setDraft] = useState<VlogProductionDraft>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const read = () => { void readVlogProduction(scope).then(d => { if (live) { setDraft(d); setError(""); } }).catch(() => { if (live) setError("无法读取本地制作草稿，刷新恢复暂不可用。"); }); };
    setDraft(undefined); read(); window.addEventListener(VLOG_PRODUCTION_EVENT, read);
    return () => { live = false; window.removeEventListener(VLOG_PRODUCTION_EVENT, read); };
  }, [scope]);
  useEffect(() => {
    if (disabled || !draft) return;
    const pending = Object.entries(draft.stages).find(([,s])=>s?.status === "pending" && s.uuid);
    if (!pending) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [key, stage] = pending;
        const res = await authenticatedFetch(`/api/note-tasks/${draft.taskId}/video-prompt?uuid=${encodeURIComponent(stage!.uuid!)}`, { method:"GET" });
        const data = await res.json();
        if (cancelled) return;
        const current = await readVlogProduction(scope);
        const record = current?.stages[key as keyof typeof current.stages];
        if (!current || !record || record.uuid !== stage!.uuid || record.status !== "pending") return;
        if (res.status === 404) { record.status="lost"; record.error="任务状态已丢失，请明确重新执行。"; }
        else if (data.status === "completed") { record.status="completed"; record.result=data.result; delete record.uuid; delete record.error; }
        else if (data.status === "failed") { record.status="failed"; record.error=data.error; delete record.uuid; }
        else { setDraft({...current}); return; }
        await writeVlogProduction(current);
      } catch { if (!cancelled) setError("查询进度暂时失败，已保留任务编号，可点击继续查询。"); }
    }, 5000);
    return ()=>{cancelled=true;clearTimeout(timer);};
  }, [scope, draft, disabled]);
  const sameScript = !!draft && stableJson(draft.sourceScript) === stableJson(script);
  const sameChoice = draft?.choice === choice;
  const adaptation = sameScript && sameChoice ? productionScript(draft) : undefined;
  const needsConfirmation = adaptation?.requiresConfirmation && draft?.confirmedFingerprint !== draft?.stages.adapt?.fingerprint;
  const saveOnly = sameScript && sameChoice && draft?.resolution === resolution && draft?.stages.save?.status === "failed";
  const lost = sameScript && Object.values(draft!.stages).some(s => s?.status === "lost");
  return <div className="mt-4 rounded border border-teal/20 bg-teal/5 p-4 text-sm">
    <h4 className="font-semibold">本次制作脚本与进度</h4>
    {(error || draft?.localSaveError) && <p role="alert" className="mt-2 text-coral">{error || draft?.localSaveError}</p>}
    {draft && (!sameScript || !sameChoice || draft.resolution !== resolution) && <p className="mt-2 text-ink/60">设置或脚本已变化，继续时仅更新受影响的阶段。</p>}
    {!adaptation ? <p className="mt-2 text-ink/60">生成任务后在此查看实际使用的制作脚本，阶段结果会自动保存。</p> : <>
      <p className="mt-2 font-medium">{adaptation.script.title}</p><p className="mt-1">{adaptation.script.summary}</p>
      <VlogPhotographyOverview script={adaptation.script} />
      <details className="mt-2"><summary className="cursor-pointer">修改说明及实际镜头内容</summary>
        <ul className="my-2 list-inside list-disc">{adaptation.changes.map((change,i)=><li key={i}>{change}</li>)}</ul>
        {adaptation.script.shots.map(s=><div key={s.order} className="mt-2 border-t border-ink/10 pt-2"><p>镜头{s.order} · {s.role} · {s.duration}秒 · {s.subjectPresence === "environment" ? "无人环境" : s.subjectPresence === "pov" ? "主观视角" : "人物入镜"}</p><p>{s.description}</p><p>动作：{s.mainAction}</p><p>起始：{s.startState?.location}，{s.startState?.characters.map(c=>`${c.id} ${c.pose}`).join("、") || "无人"} → 结束：{s.endState?.location}，{s.endState?.characters.map(c=>`${c.id} ${c.pose}`).join("、") || "无人"}</p><p>转场：{s.transitionToNext ? `${s.transitionToNext.type} ${s.transitionToNext.duration}秒 · ${s.transitionToNext.reason}` : "末镜收束"}</p></div>)}
      </details>
    </>}
    {sameScript && draft && <ul className="mt-3 space-y-1 text-xs">{Object.entries(draft.stages).map(([key,stage])=><li key={key}>{({ adapt:"制作脚本",frames:"场景选图",music:"配乐选择",build:"任务指令",save:"保存笔记" } as Record<string,string>)[key]}：{({ pending:"处理中，可继续查询",completed:"已完成",failed:"失败，可重试",lost:"任务状态已丢失" })[stage!.status]}{stage!.error && ` · ${stage!.error}`}</li>)}</ul>}
    <div className="mt-3 flex flex-wrap gap-2">
      {needsConfirmation ? <button className="primary-button" disabled={disabled} onClick={()=>onContinue({confirm:draft?.stages.adapt?.fingerprint})}>采用此制作脚本并继续</button> : <button className="primary-button" disabled={disabled} onClick={()=>onContinue({retryLost:!!lost,saveOnly})}>{disabled ? "正在处理…" : !sameScript ? "生成精选Vlog任务" : lost ? "重新执行丢失阶段" : saveOnly ? "重试保存" : "继续生成 / 更新任务指令"}</button>}
      {adaptation && !needsConfirmation && <><button className="secondary-button" disabled={disabled} onClick={()=>onContinue({force:"frames"})}>重新选图</button><button className="secondary-button" disabled={disabled} onClick={()=>onContinue({force:"music"})}>重新选曲</button></>}
    </div>
    {sameScript && draft?.stages.build?.status === "completed" && <details className="mt-3"><summary className="cursor-pointer">已生成的任务指令（本地保存）</summary><textarea readOnly className="code-textarea mt-2 min-h-48" value={(draft.stages.build.result as {videoPrompt?:{content:string}})?.videoPrompt?.content || ""} /></details>}
  </div>;
}
