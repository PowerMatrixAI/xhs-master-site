import { authRequest } from "@/lib/api";

export type MediaArtifact = { type: "image" | "video"; name: string; url: string; cosPath: string; sizeBytes: number };
export type MediaTask = {
  id: string; accountId: number; noteTaskId: number; title: string; kind: "image" | "video";
  status: string; stage: string; progress: number; retryOf?: string; artifacts: MediaArtifact[] | null;
  error?: string; createdAt: string; updatedAt: string;
};
export type MediaGenerationInput = { accountId: number; noteTaskId: number; kind: "image" | "video"; mode: string; prompt: string; assetIds: number[]; options: Record<string, unknown> };
export type MediaTaskPage = { items: MediaTask[]; total: number; page: number; pageSize: number };
export const activeMediaStatuses = ["queued", "prompting", "submitting", "running", "uploading"];
export const mediaStatusLabels: Record<string, string> = { queued: "排队中", prompting: "生成提示词", submitting: "准备制作", running: "媒体制作中", uploading: "保存结果", completed: "已完成", failed: "失败", unknown: "执行结果待核实" };
export function mediaStageLabel(task: MediaTask) {
  if (task.status === "failed") return task.stage === "uploading" ? "上传失败，可补传已有结果" : "制作失败";
  return ({ result: "整理结果", uploading: "上传到云端", generating: "媒体制作中" } as Record<string, string>)[task.stage] || mediaStatusLabels[task.status] || task.status;
}
export async function submitMediaGeneration(input: MediaGenerationInput, requestId: string) {
  const result = await authRequest<MediaTask>("/media/v1/generate", { method: "POST", body: { ...input, requestId } });
  if (!result.status) throw new Error(result.message || "提交生成任务失败");
  return result.data;
}
export async function listMediaTasks(filters: { page: number; accountId?: number; kind?: string; status?: string }, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: "12" });
  if (filters.accountId) query.set("accountId", String(filters.accountId));
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.status) query.set("status", filters.status);
  const result = await authRequest<MediaTaskPage>(`/media/v1/tasks?${query}`, { signal });
  if (!result.status) throw new Error(result.message || "读取任务列表失败");
  return result.data;
}
export async function getMediaTask(id: string, signal?: AbortSignal) {
  const result = await authRequest<MediaTask>(`/media/v1/task?id=${encodeURIComponent(id)}`, { signal });
  if (!result.status) throw new Error(result.message || "读取任务详情失败");
  return result.data;
}
export async function retryMediaTask(id: string) {
  const result = await authRequest<MediaTask>("/media/v1/retry", { method: "POST", body: { id } });
  if (!result.status) throw new Error(result.message || "重试失败");
  return result.data;
}
export async function deleteMediaTask(id: string) {
  const result = await authRequest("/media/v1/delete", { method: "POST", body: { id } });
  if (!result.status) throw new Error(result.message || "删除任务失败");
}
