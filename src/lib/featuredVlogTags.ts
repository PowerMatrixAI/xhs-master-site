import type { FeaturedVlogTemplate } from "@/lib/featuredVlog";

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
    return keys.every((key) => tags.has(key));
  });
}
