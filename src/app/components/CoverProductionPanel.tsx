"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Plus, LoaderCircle } from "lucide-react";
import { authenticatedFetch, getUser } from "@/lib/api";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { createXhsRequestId } from "@/lib/xhs-signature";
import { getCoverProduction, listCoverProductions, saveCoverProduction } from "@/lib/contentProductions";
import { coverStyles, coverInputSchema, coverConfirmations, validateCoverVariants, buildCoverExecution, type CoverInput, type CoverVariant, type CoverVariantId, type CoverProduction } from "@/lib/coverProduction";
import { getMediaTask, submitMediaGeneration, activeMediaStatuses, type MediaTask, type MediaGenerationInput } from "@/lib/mediaTasks";
import { createCoverBatch, submitCoverBatch, buildSingleCoverExecution, type CoverBatch } from "@/lib/coverBatch";
import { CoverBatchResults } from "./CoverBatchResults";
import { findMediaTaskByRequestId } from "@/lib/mediaTasks";
import { CoverTaskResults } from "./CoverTaskResults";

type Asset = { id: number; fileType: string; fileUrl?: string | null; filePath: string; tags: string; aiAnalysis?: string; aiAnalysisStatus?: string; width?: number; height?: number };
type Draft = { assetId: number; text: string; requiredText: string; requirements: string; variants: CoverVariant[]; plannedInput?: CoverInput; uuid?: string; taskId?: string };
const blank = (): Draft => ({ assetId: 0, text: "", requiredText: "", requirements: "", variants: [] });
const endpoint = "/api/productions/cover";
export function CoverProductionPanel({ account, focusId, onAccount, onTasks }: {
  account?: { id: number; name: string; accountType: string; taboos: string; assets: Asset[] };
  focusId?: number; onAccount: () => void; onTasks: (id: string) => void;
}) {
  const [works, setWorks] = useState<CoverProduction[]>([]);
  const [work, setWork] = useState<CoverProduction>();
  const currentWork = useRef<CoverProduction>();
  currentWork.current = work;
  const [pendingBatch, setPendingBatch] = useState<CoverBatch>();
  const [draft, setDraft] = useState<Draft>(blank);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState("");
  const [submissionNotice, setSubmissionNotice] = useState("");
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [task, setTask] = useState<MediaTask>();
  const live = useRef(true);
  const creationId = useRef("");
  const key = JSON.stringify(["cover", getUser()?.uid, getBackendApiBaseUrl(), account?.id]);
  function remember(value: Draft, workId = work?.id, revision = work?.revision) {
    setDraft(value);
    localStorage.setItem(key, JSON.stringify({ workId, revision, draft: value }));
  }
  function restore(saved: CoverProduction) {
    currentWork.current = saved; setWork(saved);
    try {
      const cached = JSON.parse(localStorage.getItem(key + ":batch:" + saved.id) || "null") as CoverBatch | null;
      setPendingBatch(cached?.items.some(i=>i.status!=="submitted") ? cached : saved.batches?.find(b=>b.items.some(i=>i.status!=="submitted")));
    } catch { setPendingBatch(saved.batches?.find(b=>b.items.some(i=>i.status!=="submitted"))); }
    setDraft({ assetId: saved.input.asset.id, text: saved.input.text, requiredText: saved.input.requiredText, requirements: saved.input.requirements, variants: saved.variants || [], plannedInput: saved.variants?.length ? saved.input : undefined, taskId: saved.latestTaskId });
  }
  useEffect(() => {
    live.current = true;
    setReady(false); setError("");
    if (!account) return;
    let active = true;
    listCoverProductions(account.id).then(async records => {
      if (!active) return;
      setWorks(records.items);
      let cached: { workId?: number; revision?: number; draft?: Draft } = {};
      try { cached = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
      const id = focusId || cached.workId || (cached.draft ? undefined : records.items[0]?.id);
      if (id) {
        const saved = await getCoverProduction(account.id, id);
        if (!active) return;
        restore(saved);
        // Local pending edits and planning job survive refresh on the same work.
        if (!focusId && cached.workId === id && cached.revision === saved.revision && cached.draft) setDraft(cached.draft);
      } else if (cached.draft) setDraft(cached.draft);
      setReady(true);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; live.current = false; };
  }, [account?.id, focusId, key, reload]);
  useEffect(() => {
    if (!draft.taskId) { setTask(undefined); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await getMediaTask(draft.taskId!);
        if (stopped) return;
        setTask(result);
        if (activeMediaStatuses.includes(result.status)) timer = setTimeout(poll, 5000);
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "查询制作进度失败"); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [draft.taskId, reload]);
  const assets = account?.assets.filter(a => a.fileType.startsWith("image") && a.fileUrl?.startsWith("https://")) || [];
  const asset = assets.find(a => a.id === draft.assetId);
  function input(): CoverInput {
    if (!asset) throw new Error("请从当前账号素材库选择一张可用图片。");
    return coverInputSchema.parse({ asset: { id: asset.id, imageUrl: asset.fileUrl, name: asset.filePath, analysis: asset.aiAnalysisStatus === "deleted" ? "" : asset.aiAnalysis || "", tags: asset.tags, width: asset.width, height: asset.height },
      text: draft.text, requiredText: draft.requiredText, requirements: draft.requirements });
  }
  const generationActive = !!task && (activeMediaStatuses.includes(task.status) || task.status === "unknown");
  const changed = !draft.plannedInput || !asset || draft.plannedInput.asset.id !== asset.id || draft.plannedInput.text !== draft.text.trim() || draft.plannedInput.requiredText !== draft.requiredText || draft.plannedInput.requirements !== draft.requirements;
  async function perform(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "操作失败"); }
    finally { busyRef.current = false; if (live.current) { setBusy(false); setSubmissionProgress(""); } }
  }
  async function save(next: Draft, newlyConfirmed: CoverVariantId[] = [], execution?: ReturnType<typeof buildCoverExecution>) {
    if (!live.current) throw new Error("页面已切换，请返回原作品继续。");
    const data = input();
    creationId.current ||= createXhsRequestId();
    const confirmedVariantIds = coverConfirmations(work, data, next.variants, newlyConfirmed);
    const saved = await saveCoverProduction(account!.id, { input: data, variants: next.variants, confirmed: confirmedVariantIds.length === 3, confirmedVariantIds,
      ...(confirmedVariantIds.length ? { plan: { version: 1, kind: "cover_image", input: data, variants: next.variants } as const } : {}) }, work, creationId.current, execution);
    if (!live.current) throw new Error("页面已切换，作品已保存。");
    setWork(saved); setWorks(items => [saved, ...items.filter(w => w.id !== saved.id)]); remember(next, saved.id, saved.revision);
    return saved;
  }
  async function plan(resume = false) {
    const data = input();
    let uuid = resume ? draft.uuid : undefined;
    if (!uuid) {
      const response = await authenticatedFetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: data, account: { id: account!.id, name: account!.name, accountType: account!.accountType, taboos: account!.taboos } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "封面方案生成失败。");
      uuid = result.uuid;
      if (!uuid) throw new Error("规划任务缺少编号。");
      remember({ ...draft, uuid, plannedInput: data });
    }
    for (let n = 0; n < 120; n++) {
      if (!live.current) return;
      const response = await authenticatedFetch(endpoint + "?uuid=" + encodeURIComponent(uuid!));
      const result = await response.json();
      if (response.status === 404 || result.status === "failed") {
        remember({ ...draft, uuid: undefined });
        throw new Error(result.error || "规划任务失败，请重新生成。");
      }
      if (!response.ok) throw new Error(result.error || "查询失败，可继续查询原任务。");
      if (result.status === "completed") {
        const variants = validateCoverVariants(result.result.variants, data);
        const next = { ...draft, variants, plannedInput: data, uuid: undefined };
        remember(next);
        await save(next);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error("规划仍在处理，请稍后继续查询。");
  }
  async function generateBatch(ids: CoverVariantId[], resume = false) {
    setSubmissionNotice(""); setSubmissionProgress("正在核对原任务…");
    // Refresh revision first: a previous save response may have been lost.
    if (currentWork.current) {
      const latest = await getCoverProduction(account!.id,currentWork.current.id);
      currentWork.current=latest;setWork(latest);
    }
    const cacheKey = key + ":batch:" + (currentWork.current?.id || "new");
    const stored = localStorage.getItem(cacheKey);
    const cached = stored ? JSON.parse(stored) as CoverBatch : undefined;
    const unfinished = cached?.items.some(i => i.status !== "submitted") ? cached : currentWork.current?.batches?.find(b=>b.items.some(i=>i.status!=="submitted"));
    if (unfinished && !resume) throw new Error("上一批提交尚未完成，请继续原批次，不能重新提交。");
    const data = unfinished?.input || input();
    const variants = unfinished?.variants || validateCoverVariants(draft.variants, data);
    const batch = unfinished || createCoverBatch(data,variants,ids,createXhsRequestId);
    const persisted=currentWork.current?.batches?.find(b=>b.id===batch.id);
    if (persisted) for (const item of batch.items) {
      const server=persisted.items.find(i=>i.variantId===item.variantId);
      if (server?.taskId || (item.status==='planned' && server?.status==='prepared')) Object.assign(item,server);
    }
    for (const item of batch.items) if(item.status==='prepared' && !item.submission) {
      const execution=buildSingleCoverExecution(batch.input,batch.variants,item.variantId);
      const saved=currentWork.current;
      if(saved?.result?.openclawTask.content===execution.prompt) item.submission={source:'production',productionId:saved.id,productionRevision:saved.revision,accountId:account!.id,kind:'image',mode:'remote_images',assetIds:[batch.input.asset.id],prompt:execution.prompt,options:{title:execution.title,noteContent:batch.input.text,singleGoal:execution.title,imageCount:'1',realImageRefinementRequirement:batch.input.requirements,removeWatermarks:false}};
    }
    setPendingBatch(batch);
    const checkpointLocal = () => { localStorage.setItem(cacheKey,JSON.stringify(batch)); setPendingBatch(structuredClone(batch)); };
    const persist = async (execution?: ReturnType<typeof buildSingleCoverExecution>) => {
      const existing=currentWork.current;
      const batches=[...(existing?.batches || []).filter(b=>b.id!==batch.id),batch];
      creationId.current ||= createXhsRequestId();
      const saved=await saveCoverProduction(account!.id,{input:batch.input,variants:batch.variants,confirmed:!!execution,confirmedVariantIds:batch.items.map(i=>i.variantId),batches},existing,creationId.current,execution);
      currentWork.current=saved;setWork(saved);setWorks(items=>[saved,...items.filter(w=>w.id!==saved.id)]);
      return saved;
    };
    // Query all prior task handles before opening a new paid cycle.
    for (const old of currentWork.current?.batches || []) {
      if (old.id === batch.id) continue;
      for (const item of old.items) {
      if (!item.taskId) throw new Error("旧提交结果未核实，请恢复原批次。");
      const job=await getMediaTask(item.taskId);
      if (activeMediaStatuses.includes(job.status)||job.status==='unknown') throw new Error("已有图片任务执行中或待核实，请先等待结果。");
    }
    }
    checkpointLocal();
    if (!unfinished) await persist();
    await submitCoverBatch(batch,{
      prepare: async item => {
        setSubmissionProgress(`正在保存${coverStyles.find(s=>s.id===item.variantId)!.name}制作方案…`);
        item.status='prepared';
        const execution=buildSingleCoverExecution(batch.input,batch.variants,item.variantId);
        const saved=await persist(execution);
        return {source:'production',productionId:saved.id,productionRevision:saved.revision,accountId:account!.id,kind:'image',mode:'remote_images',assetIds:[batch.input.asset.id],prompt:saved.result!.openclawTask.content,
          options:{title:execution.title,noteContent:batch.input.text,singleGoal:execution.title,imageCount:'1',realImageRefinementRequirement:batch.input.requirements,removeWatermarks:false}};
      },
      checkpoint:async()=>{checkpointLocal();if(batch.items.every(i=>i.status!=='prepared')) await persist();},
      submit:async (payload, requestId) => {
        const index=batch.items.findIndex(i=>i.requestId===requestId);
        setSubmissionProgress(`任务提交中（${index+1}/${batch.items.length}）…`);
        return submitMediaGeneration(payload,requestId);
      }, find:findMediaTaskByRequestId
    });
    localStorage.removeItem(cacheKey); setPendingBatch(undefined);
    setSubmissionNotice(`${batch.items.length} 个封面任务已提交，正在排队或制作中，可在下方查看各版进度。`);
    remember({...draft,taskId:undefined},currentWork.current?.id,currentWork.current?.revision);
  }
  async function generate(ids: CoverVariantId[]) {
    setSubmissionNotice(""); setSubmissionProgress("正在准备提交…");
    if (generationActive) throw new Error("已有图片任务执行中或结果待核实，请先查询该任务。");
    if (changed || !draft.variants.length) throw new Error("原图或需求已变化，请先重新生成方案。");
    // Old pending submissions may have reached the server: reconcile, never replay the old multi-version prompt.
    const legacyKey = key + ":submission:" + (work?.id || "new");
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      const pending = JSON.parse(legacy) as { id?: string };
      if (!pending.id) throw new Error("旧任务提交记录不完整，请先核实任务列表中的结果。");
      const previous = await findMediaTaskByRequestId(pending.id);
      if (previous) {
        remember({ ...draft, taskId: previous.id }); setTask(previous);
        localStorage.removeItem(legacyKey);
        throw new Error("已找回旧任务，请先查看其结果，再决定是否制作新版。");
      }
      localStorage.removeItem(legacyKey);
    }
    await generateBatch(ids);
  }
  if (!account) return <div className="panel"><p>请先选择客户账号。</p><button className="primary-button mt-3" onClick={onAccount}>客户账号</button></div>;
  return <div className="space-y-5">
    <div className="panel"><h2 className="section-title">制作封面图</h2><p className="mt-2 text-sm text-ink/60">选择一张图片，确认三版文字后，生成三种风格的封面。</p>
      {error && <p role="alert" className="mt-3 whitespace-pre-wrap text-coral">{error}</p>}
      {!ready && error && <button className="secondary-button mt-3" onClick={() => setReload(n => n + 1)}>重新加载</button>}
      <div className="mt-4 rounded-xl border border-ink/10 bg-ink/[0.02] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="field min-w-0 flex-1"><span>封面作品</span>
            <select value={work?.id || ""} disabled={busy || !ready} onChange={e => void perform(async () => {
              const id = Number(e.target.value);
              if (!id) return;
              const selected = await getCoverProduction(account.id, id); restore(selected); localStorage.removeItem(key);
            })}>
              <option value="" disabled>{works.length ? "新建作品（尚未保存）" : "暂无作品，请选择图片开始制作"}</option>
              {works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>
          </label>
          <button type="button" className="secondary-button h-11 shrink-0" disabled={busy || !ready || !!draft.uuid} onClick={() => {
            setPendingBatch(undefined); currentWork.current = undefined; setWork(undefined); creationId.current = "";
            setError(""); setFilter(""); setTask(undefined);
            const empty = blank(); setDraft(empty); localStorage.setItem(key, JSON.stringify({ draft: empty }));
          }}><Plus size={16} />新建作品</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-teal/10 px-2 py-1 font-medium text-teal">{work ? "编辑已有作品" : "新建作品"}</span>
          <span className="text-ink/60">{work ? "修改后将覆盖当前作品的对应内容；如需保留原作品，请先点击“新建作品”。" : "生成方案后会保存为新作品，不影响已有作品。"}</span>
        </div>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="panel"><h3 className="section-title">选择一张素材图</h3><input aria-label="搜索素材标签或文件名" placeholder="搜索标签或文件名" className="my-3 w-full rounded border p-2" value={filter} onChange={e => setFilter(e.target.value)} />
        <div className="grid max-h-[480px] grid-cols-3 gap-2 overflow-y-auto">
          {assets.filter(a => (a.tags + a.filePath).toLowerCase().includes(filter.toLowerCase())).map(a => <button key={a.id} type="button" disabled={busy || !!draft.uuid} aria-label={"选择素材 " + a.id} aria-pressed={draft.assetId === a.id} onClick={() => remember({ ...draft, assetId: a.id })} className={`relative overflow-hidden rounded-lg border-2 ${draft.assetId === a.id ? "border-teal" : "border-transparent"}`}><img src={a.fileUrl!} alt={a.tags || "素材图"} className="aspect-[3/4] w-full object-cover" loading="lazy" />{draft.assetId === a.id && <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-teal text-white shadow-md ring-2 ring-white"><Check size={18} strokeWidth={3} /></span>}</button>)}
        </div>{!assets.length && <p className="text-sm text-ink/60">当前账号没有可用图片，请先在素材库上传。</p>}
      </div>
      <div className="panel space-y-3"><h3 className="section-title">封面内容</h3>
        <label className="field"><span>主题或原始文字</span><textarea maxLength={1000} disabled={busy || !!draft.uuid} value={draft.text} onChange={e => remember({ ...draft, text: e.target.value })} placeholder="例如：在秦岭山林里，住进一个安静的周末" /></label>
        <label className="field"><span>必须保留的信息（选填，每行一项）</span><textarea maxLength={500} disabled={busy || !!draft.uuid} value={draft.requiredText} onChange={e => remember({ ...draft, requiredText: e.target.value })} /></label>
        <label className="field"><span>补充设计要求（选填）</span><textarea maxLength={2000} disabled={busy || !!draft.uuid} value={draft.requirements} onChange={e => remember({ ...draft, requirements: e.target.value })} /></label>
        <button className="primary-button" disabled={busy || !ready || !asset || !draft.text.trim()} onClick={() => void perform(() => plan(!!draft.uuid))}>{busy ? "正在处理…" : draft.uuid ? "继续查询三版方案" : "生成三版方案"}</button>
        <p className="text-xs text-ink/55">先确认文字，再制作图片。主标题建议6–18个汉字。</p>
      </div>
    </div>
    {!!draft.variants.length && <div className="panel">
      <h3 className="section-title">确认三版文字与设计</h3>
      {changed && <p className="my-3 text-coral">原图或输入已变化，请重新生成方案。</p>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">{draft.variants.map((variant, index) => <div key={variant.variantId} className="rounded-xl border border-ink/10 p-4">
        <h4 className="font-semibold">{coverStyles.find(s => s.id === variant.variantId)?.name}</h4>
        <label className="field mt-3"><span>主标题</span><textarea aria-label={variant.variantId + "主标题"} value={variant.title} maxLength={120} disabled={busy} onChange={e => remember({ ...draft, variants: draft.variants.map((v,i) => i === index ? { ...v, title: e.target.value } : v) })} /></label>
        {variant.title.length > 18 && <p className="text-xs text-amber-700">标题较长，建议缩短以提升可读性。</p>}
        <label className="field mt-2"><span>副标题</span><textarea aria-label={variant.variantId + "副标题"} value={variant.subtitle} maxLength={300} disabled={busy} onChange={e => remember({ ...draft, variants: draft.variants.map((v,i) => i === index ? { ...v, subtitle: e.target.value } : v) })} /></label>
        <label className="field mt-2"><span>设计说明</span><textarea aria-label={variant.variantId + "设计说明"} value={variant.design} maxLength={1200} disabled={busy || generationActive} onChange={e => remember({ ...draft, variants: draft.variants.map((v,i) => i === index ? { ...v, design: e.target.value } : v) })} /></label>
        <button className="secondary-button" disabled={busy || generationActive || changed || !!draft.uuid} onClick={() => void perform(() => generate([variant.variantId]))}>确认并制作此版本</button>
      </div>)}</div>
      {(submissionProgress || submissionNotice) && <p role="status" aria-live="polite" className="mt-3 text-sm text-teal">{submissionProgress ? `${submissionProgress} 请勿重复点击。` : submissionNotice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-coral">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3"><button className="primary-button" disabled={busy || generationActive || changed || !!draft.uuid} onClick={() => void perform(() => generate(coverStyles.map(s => s.id)))} aria-busy={!!submissionProgress}>{submissionProgress ? <><LoaderCircle size={16} className="animate-spin" />{submissionProgress}</> : "确认文字并生成三张封面"}</button><button className="secondary-button" disabled={busy || changed} onClick={() => void perform(async () => { await save(draft); })}>保存方案</button></div>
    </div>}
    {(pendingBatch || work?.batches?.some(b=>b.items.some(i=>i.status!=="submitted"))) && <div className="panel"><p>批次提交尚未完成，继续时先核实原请求，仅提交剩余版本。</p><button className="primary-button" disabled={busy} onClick={()=>void perform(()=>generateBatch([],true))}>继续提交原批次</button></div>}
    {!!work?.batches?.length && <CoverBatchResults batches={work.batches} input={asset && draft.text.trim() ? {asset:{id:asset.id,imageUrl:asset.fileUrl!,name:asset.filePath,analysis:asset.aiAnalysisStatus === "deleted" ? "" : asset.aiAnalysis || "",tags:asset.tags,width:asset.width,height:asset.height},text:draft.text.trim(),requiredText:draft.requiredText,requirements:draft.requirements} : undefined} variants={draft.variants} disabled={busy} onRetry={id=>void perform(()=>generateBatch([id]))} onTasks={onTasks} />}
    {task && !work?.batches?.some(b=>b.items.some(i=>i.taskId===task.id)) && <div className="panel"><h3 className="section-title">封面制作结果</h3><p className="my-2 text-xs text-ink/60">以下是该批次提交时的结果，修改文字后需要重新制作。</p><CoverTaskResults task={task} onUpdated={job => { setTask(job); remember({ ...draft, taskId: job.id }); setReload(n => n + 1); }} /><button className="secondary-button mt-3" onClick={() => onTasks(task.id)}>查看生成任务</button><button className="secondary-button ml-3 mt-3" onClick={() => setReload(n => n + 1)}>刷新进度</button></div>}
  </div>;
}
