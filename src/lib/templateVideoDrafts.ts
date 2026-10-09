/** Read old single-result caches without losing them during per-template migration. */
export function templateVideoDraftRecords<T extends { templateId: string }>(
  records: Record<string, T> | undefined,
  legacy: T | undefined
): Record<string, T> {
  return { ...(legacy?.templateId ? { [legacy.templateId]: legacy } : {}), ...records };
}
