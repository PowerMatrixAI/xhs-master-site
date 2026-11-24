"use client";
import { useEffect, useRef, useState } from "react";
import { authenticatedFetch, getUser, retrieveBackendKnowledgeSnapshot } from "@/lib/api";
import { createXhsRequestId } from "@/lib/xhs-signature";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { fetchFeaturedVlogTemplates, type FeaturedVlogTemplate, type VlogScript } from "@/lib/featuredVlog";
import { getProduction, listProductions, saveProduction, videoAccountContext, type ContentProduction, type ProductionUpdate } from "@/lib/contentProductions";
import { VLOG_CHARACTERS, type VlogCharacterSelection } from "@/lib/vlogCharacters";
import { runVlogProduction, productionScope, productionScript, VlogTaskLostError, VlogStageFailedError, type ProductionOptions, type ProductionContext, type VlogTaskResult } from "@/lib/vlogProduction";
import { readVlogProduction, writeVlogProduction } from "@/lib/vlogProductionStore";
import { submitMediaGeneration } from "@/lib/mediaTasks";
import { VlogProductionPanel } from "./VlogProductionPanel";
import { VlogPhotographyOverview } from "./VlogPhotographyOverview";
import type { VideoSourceAsset } from "@/lib/videoPrompts";

const endpoint = "/api/productions/vlog";
const initialSettings = { character: "linchuan" as VlogCharacterSelection, resolution: "720p" as const, useReferenceVideo: false };

