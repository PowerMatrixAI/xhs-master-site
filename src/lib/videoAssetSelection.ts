import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import type { VideoSourceAsset } from "./videoPrompts";
import type { BackendAiCredentials } from "./backendAiClient";

export type VideoAssetReference = {
  assetKey: string; fileUrl: string; fileName: string; fileType: string;
  tags: string; suitableTypes: string; aiAnalysis: string; aiAnalysisStatus?: string;
};
export const ASSET_SELECTION_RULES = "优先依据图片分析中的场景、人物、物体和空间关系选图，标签、文件名和适用类型补充。分析缺失、失败或删除不排除素材；分析只是可修正的文字描述，不等于看过实际图片或证明场地归属。优先匹配素材，确无匹配再生成场景图。";
export function videoAssetReferences(assets: VideoSourceAsset[]): VideoAssetReference[] {
  return assets.filter(a => a.fileUrl.startsWith("https://") && (a.fileType.toLowerCase().startsWith("image") || /\.(jpe?g|png|webp|avif)(?:\?|$)/i.test(a.fileUrl))).map((a, i) => ({
    assetKey: `A${String(i + 1).padStart(2, "0")}`, fileUrl: a.fileUrl,
    fileName: a.filePath.split(/[\\/]/).pop() || `asset-${a.id}`, fileType: a.fileType,
    tags: a.tags || "", suitableTypes: a.suitableTypes || "",
    aiAnalysis: a.aiAnalysisStatus === "deleted" ? "" : a.aiAnalysis || "", aiAnalysisStatus: a.aiAnalysisStatus
  }));
}
export const assetMetadata = ({ fileUrl: _url, ...asset }: VideoAssetReference) => asset;

// Bound each screening request, never silently drop the tail of an account library.
export async function shortlistVideoAssets(assets: VideoAssetReference[], shots: readonly unknown[], budget = 14000, credentials?: BackendAiCredentials) {
  const batches: VideoAssetReference[][] = [];
  let batch: VideoAssetReference[] = [], length = 2;
  for (const asset of assets) {
    const size = JSON.stringify(assetMetadata(asset)).length + 1;
    if (size + 2 > budget) throw new Error(`素材 ${asset.assetKey} 的文字信息过长，请精简分析或标签。`);
    if (length + size > budget && batch.length) { batches.push(batch); batch = []; length = 2; }
    batch.push(asset); length += size;
  }
  if (batch.length) batches.push(batch);
  if (batches.length <= 1) return { assets, calls: 0 };
  let candidates = assets, calls = 0;
  while (JSON.stringify(candidates.map(assetMetadata)).length > budget) {
    const groups: VideoAssetReference[][] = [];
    let current: VideoAssetReference[] = [], size = 2;
    for (const a of candidates) {
      const n = JSON.stringify(assetMetadata(a)).length + 1;
      if (size + n > budget && current.length) { groups.push(current); current = []; size = 2; }
      current.push(a); size += n;
    }
    if (current.length) groups.push(current);
    const selected = new Set<string>();
    for (const group of groups) {
      const response = await completeWithBackendAi({
        credentials,
        instructions: "你是视频素材筛选员。只输出JSON。",
        input: `${ASSET_SELECTION_RULES}\n为每镜从本批选最多2张最匹配素材；不匹配可留空，不能因无分析排除素材。只返回 {"assetKeys":["A01"]}，全批最多${shots.length * 2}项。\n镜头：${JSON.stringify(shots)}\n本批：${JSON.stringify(group.map(assetMetadata))}`
      });
      calls++;
      if (!response.ok) throw new Error(`素材分批筛选失败：${response.error}`);
      const source = response.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      let keys: unknown;
      try { keys = JSON.parse(source).assetKeys; } catch { throw new Error("素材分批筛选未返回有效JSON。"); }
      if (!Array.isArray(keys) || keys.length > shots.length * 2 || keys.some(k => typeof k !== "string" || !group.some(a => a.assetKey === k))) throw new Error("素材分批筛选包含无效素材标识。");
      keys.forEach(k => selected.add(k));
    }
    const next = candidates.filter(a => selected.has(a.assetKey));
    if (next.length >= candidates.length) throw new Error("素材候选仍超出输入预算，请精简素材分析后重试。");
    candidates = next;
  }
  return { assets: candidates, calls };
}
