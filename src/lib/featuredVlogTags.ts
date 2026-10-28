import type { FeaturedVlogTemplate } from "@/lib/featuredVlog";

export type VlogTemplateTag = { id: number; name: string; dimensionId: number; dimensionName: string; sortOrder: number; version: number };
export type VlogTagDimension = { id: number; name: string; sortOrder: number; version: number; tags: VlogTemplateTag[] };
export type VlogTagCatalog = { dimensions: VlogTagDimension[]; unassignedTags: VlogTemplateTag[] };

export function normalizeTemplateTagIds(value: unknown): number[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))] : [];
}

export function normalizeVlogTag(value: unknown): VlogTemplateTag | null {
  if (!value || typeof value !== "object") return null;
  const tag = value as Record<string, unknown>;
  if (!Number.isSafeInteger(tag.id) || Number(tag.id) <= 0 || typeof tag.name !== "string" || !tag.name.trim()) return null;
  return { id: Number(tag.id), name: tag.name.trim(), dimensionId: Number(tag.dimensionId) || 0,
    dimensionName: typeof tag.dimensionName === "string" ? tag.dimensionName : "", sortOrder: Number(tag.sortOrder) || 0, version: Number(tag.version) || 1 };
}

export function templateTagLabels(template: Pick<FeaturedVlogTemplate, "tags" | "tagDetails">): string[] {
  return template.tagDetails?.length ? template.tagDetails.map((tag) => tag.name) : normalizeTemplateTags(template.tags);
}

export function filterTemplatesByTagIds<T extends Pick<FeaturedVlogTemplate, "tagIds">>(templates: T[], ids: number[]) {
  const filters = normalizeTemplateTagIds(ids);
  return templates.filter((template) => {
    const tags = new Set(template.tagIds || []);
    return !filters.length || filters.some((id) => tags.has(id));
  });
}

export function normalizeTemplateTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is string => typeof item === "string")
    .map((tag) => tag.trim().replace(/\s+/g, " "))
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function collectTemplateTags(templates: Pick<FeaturedVlogTemplate, "tags">[]) {
  return normalizeTemplateTags(templates.flatMap((template) => template.tags || []))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function filterTemplatesByTags<T extends Pick<FeaturedVlogTemplate, "tags">>(templates: T[], filters: string[]) {
  const keys = normalizeTemplateTags(filters).map((tag) => tag.toLocaleLowerCase());
  return templates.filter((template) => {
    const tags = new Set(normalizeTemplateTags(template.tags).map((tag) => tag.toLocaleLowerCase()));
    return !keys.length || keys.some((key) => tags.has(key));
  });
}
