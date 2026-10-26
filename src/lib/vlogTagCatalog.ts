import { authRequest, isPlatformAdmin } from "@/lib/api";
import { normalizeVlogTag, type VlogTagCatalog, type VlogTagDimension, type VlogTemplateTag } from "@/lib/featuredVlogTags";

export async function fetchVlogTagCatalog(): Promise<VlogTagCatalog> {
  const response = await authRequest<{ dimensions?: unknown[]; unassignedTags?: unknown[] }>("/featuredVlog/v1/tag/catalog", { method: "POST" });
  if (!response.status || !Array.isArray(response.data?.dimensions)) throw new Error(response.message || "读取标签维度失败，请稍后重试。");
  const dimensions = response.data.dimensions.map((value) => {
    if (!value || typeof value !== "object") throw new Error("标签维度数据无效，请刷新后重试。");
    const item = value as Record<string, unknown>;
    if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || typeof item.name !== "string" || !Array.isArray(item.tags)) throw new Error("标签维度数据无效，请刷新后重试。");
    const dimension: VlogTagDimension = { id: Number(item.id), name: item.name, sortOrder: Number(item.sortOrder) || 0, version: Number(item.version) || 1,
      tags: item.tags.map(normalizeVlogTag).filter((tag): tag is VlogTemplateTag => Boolean(tag)).map((tag) => ({ ...tag, dimensionId: Number(item.id), dimensionName: String(item.name) })) };
    return dimension;
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return { dimensions, unassignedTags: (response.data.unassignedTags || []).map(normalizeVlogTag).filter((tag): tag is VlogTemplateTag => Boolean(tag)) };
}

export type VlogCatalogWrite = { id?: number; version?: number; name: string; sortOrder: number; dimensionId?: number };

async function write(path: string, input: VlogCatalogWrite | { id: number; version: number }) {
  if (!isPlatformAdmin()) throw new Error("仅平台管理员可以管理标签和标签维度。");
  const response = await authRequest<unknown>(`/featuredVlog/v1/tag/${path}`, { method: "POST", body: input });
  if (!response.status) throw new Error(response.message || "保存标签设置失败，请刷新后重试。");
  return response.data;
}

export const createVlogTagDimension = (input: VlogCatalogWrite) => write("dimension/create", input);
export const updateVlogTagDimension = (input: VlogCatalogWrite & { id: number; version: number }) => write("dimension/update", input);
export const deleteVlogTagDimension = (input: { id: number; version: number }) => write("dimension/delete", input);
export const createVlogTag = (input: VlogCatalogWrite & { dimensionId: number }) => write("create", input);
export const updateVlogTag = (input: VlogCatalogWrite & { id: number; version: number; dimensionId: number }) => write("update", input);
export const deleteVlogTag = (input: { id: number; version: number }) => write("delete", input);
