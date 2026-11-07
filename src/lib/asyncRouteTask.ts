type AsyncTaskStatus = "pending" | "completed" | "failed";

type AsyncTaskRecord<T> = {
  uuid: string;
  status: AsyncTaskStatus;
  createdAt: number;
  updatedAt: number;
  ttlMs?: number;
  result?: T;
  error?: string;
};

const TASK_TTL_MS = 30 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __xhsAsyncRouteTasks: Map<string, AsyncTaskRecord<unknown>> | undefined;
}

function getTaskStore() {
  if (!globalThis.__xhsAsyncRouteTasks) {
    globalThis.__xhsAsyncRouteTasks = new Map<string, AsyncTaskRecord<unknown>>();
  }
  return globalThis.__xhsAsyncRouteTasks;
}

function cleanupExpiredTasks() {
  const now = Date.now();
  const store = getTaskStore();
  for (const [uuid, record] of store.entries()) {
    if (now - record.updatedAt > (record.ttlMs ?? TASK_TTL_MS)) {
      store.delete(uuid);
    }
  }
}

export function createAsyncRouteTask<T>(runner: () => Promise<T>, options: { ttlMs?: number } = {}) {
  cleanupExpiredTasks();
  const uuid = crypto.randomUUID();
  const now = Date.now();
  const store = getTaskStore();

  store.set(uuid, {
    uuid,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...options
  });

  void runner()
    .then((result) => {
      store.set(uuid, {
        uuid,
        status: "completed",
        createdAt: now,
        updatedAt: Date.now(),
        ...options,
        result
      });
    })
    .catch((error) => {
      store.set(uuid, {
        uuid,
        status: "failed",
        createdAt: now,
        updatedAt: Date.now(),
        ...options,
        error: error instanceof Error ? error.message : "任务执行失败"
      });
    });

  return { uuid, status: "pending" as const };
}

export function getAsyncRouteTask<T>(uuid: string): AsyncTaskRecord<T> | null {
  cleanupExpiredTasks();
  const store = getTaskStore();
  return (store.get(uuid) as AsyncTaskRecord<T> | undefined) || null;
}
