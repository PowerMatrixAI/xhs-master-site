import type { FeaturedVlogScript, FeaturedVlogFramePlan, FeaturedVlogResolution, MusicCandidate } from "./featuredVlog";
import type { VlogCharacterSelection } from "./vlogCharacters";
import { VLOG_CHARACTERS } from "./vlogCharacters";
import type { VlogAdaptation } from "./vlogCharacterAdaptation";
import { validateOmniScript } from "./featuredVlogOmni";
import { featuredVlogForAssetSelection } from "./featuredVlogAssetSelection";

export type ProductionStage = "adapt" | "frames" | "music" | "build" | "save";
export type ProductionOptions = { confirm?: string; retryLost?: boolean; force?: "frames" | "music"; saveOnly?: boolean };
export type VlogTaskResult = { openclawTask: { content: string; title: string }; videoPrompt: { content: string; title: string }; sceneReferences?: FeaturedVlogFramePlan };
type Stage = { fingerprint: string; status: "pending" | "completed" | "failed" | "lost"; uuid?: string; result?: unknown; error?: string; assetIds?: string[]; model?: string };
export type VlogProductionDraft = {
  schemaVersion: 1; key: string; sourceHash: string; taskId: number; sourceScript: FeaturedVlogScript;
  choice: VlogCharacterSelection; resolution: FeaturedVlogResolution; stages: Partial<Record<ProductionStage, Stage>>;
  confirmedFingerprint?: string; waitingConfirmation?: boolean; updatedAt: string; localSaveError?: string;
  lastSuccess?: { taskId: number; script: FeaturedVlogScript; result: VlogTaskResult; at: string };
};
export type ProductionContext = {
  template: { id: string; version?: number; referenceVideo?: unknown; referenceVideoId?: number };
  assets: Array<{ id?: string | number; fileUrl: string; [key: string]: unknown }>;
  music: MusicCandidate[];
};
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function productionHash(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,"0")).join("");
}
export function productionScope(user: number | string, environment: string, account: number, template: string) { return JSON.stringify([user, environment, account, template]); }
export function productionScript(draft?: VlogProductionDraft): VlogAdaptation | undefined {
  if (draft?.stages.adapt?.status !== "completed") return undefined;
  try { const r = draft.stages.adapt.result as VlogAdaptation; validateOmniScript(r.script); if (!Array.isArray(r.changes) || !r.changes.every(c=>typeof c === "string")) return undefined; return r; } catch { return undefined; }
}
export class VlogTaskLostError extends Error {}
export class VlogStageFailedError extends Error {}
const active = new Set<string>();
export async function runVlogProduction(input: {
  key: string; taskId: number; source: FeaturedVlogScript; choice: VlogCharacterSelection; resolution: FeaturedVlogResolution;
  context?: ProductionContext; getContext?: () => Promise<ProductionContext>; existing?: VlogProductionDraft; options?: ProductionOptions;
  load?: () => Promise<VlogProductionDraft | undefined>;
  persist: (draft: VlogProductionDraft) => Promise<void>;
  request: (action: string, body: Record<string, unknown>, pending: (uuid: string) => Promise<void>, resume?: string) => Promise<unknown>;
  save: (result: VlogTaskResult) => Promise<void>;
  progress?: (stage: ProductionStage) => void;
  lockAcquired?: boolean;
}): Promise<VlogProductionDraft> {
  if (!input.lockAcquired && typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`vlog:${input.key}`, { ifAvailable:true }, async lock => {
      if (!lock) throw new Error("此制作任务正在另一个页面处理。");
      return runVlogProduction({ ...input, lockAcquired:true });
    });
  }
  if (active.has(input.key)) throw new Error("当前制作任务正在处理。");
  active.add(input.key);
  try {
    const sourceHash = await productionHash(input.source);
    const old = input.load ? await input.load() : input.existing;
    const draft: VlogProductionDraft = old?.schemaVersion === 1 && old.sourceHash === sourceHash && old.taskId === input.taskId
      ? structuredClone(old) : { schemaVersion: 1, key: input.key, sourceHash, taskId: input.taskId, sourceScript: input.source, choice: input.choice, resolution: input.resolution, stages: {}, updatedAt: "", lastSuccess: old?.lastSuccess };
    if (draft.choice !== input.choice || draft.resolution !== input.resolution) { delete draft.stages.build; delete draft.stages.save; }
    draft.choice = input.choice; draft.resolution = input.resolution;
    const checkpoint = async () => {
      draft.updatedAt = new Date().toISOString();
      try { delete draft.localSaveError; await input.persist(draft); }
      catch { draft.localSaveError = "当前结果未能保存到本地，刷新后可能无法恢复。请检查浏览器存储后继续。"; try { await input.persist(draft); } catch {} throw new Error(draft.localSaveError); }
    };
    if (input.options?.saveOnly) {
      if (draft.stages.build?.status !== "completed" || !productionScript(draft)) throw new Error("设置已变化或没有待保存指令，请更新任务。");
      const result = draft.stages.build.result as VlogTaskResult;
      if (!result.videoPrompt?.content || result.openclawTask?.content !== result.videoPrompt.content) throw new Error("待保存任务损坏，请重新组装。");
      draft.stages.save = { fingerprint:await productionHash([input.taskId,result.videoPrompt.content]),status:"pending" };
      input.progress?.("save"); await checkpoint();
      try { await input.save(result); draft.stages.save.status="completed"; }
      catch(error) { draft.stages.save.status="failed"; draft.stages.save.error="指令已生成，保存失败："+(error instanceof Error?error.message:"请重试"); await checkpoint(); throw new Error(draft.stages.save.error); }
      draft.lastSuccess={ taskId:input.taskId,script:productionScript(draft)!.script,result,at:new Date().toISOString() };
      await checkpoint(); return draft;
    }
    const context = input.context || await input.getContext?.();
    if (!context) throw new Error("制作资源检查失败。");
    if (input.options?.force) { delete draft.stages[input.options.force]; delete draft.stages.build; delete draft.stages.save; }
    async function stage<T>(name: ProductionStage, deps: unknown, action: string, body: Record<string, unknown>, valid: (r: T) => void): Promise<T> {
      const fingerprint = await productionHash({ ruleVersion: "vlog-production-1", modelPolicy: "backend-default", name, deps });
      let record = draft.stages[name];
      if (record?.fingerprint === fingerprint && record.status === "completed") {
        try { valid(record.result as T); return record.result as T; } catch { record = undefined; }
      }
      if (record?.fingerprint !== fingerprint) record = undefined;
      if (record?.status === "lost" && !input.options?.retryLost) throw new Error(record.error || "任务状态已丢失，请明确重新执行该阶段。");
      const resume = record?.status === "pending" ? record.uuid : undefined;
      record = { fingerprint, status: "pending", uuid: resume };
      draft.stages[name] = record;
      input.progress?.(name);
      await checkpoint();
      try {
        const result = await input.request(action, body, async uuid => { record!.uuid = uuid; await checkpoint(); }, resume) as T;
        delete record.uuid; valid(result); record.result = result; record.status = "completed";
        if (result && typeof result === "object" && "model" in result && typeof result.model === "string") record.model = result.model;
        await checkpoint(); return result;
      } catch (error) {
        record.error = error instanceof Error ? error.message : "阶段处理失败";
        if (error instanceof VlogStageFailedError) delete record.uuid;
        record.status = error instanceof VlogTaskLostError ? "lost" : record.uuid ? "pending" : "failed";
        await checkpoint(); throw error;
      }
    }
    const adaptation = await stage<VlogAdaptation>("adapt", [input.source, input.choice, input.choice === "none" ? null : VLOG_CHARACTERS[input.choice]], "adapt_featured_vlog_character", { featuredVlogScript: input.source }, r => {
      validateOmniScript(r.script); if (r.script.characterSelection !== input.choice || typeof r.requiresConfirmation !== "boolean" || !Array.isArray(r.changes)) throw new Error("制作脚本缓存无效");
    });
    const fingerprint = draft.stages.adapt!.fingerprint;
    if (adaptation.requiresConfirmation && draft.confirmedFingerprint !== fingerprint) {
      if (input.options?.confirm !== fingerprint) { draft.waitingConfirmation = true; await checkpoint(); return draft; }
    }
    draft.confirmedFingerprint = fingerprint; draft.waitingConfirmation = false; await checkpoint();
    const script = adaptation.script;
    const assetIdentity = (a: ProductionContext["assets"][number]) => String(a.id ?? a.filePath ?? a.fileUrl.split("?")[0]);
    const metadata = context.assets.map(a => { const { fileUrl, ...rest } = a; return { ...rest, contentUrl: fileUrl.split("?")[0], identity: assetIdentity(a) }; }).sort((a,b) => a.identity.localeCompare(b.identity));
    const frames = await stage<{ framePlan: FeaturedVlogFramePlan; overallDirection: string }>("frames", [featuredVlogForAssetSelection(script), metadata], "plan_featured_vlog_frames", { featuredVlogScript: script }, r => {
      if (!Array.isArray(r.framePlan) || r.framePlan.length !== script.shots.length) throw new Error("选图缓存无效");
      r.framePlan.forEach((f,i) => { if (f.order !== i+1 || !["asset","generate"].includes(f.frameSource) || !f.framePrompt) throw new Error("选图缓存无效"); });
    });
    const frameRecord = draft.stages.frames!;
    if (!frameRecord.assetIds) frameRecord.assetIds = frames.framePlan.map(f => f.frameSource === "asset" ? assetIdentity(context.assets.find(a => a.fileUrl === f.assetUrl) || { fileUrl: f.assetUrl }) : "");
    frames.framePlan.forEach((f,i) => {
      if (f.frameSource === "asset") { const a = context.assets.find(a => assetIdentity(a) === frameRecord.assetIds![i]); if (!a) { delete draft.stages.frames; throw new Error("已选素材失效，请重新选图。"); } f.assetUrl = a.fileUrl; }
    });
    await checkpoint();
    const musicDeps = context.music.map(m => ({ ...m, audioUrl: m.audioUrl.split("?")[0] })).sort((a,b)=>a.id-b.id);
    const music = await stage<{ music: MusicCandidate }>("music", [{ title: input.source.title, summary: input.source.summary, mood: script.moodTags, music: script.musicTags, timing: script.shots.map(s=>[s.duration,s.transitionToNext?.type,s.transitionToNext?.duration]), roles: script.shots.map(s=>s.role) }, musicDeps], "select_featured_vlog_music", { featuredVlogScript: script }, r => { if (!context.music.some(m => m.id === r.music?.id)) throw new Error("配乐缓存失效"); });
    music.music = context.music.find(m=>m.id===music.music.id)!;
    const result = await stage<VlogTaskResult>("build", [script, frames, music, input.choice, input.resolution, context.template], "build_featured_vlog_task", { featuredVlogScript: script, framePlan: frames.framePlan, motionPlan: [], selectedMusic: music.music, overallDirection: frames.overallDirection }, r => {
      if (!r.videoPrompt?.content || r.videoPrompt.content !== r.openclawTask?.content) throw new Error("任务缓存无效");
    });
    const saveFingerprint = await productionHash([input.taskId, result.videoPrompt.content]);
    if (draft.stages.save?.fingerprint !== saveFingerprint || draft.stages.save.status !== "completed") {
      draft.stages.save = { fingerprint: saveFingerprint, status: "pending" }; input.progress?.("save"); await checkpoint();
      try { await input.save(result); draft.stages.save.status = "completed"; }
      catch (error) { draft.stages.save.status = "failed"; draft.stages.save.error = "指令已生成，保存失败：" + (error instanceof Error ? error.message : "请重试保存"); await checkpoint(); throw new Error(draft.stages.save.error); }
    }
    draft.lastSuccess = { taskId: input.taskId, script, result, at: new Date().toISOString() };
    await checkpoint(); return draft;
  } finally { active.delete(input.key); }
}
