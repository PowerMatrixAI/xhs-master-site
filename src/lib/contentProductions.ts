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


export function listCoverProductions(accountId: number) {
  return productionRequest<{ items: import("./coverProduction").CoverProduction[] }>(`/production/v1/list?kind=cover_image&accountId=${accountId}`)
    .then(result => ({ items: result.items.filter(item => item.kind === "cover_image") }));
}
export async function getCoverProduction(accountId: number, id: number) {
  const result = await productionRequest<import("./coverProduction").CoverProduction>(`/production/v1/detail?accountId=${accountId}&id=${id}`);
  if (result.kind !== "cover_image" || result.accountId !== accountId) throw new Error("作品类型或归属不匹配。");
  return result;
}
export function saveCoverProduction(accountId: number, changes: Pick<import("./coverProduction").CoverProduction, "input" | "variants" | "confirmed" | "confirmedVariantIds"> & { plan?: import("./coverProduction").CoverPlan }, existing: import("./coverProduction").CoverProduction | undefined, requestId: string) {
  return productionRequest<import("./coverProduction").CoverProduction>("/production/v1/save", {
    method: "POST", body: { ...changes, title: changes.input.text, accountId, kind: "cover_image",
      ...(existing ? { id: existing.id, expectedRevision: existing.revision } : { requestId }) }
  });
}