export function ContentProductionPanel({ account, focusId, onSubmitted, onAccount }: {
  account?: Record<string, unknown> & { id: number; name: string; assets: Array<Omit<VideoSourceAsset, "fileUrl"> & { fileUrl?: string | null }> };
  focusId?: number; onSubmitted: (id: string) => void; onAccount: () => void;
}) {
  const [templates, setTemplates] = useState<FeaturedVlogTemplate[]>([]);
  const [works, setWorks] = useState<ContentProduction[]>([]);
  const [work, setWork] = useState<ContentProduction>();
  const [templateId, setTemplateId] = useState("");
  const [extra, setExtra] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [loadVersion, setLoadVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const current = useRef(work);
  current.current = work;
  const createKey = useRef("");
  const submitKey = useRef<{ fingerprint: string; id: string }>();
  const scope = work && account ? productionScope(getUser()?.uid || "", getBackendApiBaseUrl(), account.id, `production:${work.id}`) : "";

  useEffect(() => {
    let active = true;
    setWork(undefined); setWorks([]); setReady(false); setError("");
    if (!account) return;
    Promise.allSettled([fetchFeaturedVlogTemplates(), listProductions(account.id)]).then(([templateResult, worksResult]) => {
      if (!active) return;
      if (templateResult.status === "fulfilled") {
        setTemplates(templateResult.value);
        setTemplateId(templateResult.value[0]?.id || "");
      } else {
        setTemplates([]);
        setTemplateId("");
      }
      const failures = [templateResult, worksResult].filter(result => result.status === "rejected")
        .map(result => (result as PromiseRejectedResult).reason?.message || "加载失败，请重试。");
      if (failures.length) { setError(failures.join("；")); return; }
      if (worksResult.status !== "fulfilled") return;
      const records = worksResult.value;
      setWorks(records.items);
      setReady(true);
      const latest = records.items.find(w => w.id === focusId) || records.items[0];
      if (latest) {
        void getProduction(account.id, latest.id).then(saved => {
          if (active) { current.current = saved; setWork(saved); setExtra(saved.extraRequirements); setTemplateId(saved.templateId); }
        }).catch(e => { if (active) setError(e.message); });
      }
    });
    return () => { active = false; };
  }, [account?.id, focusId, loadVersion]);

  async function action<T>(name: string, body: Record<string, unknown> = {}, pending?: (id: string) => Promise<void>, resume?: string): Promise<T> {
    if (!mounted.current) throw new Error("页面已切换，请返回原作品继续。");
    let uuid = resume;
    if (!uuid) {
      let response: Response;
      try {
        response = await authenticatedFetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ account: videoAccountContext(account!), assets: account!.assets.filter(a => a.fileType.startsWith("image") && a.fileUrl?.startsWith("https://")),
            templateId: current.current?.templateId || templateId, templateVersion: current.current?.templateVersion,
            productionId: current.current?.id, featuredVlogScript: current.current?.script,
            character: current.current?.settings.character, resolution: current.current?.settings.resolution, action: name, ...body }) });
      } catch { throw new VlogTaskLostError("提交结果尚未确认，请先查询原任务，避免重复调用AI。"); }
      const data = await response.json();
      if (!response.ok) throw new VlogStageFailedError(data.error || "制作请求失败。");
      uuid = data.uuid;
      if (!uuid) throw new Error("服务端未返回任务编号。");
      await pending?.(uuid);
    }
    for (let attempt = 0; attempt < 180; attempt++) {
      if (!mounted.current) throw new Error("页面已切换，制作进度已保留。");
      const response = await authenticatedFetch(endpoint + "?uuid=" + encodeURIComponent(uuid!), { method: "GET" });
      const data = await response.json();
      if (response.status === 404) throw new VlogTaskLostError("任务状态已丢失，请明确重新执行。");
      if (!response.ok || data.status === "failed") throw new VlogStageFailedError(data.error || "制作失败。");
      if (data.status === "completed") return data.result as T;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error("仍在处理，可稍后继续查询。");
  }
  async function update(changes: ProductionUpdate) {
    if (!createKey.current) createKey.current = createXhsRequestId();
    if (!mounted.current) throw new Error("账号或页面已变化，请返回原作品继续。");
    const saved = await saveProduction(account!.id, changes, current.current, createKey.current);
    current.current = saved; setWork(saved);
    setWorks(items => [saved, ...items.filter(item => item.id !== saved.id)]);
    return saved;
  }
  async function perform(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }
  async function generateScript() {
    const template = templates.find(t => t.id === (work?.templateId || templateId));
    if (!template) throw new Error("请选择模板。");
    if (!current.current) await update({ title: template.name, templateId: template.id, templateVersion: template.version, templateSnapshot: template, extraRequirements: extra, settings: initialSettings, confirmed: false });
    let knowledgeSnapshotId = "";
    const snapshot = await retrieveBackendKnowledgeSnapshot(account!.id, [`${template.name}：${template.outline}；${extra}；检索民宿真实设施及目的地体验资料。`]).catch(() => null);
    if (snapshot?.hasReferences && snapshot.status.toLowerCase() === "ready") knowledgeSnapshotId = snapshot.snapshotId;
    const result = await action<{ script: VlogScript }>("script", { extraRequirements: extra, knowledgeSnapshotId, templateVersion: template.version });
    await update({ title: result.script.title, script: result.script, confirmed: false, templateVersion: template.version, templateSnapshot: template, extraRequirements: extra, knowledgeSnapshotId });
  }
  async function makeTask(options?: ProductionOptions, online = false) {
    if (!current.current?.confirmed || !current.current.script) throw new Error("请先确认脚本。");
    const source = current.current;
    const draft = await runVlogProduction({
      key: scope, taskId: source.id, source: source.script!, ...source.settings, choice: source.settings.character,
      options, getContext: () => action<ProductionContext>("featured_vlog_context"),
      load: () => readVlogProduction(scope), persist: writeVlogProduction,
      request: (name, body, pending, resume) => action(name, body, pending, resume),
      save: async result => {
        const match = result.openclawTask.content.match(/```json\n([\s\S]*?)\n```/);
        if (!match) throw new Error("制作计划缺失。");
        const staged = await readVlogProduction(scope);
        await update({ result, effectiveScript: productionScript(staged)?.script, plan: JSON.parse(match[1]) });
      }
    });
    if (!online || draft.waitingConfirmation || !mounted.current) return;
    const saved = current.current!;
    const result = draft.stages.build?.result as VlogTaskResult | undefined;
    if (!result || draft.stages.save?.status !== "completed") throw new Error("请先完成制作指令保存。");
    const fingerprint = JSON.stringify([saved.id, saved.revision, result.openclawTask.content]);
    if (submitKey.current?.fingerprint !== fingerprint) submitKey.current = { fingerprint, id: createXhsRequestId() };
    const job = await submitMediaGeneration({ source: "production", productionId: saved.id, productionRevision: saved.revision,
      accountId: saved.accountId, kind: "video", mode: "featured_vlog", assetIds: [], prompt: result.openclawTask.content,
      options: { ...saved.settings, plan: saved.plan } }, submitKey.current.id);
    onSubmitted(job.id);
  }
  if (!account) return <div className="panel"><p>请先创建或选择客户账号，提供民宿资料。</p><button className="primary-button mt-3" onClick={onAccount}>客户账号</button></div>;
  return <div className="space-y-5">
    <div className="panel"><h2 className="section-title">精选 Vlog 视频制作</h2><p className="mt-2 text-sm text-ink/60">结合{account.name}的资料、素材与模板，制作独立视频作品。</p>
      {error && <p role="alert" className="mt-3 text-coral">{error}</p>}
      {!ready && error && <button className="secondary-button mt-3" onClick={() => setLoadVersion(value => value + 1)}>重新加载</button>}
      <div className="mt-4 flex flex-wrap gap-3">
        <select aria-label="选择作品" className="rounded border p-2" value={work?.id || ""} disabled={busy || !ready} onChange={e => void perform(async () => {
          const id = Number(e.target.value);
          if (!id) { setWork(undefined); current.current = undefined; setExtra(""); createKey.current = createXhsRequestId(); return; }
          const selected = await getProduction(account.id, id);
          current.current = selected; setWork(selected); setExtra(selected.extraRequirements); setTemplateId(selected.templateId);
        })}><option value="">新建作品</option>{works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}</select>
        <select aria-label="选择Vlog模板" className="rounded border p-2" value={work?.templateId || templateId} disabled={busy || !!work || !templates.length} onChange={e => setTemplateId(e.target.value)}>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <label className="field mt-3"><span>补充要求</span><textarea value={extra} disabled={busy} onChange={e => setExtra(e.target.value)} /></label>
      <button className="primary-button mt-3" disabled={busy || !ready || !templateId} onClick={() => void perform(generateScript)}>{busy ? "正在处理…" : work?.script ? "重新生成脚本" : "生成脚本"}</button>
    </div>
    {work?.script && <div className="panel"><h3 className="section-title">{work.script.title}</h3><p className="my-3">{work.script.summary}</p>
      <VlogPhotographyOverview script={work.script} />
      {work.script.shots.map(shot => <div key={shot.order} className="mt-3 border-t pt-3"><strong>镜头{shot.order} · {shot.role} · {shot.duration}秒</strong><p>{shot.description}</p><p className="text-sm text-ink/60">{shot.transitionToNext ? `${shot.transitionToNext.type} · ${shot.transitionToNext.duration}秒 · ${shot.transitionToNext.reason}` : "末镜收束"}</p></div>)}
      {!work.confirmed && <button disabled={busy} className="primary-button mt-4" onClick={() => void perform(() => update({ confirmed: true }))}>确认脚本</button>}
    </div>}
    {work?.confirmed && work.script && <div className="panel"><h3 className="section-title">生成完整视频任务</h3>
      <div className="mt-4 flex flex-wrap gap-4">
        <label>人物形象 <select disabled={busy} value={work.settings.character} onChange={e => void perform(() => update({ settings: { ...work.settings, character: e.target.value as VlogCharacterSelection } }))}>
          <option value="none">不添加人物</option>{Object.entries(VLOG_CHARACTERS).map(([id,c]) => <option key={id} value={id}>{c.bindName}</option>)}
        </select></label>
        <label>生成清晰度 <select disabled={busy} value={work.settings.resolution} onChange={e => void perform(() => update({ settings: { ...work.settings, resolution: e.target.value as "720p" | "1080p" } }))}><option value="720p">720P</option><option value="1080p">1080P</option></select></label>
        <label><input type="checkbox" disabled={busy} checked={work.settings.useReferenceVideo} onChange={e => void perform(() => update({ settings: { ...work.settings, useReferenceVideo: e.target.checked } }))} /> 使用模板参考视频</label>
      </div>
      <VlogProductionPanel scope={scope} endpoint={endpoint} script={work.script} choice={work.settings.character} resolution={work.settings.resolution} useReferenceVideo={work.settings.useReferenceVideo} disabled={busy} onContinue={options => void perform(() => makeTask(options))} />
      <button className="primary-button mt-4" disabled={busy} onClick={() => void perform(() => makeTask(undefined, true))}>生成视频并保存</button>
    </div>}
    {work?.effectiveScript && <details className="panel"><summary>上次保存的实际制作脚本</summary><VlogPhotographyOverview script={work.effectiveScript} />{work.effectiveScript.shots.map(shot => <p key={shot.order} className="mt-2">镜头{shot.order} · {shot.description} · {shot.mainAction}</p>)}</details>}
    {work?.result && <div className="panel"><h3 className="section-title">已保存的制作指令</h3><p className="text-xs text-ink/60">修改脚本或设置后，请重新生成指令。</p><button className="secondary-button my-2" onClick={() => void perform(() => navigator.clipboard.writeText(work.result!.openclawTask.content))}>复制指令</button><textarea readOnly className="code-textarea min-h-64" value={work.result.openclawTask.content} /></div>}
  </div>;
}
