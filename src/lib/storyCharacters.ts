import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { buildBackendSignedHeaders } from "@/lib/xhs-signature";
import type { BackendAiCredentials } from "@/lib/backendAiClient";

export type StoryCharacter = {
  id: string;
  templateId: string;
  name: string;
  description: string;
  imageUrl: string;
  createdAt?: string;
};

export type StoryCharacterTemplate = {
  id: string;
  name: string;
  outline: string;
  requiredScenes: string[];
  createdAt?: string;
  updatedAt?: string;
};

type StoryCharacterListResponse = {
  status?: boolean;
  message?: string;
  data?: { characters?: unknown };
};

type StoryCharacterTemplateListResponse = {
  status?: boolean;
  message?: string;
  data?: { templates?: unknown };
};

export function normalizeStoryCharacterTemplate(value: unknown): StoryCharacterTemplate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = String(item.templateId ?? item.id ?? "").trim();
  const name = String(item.name ?? "").trim();
  const outline = String(item.outline ?? "").trim();
  const requiredScenes = Array.isArray(item.requiredScenes)
    ? item.requiredScenes.map((scene) => String(scene).trim()).filter(Boolean)
    : [];
  if (!id || !name || !outline) return null;
  return {
    id,
    name,
    outline,
    requiredScenes,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined
  };
}

export function normalizeStoryCharacter(value: unknown): StoryCharacter | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id ?? "").trim();
  const templateId = String(item.templateId ?? "").trim();
  const name = String(item.name ?? "").trim();
  const description = String(item.description ?? "").trim();
  const imageUrl = String(item.imageUrl ?? "").trim();
  if (!id || !templateId || !name || !description || !imageUrl) return null;
  return {
    id,
    templateId,
    name,
    description,
    imageUrl,
    createdAt: item.createdAt ? String(item.createdAt) : undefined
  };
}

export function isPublicStoryCharacterImageUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function characterDownloadUrl(character: StoryCharacter) {
  if (!isPublicStoryCharacterImageUrl(character.imageUrl)) {
    throw new Error("角色图片公网地址必须是外部可访问的 HTTPS 地址。");
  }
  return character.imageUrl;
}

export async function resolveStoryCharacter(
  templateId: string,
  characterId: string | undefined,
  credentials: BackendAiCredentials
): Promise<StoryCharacter> {
  const characters = await fetchStoryCharactersFromBackend(templateId, credentials);
  const character = characters.find((item) => item.id === String(characterId || "").trim());
  if (!character) throw new Error("请选择当前故事模板对应的主角形象。");
  return character;
}

export async function resolveStoryCharacterTemplate(
  templateId: string,
  credentials: BackendAiCredentials
): Promise<StoryCharacterTemplate> {
  const templates = await fetchStoryCharacterTemplatesFromBackend(credentials);
  const template = templates.find((item) => item.id === String(templateId || "").trim());
  if (!template) throw new Error("故事模板不存在或已被删除。");
  return template;
}

export async function fetchStoryCharacterTemplatesFromBackend(
  credentials: BackendAiCredentials
): Promise<StoryCharacterTemplate[]> {
  const url = `${getBackendApiBaseUrl()}/storyCharacter/v1/template/list`;
  const body = "{}";
  const response = await fetch(url, {
    method: "POST",
    headers: buildBackendSignedHeaders({
      url,
      method: "POST",
      body,
      token: credentials.token,
      uid: credentials.uid,
      test: credentials.test
    }),
    body
  });
  const result = await response.json().catch(() => ({})) as StoryCharacterTemplateListResponse;
  if (!response.ok || !result.status) {
    throw new Error(result.message || `获取故事模板失败（HTTP ${response.status}）。`);
  }
  const rawTemplates = Array.isArray(result.data?.templates) ? result.data.templates : [];
  const templates = rawTemplates.map(normalizeStoryCharacterTemplate);
  if (templates.some((template) => !template)) throw new Error("服务端返回了无效的故事模板数据。");
  return templates as StoryCharacterTemplate[];
}

export async function fetchStoryCharactersFromBackend(
  templateId: string,
  credentials: BackendAiCredentials
): Promise<StoryCharacter[]> {
  const url = `${getBackendApiBaseUrl()}/storyCharacter/v1/list`;
  const body = JSON.stringify({ templateId });
  const response = await fetch(url, {
    method: "POST",
    headers: buildBackendSignedHeaders({
      url,
      method: "POST",
      body,
      token: credentials.token,
      uid: credentials.uid,
      test: credentials.test
    }),
    body
  });
  const result = await response.json().catch(() => ({})) as StoryCharacterListResponse;
  if (!response.ok || !result.status) {
    throw new Error(result.message || `获取故事角色失败（HTTP ${response.status}）。`);
  }
  const rawCharacters = Array.isArray(result.data?.characters) ? result.data.characters : [];
  const characters = rawCharacters.map(normalizeStoryCharacter);
  if (characters.some((character) => !character)) throw new Error("服务端返回了无效的故事角色数据。");
  const normalized = characters as StoryCharacter[];
  if (normalized.some((character) => character.templateId !== templateId || !isPublicStoryCharacterImageUrl(character.imageUrl))) {
    throw new Error("服务端返回了无效的故事角色图片地址。");
  }
  return normalized;
}
