import type { FeaturedVlogScript } from "./featuredVlog";
import { VLOG_CHARACTERS, type VlogCharacterSelection } from "./vlogCharacters";

export type VlogAdaptation = { script: FeaturedVlogScript; calls: number; changes: string[]; requiresConfirmation: boolean; model?: string };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export function directVlogBinding(source: FeaturedVlogScript, choice: VlogCharacterSelection): VlogAdaptation | null {
  const same = choice === (source.characterSelection || "linchuan");
  const empty = !source.shots.some(s => s.startState!.characters.length || s.endState!.characters.length);
  // Clothing-dependent actions need explicit adaptation even in a newer script.
  const generic = source.genericCharacterVersion === 1 && source.characterSelection === "unassigned"
    && !/林川|沈禾|肩包|背包|草帽|长裙|衬衫|男士|女士/.test(JSON.stringify(source.shots));
  if (!same && !(choice !== "none" && generic) && !(choice === "none" && empty && generic)) return null;
  const script = clone(source);
  script.characterSelection = choice;
  script.characters = choice === "none" ? [] : (script.characters || []).map(c => ({ ...c, appearance: VLOG_CHARACTERS[choice].appearance }));
  if (choice === "none") script.shots.forEach(s => { s.subjectPresence = "environment"; if(script.photographyVersion===1) { s.direction!.subjectRole="environment"; s.direction!.subjectPresentation="无人"; } });
  return { script, calls: 0, changes: [choice === "none" ? "采用无人环境模式" : `绑定${VLOG_CHARACTERS[choice].bindName}，镜头动作与时间线保留`], requiresConfirmation: false };
}

