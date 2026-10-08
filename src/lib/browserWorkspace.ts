const DB_NAME = "xhs-master-browser-db";
const STORE_NAME = "workspace";
const SNAPSHOT_KEY = "snapshot";
const DB_VERSION = 1;

export type BrowserWorkspaceSnapshot = {
  accounts?: unknown[];
  templates?: unknown[];
  selectedId?: number | null;
  promptResults?: Record<number, unknown>;
  imagePromptResults?: Record<number, unknown>;
  videoPromptResults?: Record<number, unknown>;
  videoDrafts?: Record<number, unknown>;
  batchImagePostResults?: Record<number, unknown>;
  referenceDraft?: Record<string, unknown>;
  imageStyleDraft?: Record<string, unknown>;
  interactionDraft?: Record<string, unknown>;
  industryLearningDraft?: Record<string, unknown>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error("打开工作区缓存失败。"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadBrowserWorkspace(): Promise<BrowserWorkspaceSnapshot> {
  if (typeof window === "undefined" || !window.indexedDB) return {};

  const db = await openDb();
  try {
    return await new Promise<BrowserWorkspaceSnapshot>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(SNAPSHOT_KEY);

      request.onerror = () => reject(request.error || new Error("读取工作区缓存失败。"));
      request.onsuccess = () => resolve((request.result as BrowserWorkspaceSnapshot | undefined) || {});
    });
  } finally {
    db.close();
  }
}

export async function saveBrowserWorkspace(snapshot: BrowserWorkspaceSnapshot) {
  if (typeof window === "undefined" || !window.indexedDB) return;

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(snapshot, SNAPSHOT_KEY);

      request.onerror = () => reject(request.error || new Error("保存工作区缓存失败。"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("保存工作区缓存失败。"));
    });
  } finally {
    db.close();
  }
}
