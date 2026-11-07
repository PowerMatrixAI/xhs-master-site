import type { VlogProductionDraft } from "./vlogProduction";
const memory = new Map<string, VlogProductionDraft>();
const unsaved = new Set<string>();
export const VLOG_PRODUCTION_EVENT = "xhs-vlog-production-updated";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("xhs-vlog-production", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export async function readVlogProduction(key: string): Promise<VlogProductionDraft | undefined> {
  if (unsaved.has(key) && memory.has(key)) return structuredClone(memory.get(key)!);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("drafts").objectStore("drafts").get(key);
      r.onsuccess = () => { const d = r.result; if (d?.schemaVersion === 1 && d.key === key && d.stages && typeof d.stages === "object" && d.sourceScript && typeof d.sourceHash === "string") { memory.set(key, d); resolve(structuredClone(d)); } else resolve(undefined); };
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
export async function writeVlogProduction(draft: VlogProductionDraft): Promise<void> {
  memory.set(draft.key, structuredClone(draft));
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put(draft, draft.key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("制作草稿保存失败"));
    });
    unsaved.delete(draft.key);
  } catch (error) { unsaved.add(draft.key); throw error; }
  finally { db?.close(); window.dispatchEvent(new Event(VLOG_PRODUCTION_EVENT)); }
}