/** Only these text/state fields may be patched; immutable timeline and role never come from AI. */
export function applyVlogCharacterPatch(source: FeaturedVlogScript, choice: VlogCharacterSelection, raw: Record<string, unknown>): VlogAdaptation {
  const allowed = (obj: Record<string, unknown>, keys: string[]) => {
    if (Object.keys(obj).some(k => !keys.includes(k))) throw new Error("人物适配包含不允许修改的字段。");
  };
  const string = (v: unknown) => { if (typeof v !== "string" || !v.trim()) throw new Error("人物适配文字不能为空。"); return v.trim(); };
  allowed(raw, ["title", "summary", "perspective", "shots"]);
  if (!Array.isArray(raw.shots)) throw new Error("人物适配缺少镜头补丁。");
  const patches = raw.shots;
  const script = clone(source);
  const changes: string[] = [];
  if (choice === "none" && source.photographyVersion === 1) {
    string(raw.summary); string(raw.perspective);
  }
  script.characterSelection = choice;
  delete script.genericCharacterVersion;
  for (const key of ["title", "summary", "perspective"] as const) if (raw[key] !== undefined) {
    const value = string(raw[key]);
    if (value !== script[key]) changes.push(`${key === "title" ? "标题" : key === "summary" ? "概要" : "视角"}：${script[key]} → ${value}`);
    script[key] = value;
  }
  const seen = new Set<number>();
  for (const value of raw.shots) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("镜头补丁无效。");
    const patch = value as Record<string, unknown>;
    allowed(patch, ["order", "description", "continuityNote", "mainAction", "startCharacters", "endCharacters", "startProps", "endProps", "focus", "action", "ending", "composition", "depth", "scale", "height", "angle", "camera", "timingActions", "transitionText", "subjectPresentation", "focusTarget"]);
    const order = Number(patch.order);
    if (!Number.isInteger(order) || order < 1 || order > script.shots.length || seen.has(order)) throw new Error("镜头补丁编号无效或重复。");
    seen.add(order);
    const shot = script.shots[order - 1];
    const before = JSON.stringify(shot);
    for (const key of ["description", "continuityNote", "mainAction"] as const) if (patch[key] !== undefined) {
      if (key === "mainAction" && choice !== "none" && patch[key] !== shot.mainAction) throw new Error("换人不能改写核心动作。");
      shot[key] = string(patch[key]);
    }
    for (const [field, key] of [["startCharacters", "startState"], ["endCharacters", "endState"]] as const) if (patch[field] !== undefined) {
      if (!Array.isArray(patch[field])) throw new Error("人物状态补丁无效。");
      const people = patch[field] as NonNullable<typeof shot.startState>["characters"];
      if (choice !== "none" && JSON.stringify(people.map(c => c.id)) !== JSON.stringify(shot[key]!.characters.map(c => c.id))) throw new Error("换人不能改变出镜安排。");
      if (choice !== "none" && people.some((c,i)=>c.position !== shot[key]!.characters[i].position || c.view !== shot[key]!.characters[i].view)) throw new Error("换人不能改变人物位置和观察视角。");
      shot[key]!.characters = clone(people);
    }
    for (const [field, key] of [["startProps", "startState"], ["endProps", "endState"]] as const) if (patch[field] !== undefined) {
      if (!Array.isArray(patch[field]) || !(patch[field] as unknown[]).every(v => typeof v === "string")) throw new Error("道具补丁无效。");
      shot[key]!.props = clone(patch[field] as string[]);
    }
    for (const key of ["focus", "action", "ending", "subjectPresentation", "focusTarget"] as const) if (patch[key] !== undefined) {
      if (choice !== "none" && ["subjectPresentation", "focusTarget"].includes(key) && patch[key] !== shot.direction![key]) throw new Error("换人不能改变摄影关系。");
      shot.direction![key] = string(patch[key]);
    }
    for (const key of ["scale", "height", "angle", "composition", "depth"] as const) if (patch[key] !== undefined) {
      if (choice !== "none" && ["scale", "height", "angle"].includes(key) && patch[key] !== shot.direction!.photography[key]) throw new Error("换人不能改变摄影构图。");
      shot.direction!.photography[key] = string(patch[key]);
    }
    if (patch.camera !== undefined) {
      if (!patch.camera || typeof patch.camera !== "object" || Array.isArray(patch.camera)) throw new Error("运镜补丁无效。");
      const camera = patch.camera as Record<string, unknown>;
      allowed(camera, ["type", "direction", "speed", "extent", "startFrame", "endFrame", "visualChange", "reason"]);
      for (const key of ["type", "direction", "speed", "extent", "startFrame", "endFrame", "visualChange", "reason"] as const) if (camera[key] !== undefined) {
        const value = string(camera[key]);
        if (choice !== "none" && key !== "direction" && value !== shot.direction!.camera[key]) throw new Error("换人不能改变运镜方式和幅度。");
        Object.assign(shot.direction!.camera, { [key]:value });
      }
    }
    if (patch.timingActions !== undefined) {
      if (!Array.isArray(patch.timingActions) || patch.timingActions.length !== shot.direction!.timing.length) throw new Error("动作时间段数量不能变化。");
      shot.direction!.timing.forEach((p, i) => { p.action = string((patch.timingActions as unknown[])[i]); });
    }
    const emptyLastTransition = !shot.transitionToNext && (patch.transitionText === null || (patch.transitionText && typeof patch.transitionText === "object" && !Array.isArray(patch.transitionText) && Object.keys(patch.transitionText).length === 0));
    if (patch.transitionText !== undefined && !emptyLastTransition) {
      const t = patch.transitionText;
      if (!t || typeof t !== "object" || !shot.transitionToNext) throw new Error("转场补丁无效。");
      allowed(t as Record<string, unknown>, ["reason", "outgoingState", "incomingState"]);
      for (const key of ["reason", "outgoingState", "incomingState"] as const) if ((t as Record<string, unknown>)[key] !== undefined) shot.transitionToNext[key] = string((t as Record<string, unknown>)[key]);
    }
    if (before !== JSON.stringify(shot)) changes.push(`镜头${order}：${source.shots[order - 1].description} → ${shot.description}；动作：${source.shots[order - 1].mainAction} → ${shot.mainAction}`);
  }
  if (choice === "none") {
    script.characters = [];
    script.shots.forEach((shot, i) => {
      const wasPerson = source.shots[i].startState!.characters.length || source.shots[i].endState!.characters.length;
      if (wasPerson && (!seen.has(i+1) || shot.mainAction === source.shots[i].mainAction)) throw new Error("无人适配须转换原人物动作。");
      shot.subjectPresence = "environment";
      if (script.photographyVersion === 1) {
        const patch = patches.find(p => Number((p as Record<string, unknown>).order) === i+1) as Record<string, unknown> | undefined;
        const next = source.shots[i+1];
        const nextWasPerson = next && (next.startState!.characters.length || next.endState!.characters.length);
        if (shot.transitionToNext && (wasPerson || nextWasPerson)) {
          if (!patch?.transitionText || typeof patch.transitionText !== "object" || !["reason","outgoingState","incomingState"].every(k=>typeof (patch.transitionText as Record<string,unknown>)[k]==="string" && String((patch.transitionText as Record<string,unknown>)[k]).trim())) throw new Error(`镜头${i+1}无人适配须同步更新相邻转场文字。`);
        }
        if (wasPerson && !["scale", "height", "angle", "composition", "depth"].every(k=>typeof patch?.[k]==="string" && String(patch[k]).trim())) throw new Error(`镜头${i+1}无人适配须重新描述机位与构图。`);
        if (wasPerson && (!patch?.focusTarget || !patch.camera || !["type","direction","speed","extent","startFrame","endFrame","visualChange","reason"].every(k=>typeof (patch.camera as Record<string,unknown>)[k] === "string" && String((patch.camera as Record<string,unknown>)[k]).trim()))) throw new Error(`镜头${i+1}无人适配须重新描述完整摄影设计。`);
        shot.direction!.subjectRole="environment";
        shot.direction!.subjectPresentation="无人";
      }
      shot.startState!.characters = []; shot.endState!.characters = []; shot.characterChanges = [];
    });
  } else script.characters = (script.characters || []).map(c => ({ ...c, appearance: VLOG_CHARACTERS[choice].appearance }));
  return { script, calls: 1, changes: changes.length ? changes : ["已按所选人物调整制作描述，请核对脚本"], requiresConfirmation: true };
}
