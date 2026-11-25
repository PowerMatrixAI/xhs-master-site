import { authRequest, ApiResponseFormatError } from "./api";
import type { VlogScript, FeaturedVlogResolution } from "./featuredVlog";
import type { VlogCharacterSelection } from "./vlogCharacters";
import type { VlogTaskResult } from "./vlogProduction";

export type ProductionSettings = { character: VlogCharacterSelection; resolution: FeaturedVlogResolution; useReferenceVideo: boolean };
export type ContentProduction = {
  id: number; accountId: number; revision: number; title: string; kind: "featured_vlog";
  templateId: string; templateVersion?: number; templateSnapshot?: import("./featuredVlog").FeaturedVlogTemplate; extraRequirements: string;
  script?: VlogScript; effectiveScript?: VlogScript; confirmed: boolean; settings: ProductionSettings;
  knowledgeSnapshotId?: string; result?: VlogTaskResult; plan?: Record<string, unknown>;
  createdAt: string; updatedAt: string;
};
export type ProductionUpdate = Partial<Pick<ContentProduction, "title" | "templateId" | "templateVersion" | "templateSnapshot" | "extraRequirements" | "script" | "effectiveScript" | "confirmed" | "settings" | "knowledgeSnapshotId" | "result" | "plan">>;

export async function productionRequest<T>(path: string, init?: Parameters<typeof authRequest>[1]) {
  const response = await authRequest<T>(path, init).catch(error => {
    if (error instanceof ApiResponseFormatError) {
      if (error.status === 404) throw new Error("独立作品服务尚未接入（HTTP 404）。请先完成服务端作品接口开发，再创建或恢复作品。");
      throw new Error(`作品服务返回格式异常（HTTP ${error.status}），请稍后重试或联系服务端检查。`);
    }
    throw error;
  });
  if (!response.status) throw new Error(response.message || "作品接口暂不可用，请联系服务端完成独立作品接口接入。");
  return response.data;
}
export function listProductions(accountId: number) {
  return productionRequest<{ items: ContentProduction[] }>("/production/v1/list?kind=featured_vlog&accountId=" + accountId).then(result => ({ items: result.items.filter(item => item.kind === "featured_vlog") }));
}
export function getProduction(accountId: number, id: number) {
  return productionRequest<ContentProduction>(`/production/v1/detail?accountId=${accountId}&id=${id}`);
}
export function saveProduction(accountId: number, update: ProductionUpdate, existing?: ContentProduction, requestId?: string) {
  return productionRequest<ContentProduction>("/production/v1/save", {
    method: "POST",
    body: { accountId, kind: "featured_vlog", ...update, ...(existing ? { id: existing.id, expectedRevision: existing.revision } : { requestId }) }
  });
}
export function videoAccountContext(account: Record<string, unknown>) {
  const fields = ["id", "accountParam", "name", "accountType", "city", "personaBase", "targetUsers", "contentDirections", "businessGoals", "materialCondition", "taboos", "strategy"];
  return Object.fromEntries(fields.map(key => [key, account[key]]));
}


type Cover = import("./coverProduction").CoverProduction;
type ImageWork = { id: number; accountId: number; revision: number; kind: string; title: string; confirmed: boolean;
  settings?: { coverDraft?: Pick<Cover, "input" | "variants" | "confirmedVariantIds" | "batches"> };
  result?: Cover["result"]; tasks?: Array<{ id: string }>; latestTaskId?: string };
function readCover(work: ImageWork): Cover {
  const draft = work.settings?.coverDraft;
  if (work.kind !== "image" || !draft?.input) throw new Error("该图片作品不是三风格封面作品，无法在此编辑。");
  return { ...work, kind: "cover_image", ...draft, latestTaskId: work.latestTaskId || work.tasks?.[0]?.id };
}
export function listCoverProductions(accountId: number) {
  return productionRequest<{ items: ImageWork[] }>(`/production/v1/list?kind=image&accountId=${accountId}`)
    .then(result => ({ items: result.items.map(item => ({ ...item, kind: "cover_image" } as Cover)) }));
}
export async function getCoverProduction(accountId: number, id: number) {
  const result = await productionRequest<ImageWork>(`/production/v1/detail?accountId=${accountId}&id=${id}`);
  if (result.accountId !== accountId) throw new Error("作品归属不匹配。");
  return readCover(result);
}
export async function saveCoverProduction(accountId: number, changes: Pick<Cover, "input" | "variants" | "confirmed" | "confirmedVariantIds" | "batches"> & { plan?: import("./coverProduction").CoverPlan }, existing: Cover | undefined, requestId: string, execution?: { prompt: string; items: unknown[]; title?: string }) {
  const settings = { imageSourceMode: "remote_images", noteContent: changes.input.text, singleGoal: "同一原图的三种风格封面", imageCount: String(execution?.items.length || 3),
    realImageRefinementRequirement: changes.input.requirements, aiAssistantRequirement: "", removeWatermarks: false,
    selectedAssets: [{ id: changes.input.asset.id, fileUrl: changes.input.asset.imageUrl, filePath: changes.input.asset.name }],
    coverDraft: { input: changes.input, variants: changes.variants, confirmedVariantIds: changes.confirmedVariantIds, batches: changes.batches || existing?.batches || [] } };
  const result = execution ? { openclawTask: { title: execution.title || changes.input.text, content: execution.prompt },
    imagePrompt: { title: changes.input.text, content: JSON.stringify(execution.items), path: "" }, referenceStyle: "三风格封面", commands: [] } : undefined;
  return readCover(await productionRequest<ImageWork>("/production/v1/save", {
    method: "POST", body: { title: changes.input.text, accountId, kind: "image", settings, confirmed: !!execution,
      ...(result ? { result } : {}),
      ...(existing ? { id: existing.id, expectedRevision: existing.revision } : { requestId }) }
  }));
}
