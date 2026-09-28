import {
  authRequest,
  authenticatedFetch,
  buildProxyHeaders,
  isPlatformAdmin,
  type ApiResponse,
  type LoginResponse
} from "@/lib/api";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { buildBackendSignedHeaders } from "@/lib/xhs-signature";
import type { BackendAiCredentials } from "@/lib/backendAiClient";

export type FeaturedVlogBeat = {
  name: string;
  shotDuty: string;
  visualGuidance: string;
  required: boolean;
};

export type FeaturedVlogTemplate = {
  id: string;
  name: string;
  outline: string;
  beats: FeaturedVlogBeat[];
  requiredScenes: string[];
  perspectiveGuidance: string;
  visualGuidance: string;
  musicTags: string[];
  version: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformMusic = {
  id: number;
  name: string;
  tags: string[];
  durationSeconds: number;
  mimeType: string;
  sizeBytes: number;
  audioUrl: string;
  authorizationState: "available" | "unavailable" | string;
  authorizationNote: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export type MusicCandidate = Pick<PlatformMusic, "id" | "name" | "tags" | "durationSeconds" | "mimeType" | "audioUrl">;

export type FeaturedVlogScript = {
  title: string;
  summary: string;
  perspective: string;
  moodTags: string[];
  musicTags: string[];
  noteTask: {
    topicTitle: string;
    contentType: string;
    contentGoal: string;
    targetUser: string;
    painPoint: string;
    coreView: string;
    requiredMaterials: string;
    recommendedAssets: string;
    coverCopyDirection: string;
    commentHook: string;
    expectedGoal: string;
    writingStyleName: string;
    writingStyleReference: string;
    knowledgeSourceKeys: string[];
  };
  shots: Array<{
    order: number;
    beat: string;
    role: string;
    description: string;
    suggestedMaterial: string;
    subjectPresence: "pov" | "traveler" | "environment";
  }>;
};

export type FeaturedVlogFramePlan = Array<{
  order: number;
  role: string;
  description: string;
  frameSource: "asset" | "generate";
  assetUrl: string;
  framePrompt: string;
}>;

export type FeaturedVlogMotionPlan = Array<{
  order: number;
  mainVideoPrompt: string;
  endingTransitionPrompt: string;
}>;

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown) {
  return value === true;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

export function isPublicAudioUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normalizeFeaturedVlogTemplate(value: unknown): FeaturedVlogTemplate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const beats = Array.isArray(item.beats)
    ? item.beats.map((beat) => {
        if (!beat || typeof beat !== "object") return null;
        const source = beat as Record<string, unknown>;
        return {
          name: stringValue(source.name),
          shotDuty: stringValue(source.shotDuty),
          visualGuidance: stringValue(source.visualGuidance),
          required: booleanValue(source.required)
        } satisfies FeaturedVlogBeat;
      }).filter((beat): beat is FeaturedVlogBeat => Boolean(beat))
    : [];
  const template = {
    id: stringValue(item.id),
    name: stringValue(item.name),
    outline: stringValue(item.outline),
    beats,
    requiredScenes: stringList(item.requiredScenes),
    perspectiveGuidance: stringValue(item.perspectiveGuidance),
    visualGuidance: stringValue(item.visualGuidance),
    musicTags: stringList(item.musicTags),
    version: numberValue(item.version),
    createdBy: numberValue(item.createdBy),
    createdAt: stringValue(item.createdAt),
    updatedAt: stringValue(item.updatedAt)
  } satisfies FeaturedVlogTemplate;
  return template.id && template.name && template.outline && template.beats.length ? template : null;
}

export function normalizePlatformMusic(value: unknown): PlatformMusic | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const music = {
    id: numberValue(item.id),
    name: stringValue(item.name),
    tags: stringList(item.tags),
    durationSeconds: numberValue(item.durationSeconds),
    mimeType: stringValue(item.mimeType),
    sizeBytes: numberValue(item.sizeBytes),
    audioUrl: stringValue(item.audioUrl),
    authorizationState: stringValue(item.authorizationState),
    authorizationNote: stringValue(item.authorizationNote),
    createdBy: numberValue(item.createdBy),
    createdAt: stringValue(item.createdAt),
    updatedAt: stringValue(item.updatedAt)
  } satisfies PlatformMusic;
  return music.id > 0 && music.name && isPublicAudioUrl(music.audioUrl) ? music : null;
}

function requireAdmin(user?: LoginResponse | null) {
  if (!isPlatformAdmin(user)) throw new Error("仅平台管理员可以管理精选 Vlog 平台素材。");
}

function readTemplateResponse(value: unknown) {
  const template = normalizeFeaturedVlogTemplate(value);
  if (!template) throw new Error("服务端返回了无效的精选 Vlog 模板数据。");
  return template;
}

export async function fetchFeaturedVlogTemplates() {
  const response = await authRequest<{ templates?: unknown[] }>("/featuredVlog/v1/template/list", { method: "POST" });
  if (!response.status || !Array.isArray(response.data?.templates)) throw new Error(response.message || "获取精选 Vlog 模板失败。");
  return response.data.templates.map(readTemplateResponse);
}

export async function createFeaturedVlogTemplate(input: Omit<FeaturedVlogTemplate, "id" | "version" | "createdBy" | "createdAt" | "updatedAt">) {
  requireAdmin();
  const response = await authRequest<unknown>("/featuredVlog/v1/template/create", { method: "POST", body: input });
  if (!response.status) throw new Error(response.message || "创建精选 Vlog 模板失败。");
  return readTemplateResponse(response.data);
}

