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

export const STORY_CHARACTER_TEMPLATES = [
  { id: "cat_moon_post", name: "小猫｜月光邮局" },
  { id: "dog_reverse_map", name: "小狗｜反方向的地图" },
  { id: "niu_lai_dream", name: "牛来｜云雀入梦" },
  { id: "fox_borrowed_moon", name: "小狐狸｜借月亮的人" },
  { id: "rabbit_last_train", name: "小兔子｜末班车没有终点" }
] as const;

type StoryCharacterListResponse = {
  status?: boolean;
  message?: string;
  data?: { characters?: unknown };
};

export function isStoryCharacterTemplate(templateId: string) {
  return STORY_CHARACTER_TEMPLATES.some((template) => template.id === templateId);
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

export async function fetchStoryCharactersFromBackend(
  templateId: string,
  credentials: BackendAiCredentials
): Promise<StoryCharacter[]> {
  if (!isStoryCharacterTemplate(templateId)) throw new Error("故事模板无效。");
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
