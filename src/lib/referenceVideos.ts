import { authRequest, authenticatedFetch, buildProxyHeaders, isPlatformAdmin, type ApiResponse } from "@/lib/api";

export type ReferenceVideo = {
  id: number;
  name: string;
  description: string;
  videoUrl: string;
  sourceType: "upload" | "url";
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export function normalizeReferenceVideo(value: unknown): ReferenceVideo | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const text = (key: string) => typeof item[key] === "string" ? item[key] as string : "";
  const number = (key: string) => typeof item[key] === "number" && Number.isFinite(item[key]) ? item[key] as number : 0;
  try {
    const url = new URL(text("videoUrl"));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  } catch {
    return null;
  }
  if (!Number.isInteger(number("id")) || number("id") <= 0 || !text("name").trim()) return null;
  return {
    id: number("id"), name: text("name"), description: text("description"), videoUrl: text("videoUrl"),
    sourceType: item.sourceType === "upload" ? "upload" : "url", mimeType: text("mimeType"), sizeBytes: number("sizeBytes"),
    version: number("version"), createdBy: number("createdBy"), createdAt: text("createdAt"), updatedAt: text("updatedAt")
  };
}

function requireAdmin() {
  if (!isPlatformAdmin()) throw new Error("仅平台管理员可以管理参考视频。");
}

function readVideo(value: unknown) {
  const video = normalizeReferenceVideo(value);
  if (!video) throw new Error("服务端返回了无效的参考视频数据。");
  return video;
}

export async function fetchReferenceVideos() {
  requireAdmin();
  let response: ApiResponse<{ videos?: unknown[] | null } | null>;
  try {
    response = await authRequest<{ videos?: unknown[] | null } | null>("/referenceVideo/v1/list", { method: "POST" });
  } catch (cause) {
    if (cause && typeof cause === "object" && "name" in cause && cause.name === "SyntaxError") {
      throw new Error("参考视频服务暂不可用，请稍后刷新。");
    }
    throw cause;
  }
  if (!response.status) throw new Error(response.message || "获取参考视频失败。");
  const videos = response.data?.videos;
  if (videos == null) return [];
  if (!Array.isArray(videos)) throw new Error("参考视频列表暂不可用，请稍后刷新。");
  return videos.map(readVideo);
}

export async function createReferenceVideo(input: { name: string; description: string; videoUrl: string }) {
  requireAdmin();
  const response = await authRequest<unknown>("/referenceVideo/v1/create", { method: "POST", body: input });
  if (!response.status) throw new Error(response.message || "新增参考视频失败。");
  return readVideo(response.data);
}

export async function updateReferenceVideo(input: { id: number; version: number; name: string; description: string; videoUrl?: string }) {
  requireAdmin();
  const { id, ...fields } = input;
  const response = await authRequest<unknown>("/referenceVideo/v1/update", { method: "POST", body: { ...fields, videoId: id } });
  if (!response.status) throw new Error(response.message || "修改参考视频失败。");
  return readVideo(response.data);
}

export async function deleteReferenceVideo(video: Pick<ReferenceVideo, "id" | "version">) {
  requireAdmin();
  const response = await authRequest<unknown>("/referenceVideo/v1/delete", { method: "POST", body: { videoId: video.id, version: video.version } });
  if (!response.status) throw new Error(response.message || "删除参考视频失败。");
}

export async function uploadReferenceVideo(input: { name: string; description: string; file: File; id?: number; version?: number }) {
  requireAdmin();
  if (!input.file.size || input.file.size > 200 * 1024 * 1024) throw new Error("请选择不超过200MB的视频文件。");
  const form = new FormData();
  form.set("name", input.name);
  form.set("description", input.description);
  form.set("file", input.file);
  if (input.id) {
    form.set("videoId", String(input.id));
    form.set("version", String(input.version || 0));
  }
  const response = await authenticatedFetch("/api/reference-videos/upload", { method: "POST", headers: buildProxyHeaders(), body: form });
  const result = await response.json().catch(() => ({})) as ApiResponse<unknown>;
  if (!response.ok || !result.status) throw new Error(result.message || "上传参考视频失败。");
  return readVideo(result.data);
}