export async function updateFeaturedVlogTemplate(input: Omit<FeaturedVlogTemplate, "createdBy" | "createdAt" | "updatedAt">) {
  requireAdmin();
  const response = await authRequest<unknown>("/featuredVlog/v1/template/update", {
    method: "POST",
    body: {
      templateId: input.id,
      version: input.version,
      name: input.name,
      outline: input.outline,
      beats: input.beats,
      requiredScenes: input.requiredScenes,
      perspectiveGuidance: input.perspectiveGuidance,
      visualGuidance: input.visualGuidance,
      musicTags: input.musicTags
    }
  });
  if (!response.status) throw new Error(response.message || "保存精选 Vlog 模板失败。");
  return readTemplateResponse(response.data);
}

export async function deleteFeaturedVlogTemplate(input: Pick<FeaturedVlogTemplate, "id" | "version">) {
  requireAdmin();
  const response = await authRequest<{ templateId?: string }>("/featuredVlog/v1/template/delete", {
    method: "POST",
    body: { templateId: input.id, version: input.version }
  });
  if (!response.status) throw new Error(response.message || "删除精选 Vlog 模板失败。");
}

export async function fetchPlatformMusic(authorizationState = "") {
  requireAdmin();
  const response = await authRequest<{ musics?: unknown[] }>("/featuredVlog/v1/music/list", {
    method: "POST",
    body: { authorizationState }
  });
  if (!response.status || !Array.isArray(response.data?.musics)) throw new Error(response.message || "获取平台配乐失败。");
  return response.data.musics.map(normalizePlatformMusic).filter((music): music is PlatformMusic => Boolean(music));
}

export async function uploadPlatformMusic(input: { name: string; tags: string[]; authorizationNote: string; file: File }) {
  requireAdmin();
  const form = new FormData();
  form.set("name", input.name);
  form.set("tags", JSON.stringify(input.tags));
  form.set("authorizationNote", input.authorizationNote);
  form.set("file", input.file);
  const response = await authenticatedFetch("/api/featured-vlog/music/upload", {
    method: "POST",
    headers: buildProxyHeaders(),
    body: form
  });
  const result = await response.json().catch(() => ({})) as ApiResponse<unknown>;
  if (!response.ok || !result.status) throw new Error(result.message || "上传平台配乐失败。");
  const music = normalizePlatformMusic(result.data);
  if (!music) throw new Error("服务端返回了无效的平台配乐数据。");
  return music;
}

export async function updatePlatformMusic(input: Pick<PlatformMusic, "id" | "name" | "tags" | "authorizationState" | "authorizationNote">) {
  requireAdmin();
  const response = await authRequest<unknown>("/featuredVlog/v1/music/update", {
    method: "POST",
    body: {
      musicId: input.id,
      name: input.name,
      tags: input.tags,
      authorizationState: input.authorizationState,
      authorizationNote: input.authorizationNote
    }
  });
  if (!response.status) throw new Error(response.message || "保存平台配乐失败。");
  const music = normalizePlatformMusic(response.data);
  if (!music) throw new Error("服务端返回了无效的平台配乐数据。");
  return music;
}

export async function fetchMusicCandidates(accountId: number) {
  const response = await authRequest<{ candidates?: unknown[] }>("/featuredVlog/v1/music/candidates", {
    method: "POST",
    body: { accountId }
  });
  if (!response.status || !Array.isArray(response.data?.candidates)) throw new Error(response.message || "获取候选配乐失败。");
  return response.data.candidates.map(normalizePlatformMusic).filter((music): music is PlatformMusic => Boolean(music));
}

export async function fetchFeaturedVlogTemplatesFromBackend(credentials: BackendAiCredentials) {
  const url = `${getBackendApiBaseUrl()}/featuredVlog/v1/template/list`;
  const body = "{}";
  const response = await fetch(url, {
    method: "POST",
    headers: buildBackendSignedHeaders({ url, method: "POST", body, token: credentials.token, uid: credentials.uid, test: credentials.test }),
    body
  });
  const result = await response.json().catch(() => ({})) as ApiResponse<{ templates?: unknown[] }>;
  if (!response.ok || !result.status || !Array.isArray(result.data?.templates)) {
    throw new Error(result.message || `获取精选 Vlog 模板失败（HTTP ${response.status}）。`);
  }
  return result.data.templates.map(readTemplateResponse);
}

export async function fetchMusicCandidatesFromBackend(accountId: number, credentials: BackendAiCredentials) {
  const url = `${getBackendApiBaseUrl()}/featuredVlog/v1/music/candidates`;
  const body = JSON.stringify({ accountId });
  const response = await fetch(url, {
    method: "POST",
    headers: buildBackendSignedHeaders({ url, method: "POST", body, token: credentials.token, uid: credentials.uid, test: credentials.test }),
    body
  });
  const result = await response.json().catch(() => ({})) as ApiResponse<{ candidates?: unknown[] }>;
  if (!response.ok || !result.status || !Array.isArray(result.data?.candidates)) {
    throw new Error(result.message || `获取候选配乐失败（HTTP ${response.status}）。`);
  }
  return result.data.candidates.map(normalizePlatformMusic).filter((music): music is PlatformMusic => Boolean(music));
}
