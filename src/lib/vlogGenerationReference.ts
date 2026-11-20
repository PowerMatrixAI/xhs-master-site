import type { VideoAssetReference } from "./videoAssetSelection";

export type VlogGenerationReference = {
  assetId: string; imageUrl: string; analysis: string; reason: string;
  relationship: "same_space" | "similar_scene"; preserve: string[]; changes: string[];
};
export type VlogNoGenerationReference = { reason: string; allowGeneric: true };
export const VLOG_GENERATION_REFERENCE_RULES = `AI补图也必须选场景参考：优先同一空间/前镜对应素材，其次场景用途相符，再比较材质陈设与光线；房间参考房间，不能只凭色调以户外代室内。分批筛选每镜最多2个名额兼顾直接可用素材和最适合补图参考的素材，不因无法直接使用就丢弃同类参考。参考用途可重复使用，也可复用已被asset镜头使用的图片。仅same_space表示延续已确认同一空间，保留可见布局设施；similar_scene只参考同类内容风格，不声称实景复刻。不能从图片分析证明场地归属，最终须查看图片。`;
const string = (v: unknown) => typeof v === "string" ? v.trim() : "";
export function readGenerationReference(value: unknown, candidates: VideoAssetReference[]): VlogGenerationReference | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("补图参考结构无效");
  const r = value as Record<string, unknown>;
  const asset = candidates.find(a => a.assetKey === r.assetKey);
  if (!asset) throw new Error("补图参考素材标识无效");
  const ref = { assetId: asset.assetId || asset.assetKey, imageUrl: asset.fileUrl, analysis: asset.aiAnalysis,
    reason: string(r.reason), relationship: r.relationship, preserve: r.preserve, changes: r.changes };
  return validateGenerationReference(ref);
}
export function validateGenerationReference(value: unknown): VlogGenerationReference {
  const r = value as VlogGenerationReference | undefined;
  let validUrl = false;
  try { const u = new URL(r?.imageUrl || ""); validUrl = u.protocol === "https:" && !u.username && !u.password; } catch {}
  if (!r || !string(r.assetId) || !validUrl || !string(r.reason) || typeof r.analysis !== "string"
    || !["same_space","similar_scene"].includes(r.relationship)
    || !Array.isArray(r.preserve) || !r.preserve.length || !r.preserve.every(x=>string(x))
    || !Array.isArray(r.changes) || !r.changes.length || !r.changes.every(x=>string(x))) throw new Error("补图参考缺少有效素材、关系或保留/修改要求");
  return { assetId:r.assetId,imageUrl:r.imageUrl,analysis:r.analysis,reason:r.reason,relationship:r.relationship,preserve:[...r.preserve],changes:[...r.changes] };
}
export function validateNoGenerationReference(value: unknown): VlogNoGenerationReference {
  const r = value as VlogNoGenerationReference | undefined;
  if (!r || !string(r.reason) || r.allowGeneric !== true) throw new Error("没有合适实景参考：具体客房、设施或同一空间延续须补充素材，不能纯文字补图");
  return {reason:r.reason,allowGeneric:true};
}
