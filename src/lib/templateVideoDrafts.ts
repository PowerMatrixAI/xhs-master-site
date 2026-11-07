import type { FeaturedVlogResolution } from "./featuredVlog";
import type { VlogCharacterSelection } from "./vlogCharacters";

export function templateVlogCharacter(records: Record<string, VlogCharacterSelection> | undefined, templateId: string): VlogCharacterSelection {
  const value = records?.[templateId];
  return value === "none" || value === "shenhe" ? value : "linchuan";
}

export function vlogTaskCharacterChanged(content: string, choice: VlogCharacterSelection): boolean {
  if (!content) return false;
  try {
    const plan = JSON.parse(content.match(/```json\s*([\s\S]*?)```/)?.[1] || "{}");
    return (plan.characterSelection || (plan.character?.id === "325994250221723" ? "shenhe" : "linchuan")) !== choice;
  } catch { return choice !== "linchuan"; }
}

export function templateVlogResolution(records: Record<string, FeaturedVlogResolution> | undefined, templateId: string): FeaturedVlogResolution {
  return records?.[templateId] === "1080p" ? "1080p" : "720p";
}

export function vlogTaskResolutionChanged(content: string, resolution: FeaturedVlogResolution): boolean {
  if (!content) return false;
  try {
    const plan = JSON.parse(content.match(/```json\s*([\s\S]*?)```/)?.[1] || "{}");
    return (plan.generation?.resolution || "720p") !== resolution;
  } catch { return resolution !== "720p"; }
}

/** Read old single-result caches without losing them during per-template migration. */
export function templateVideoDraftRecords<T extends { templateId: string }>(
  records: Record<string, T> | undefined,
  legacy: T | undefined
): Record<string, T> {
  return { ...(legacy?.templateId ? { [legacy.templateId]: legacy } : {}), ...records };
}
