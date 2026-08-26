import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import type { BackendAiCredentials } from "@/lib/backendAiClient";

export type ImageRefinementAsset = {
  id: number;
  filePath: string;
  fileUrl: string;
  fileType: string;
  sourceType: string;
  location: string;
  shotAt: string;
  tags: string;
  suitableTypes: string;
  riskNotes: string;
  width: number;
  height: number;
};

export type ImageAutoSelectionItem = {
  assetKey: string;
  order: number;
  role: string;
  reason: string;
};

export type ImageAutoSelectionPlan = {
  setStrategy: string;
  images: ImageAutoSelectionItem[];
};

export type ImageTextBlock = {
  text: string;
  position: string;
  style: string;
};

export type ImageRefinementRenderMode = "photo_refine" | "photo_with_text";

export type ImageRefinementItem = {
  assetKey: string;
  order: number;
  role: string;
  recognitionBasis: string;
  renderMode: ImageRefinementRenderMode;
  editPrompt: string;
  negativePrompt: string;
  textBlocks: ImageTextBlock[];
  reviewNotes: string;
};

export type ImageRefinementPlan = {
  setStrategy: string;
  globalEditRules: string[];
  images: ImageRefinementItem[];
  globalReviewNotes: string[];
};

export type AiAuxiliaryImageItem = {
  order: number;
  role: string;
  visualBasis: string;
  renderMode: "visual" | "info_card";
  generationPrompt: string;
  negativePrompt: string;
  textBlocks: ImageTextBlock[];
  textEditPrompt: string;
  bodySentence: string;
  reviewNotes: string;
};

export type AiAuxiliaryImagePlan = {
  setStrategy: string;
  globalGenerationRules: string[];
  images: AiAuxiliaryImageItem[];
  globalReviewNotes: string[];
};

export type MixedImagePlan = {
  setStrategy: string;
  globalRules: string[];
  realPlan: ImageRefinementPlan;
  aiPlan: AiAuxiliaryImagePlan | null;
  globalReviewNotes: string[];
};

type ImageRefinementResult =
  | { usedLlm: true; data: ImageRefinementPlan; model: string }
  | { usedLlm: false; error: string };

type ImageAutoSelectionResult =
  | { usedLlm: true; data: ImageAutoSelectionPlan; model: string }
  | { usedLlm: false; error: string };

type MixedImagePlanResult =
  | { usedLlm: true; data: MixedImagePlan; model: string }
  | { usedLlm: false; error: string };

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const raw = fenced || (start >= 0 && end > start ? text.slice(start, end + 1) : "");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean)
    : [];
}

function readTextBlocks(value: unknown): ImageTextBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const item = raw as Record<string, unknown>;
      const text = readString(item.text);
      if (!text) return null;
      return {
        text,
        position: readString(item.position) || "由版式确定的清晰可读区域",
        style: readString(item.style) || "清晰、克制、适合小红书手机端阅读"
      };
    })
    .filter((item): item is ImageTextBlock => Boolean(item));
}

function promptContainsAllText(prompt: string, blocks: ImageTextBlock[]) {
  return blocks.every((block) => prompt.includes(block.text));
}

function appendExactTextInstructions(prompt: string, blocks: ImageTextBlock[]) {
  if (!blocks.length || promptContainsAllText(prompt, blocks)) return prompt;
  const instructions = blocks
    .map((block, index) => `${index + 1}. 在${block.position}准确写入“${block.text}”，样式：${block.style}`)
    .join("\n");
  return `${prompt}\n\n必须在本次图片编辑中逐字完成以下文字排版，不得改写、漏写或使用占位文字：\n${instructions}`;
}

function describesStructuredTextLayout(value: string) {
  return /信息卡|结构说明图|流程图|要点图|路线卡|气泡|标题区|流程节点|卡片栏位|文字框|文字占位/.test(value);
}

export function imageRefinementAssetKey(asset: ImageRefinementAsset, index: number) {
  return `asset-${index + 1}-${asset.id}`;
}

function parseAutoSelectionPlan(
  text: string,
  assets: ImageRefinementAsset[],
  imageCount: number
): ImageAutoSelectionPlan | null {
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.images) || parsed.images.length !== imageCount) return null;

  const expectedKeys = new Set(assets.map(imageRefinementAssetKey));
  const seenKeys = new Set<string>();
  const seenOrders = new Set<number>();
  const images: ImageAutoSelectionItem[] = [];

  for (const rawItem of parsed.images) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return null;
    const item = rawItem as Record<string, unknown>;
    const assetKey = readString(item.assetKey);
    const order = typeof item.order === "number" ? item.order : Number(item.order);
    const role = readString(item.role);
    const reason = readString(item.reason);
    if (
      !expectedKeys.has(assetKey)
      || seenKeys.has(assetKey)
      || !Number.isInteger(order)
      || order < 1
      || order > imageCount
      || seenOrders.has(order)
      || !role
      || !reason
    ) {
      return null;
    }
    seenKeys.add(assetKey);
    seenOrders.add(order);
    images.push({ assetKey, order, role, reason });
  }

  if (seenKeys.size !== imageCount || seenOrders.size !== imageCount) return null;
  images.sort((a, b) => a.order - b.order);
  return {
    setStrategy: readString(parsed.setStrategy) || "根据笔记目标和素材标签选择并排序最匹配的图片。",
    images
  };
}

function parsePlan(
  text: string,
  assets: ImageRefinementAsset[],
  selectionMode: "manual" | "ai_auto"
): ImageRefinementPlan | null {
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.images)) return null;

  const expectedKeys = new Set(assets.map(imageRefinementAssetKey));
  const seenKeys = new Set<string>();
  const items: ImageRefinementItem[] = [];

  for (const rawItem of parsed.images) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return null;
    const item = rawItem as Record<string, unknown>;
    const key = readString(item.assetKey);
    const rawEditPrompt = readString(item.editPrompt);
    const requestedRenderMode: ImageRefinementRenderMode = readString(item.renderMode) === "photo_with_text"
      ? "photo_with_text"
      : "photo_refine";
    const textBlocks = readTextBlocks(item.textBlocks);
    if (!expectedKeys.has(key) || seenKeys.has(key) || !rawEditPrompt) return null;
    const renderMode: ImageRefinementRenderMode = requestedRenderMode === "photo_with_text" && textBlocks.length
      ? "photo_with_text"
      : "photo_refine";
    const normalizedTextBlocks = renderMode === "photo_with_text" ? textBlocks : [];
    const editPrompt = renderMode === "photo_with_text"
      ? appendExactTextInstructions(rawEditPrompt, normalizedTextBlocks)
      : rawEditPrompt;

    seenKeys.add(key);
    items.push({
      assetKey: key,
      order: 0,
      role: readString(item.role) || "正文配图",
      recognitionBasis: readString(item.recognitionBasis) || "根据素材文件和已有元数据概括",
      renderMode,
      editPrompt,
      negativePrompt: readString(item.negativePrompt) || "不得改变真实主体、空间结构、产品形态、人物身份或事实信息。",
      textBlocks: normalizedTextBlocks,
      reviewNotes: readString(item.reviewNotes) || "保留原图真实主体、结构和事实信息。"
    });
  }

  if (items.length !== assets.length || seenKeys.size !== expectedKeys.size) return null;
  const itemsByKey = new Map(items.map((item) => [item.assetKey, item]));
  const orderedItems = assets.map((asset, index) => itemsByKey.get(imageRefinementAssetKey(asset, index)));
  if (orderedItems.some((item) => !item)) return null;

  return {
    setStrategy: readString(parsed.setStrategy)
      || `按照${selectionMode === "ai_auto" ? "AI 自动选图" : "用户指定"}顺序安排封面和正文图集，保持整组图片风格统一。`,
    globalEditRules: readStringArray(parsed.globalEditRules),
    images: orderedItems.map((item, index) => ({ ...item!, order: index + 1 })),
    globalReviewNotes: readStringArray(parsed.globalReviewNotes)
  };
}

function parseAiAuxiliaryImagePlan(text: string, imageCount: number): AiAuxiliaryImagePlan | null {
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.images) || parsed.images.length !== imageCount) return null;

  const seenOrders = new Set<number>();
  const images: AiAuxiliaryImageItem[] = [];
  for (const rawItem of parsed.images) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return null;
    const item = rawItem as Record<string, unknown>;
    const order = typeof item.order === "number" ? item.order : Number(item.order);
    const generationPrompt = readString(item.generationPrompt);
    const renderMode = readString(item.renderMode) === "info_card" ? "info_card" : "visual";
    const textBlocks = readTextBlocks(item.textBlocks);
    const textEditPrompt = readString(item.textEditPrompt);
    const requiresTextCompletion = renderMode === "info_card"
      || describesStructuredTextLayout(`${readString(item.role)} ${generationPrompt}`);
    if (!Number.isInteger(order) || order < 1 || order > imageCount || seenOrders.has(order) || !generationPrompt) {
      return null;
    }
    if (
      (requiresTextCompletion && !textBlocks.length)
      || (textBlocks.length && (!textEditPrompt || !promptContainsAllText(textEditPrompt, textBlocks)))
    ) {
      return null;
    }

    seenOrders.add(order);
    images.push({
      order,
      role: readString(item.role) || "正文辅助图",
      visualBasis: readString(item.visualBasis) || "依据笔记内容生成非事实证据型辅助画面。",
      renderMode,
      generationPrompt,
      negativePrompt: readString(item.negativePrompt) || "不要生成 Logo、真实地点或未经确认的事实信息。",
      textBlocks,
      textEditPrompt,
      bodySentence: readString(item.bodySentence),
      reviewNotes: readString(item.reviewNotes) || "核对画面没有被误认为真实现场或事实证据。"
    });
  }

  if (seenOrders.size !== imageCount || images.filter((item) => item.renderMode === "info_card").length > 1) return null;
  images.sort((a, b) => a.order - b.order);
  return {
    setStrategy: readString(parsed.setStrategy) || "围绕笔记内容生成一组结构明确、风格统一的辅助图片。",
    globalGenerationRules: readStringArray(parsed.globalGenerationRules),
    images,
    globalReviewNotes: readStringArray(parsed.globalReviewNotes)
  };
}

export async function generateImageAutoSelectionWithLlm(input: {
  account: Record<string, unknown>;
  noteTask: Record<string, unknown>;
  noteContent: string;
  singleGoal: string;
  styleBrief: string[];
  expertRules: string;
  imageCount: number;
  assets: ImageRefinementAsset[];
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
  credentials?: BackendAiCredentials;
}): Promise<ImageAutoSelectionResult> {
  const model = process.env.AI_MODEL || "gpt-5.5";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("backend ai timeout"), 8 * 60 * 1000);
  const assets = input.assets.map((asset, index) => ({
    assetKey: imageRefinementAssetKey(asset, index),
    id: asset.id,
    filePath: asset.filePath,
    fileUrl: asset.fileUrl,
    tags: asset.tags,
    suitableTypes: asset.suitableTypes,
    location: asset.location,
    shotAt: asset.shotAt,
    sourceType: asset.sourceType,
    width: asset.width,
    height: asset.height
  }));

  try {
    const response = await completeWithBackendAi({
      model,
      signal: controller.signal,
      knowledgeSnapshotId: input.knowledgeSnapshotId,
      knowledgeSourceKeys: input.knowledgeSourceKeys,
      credentials: input.credentials,
      instructions: `你是小红书单篇笔记的素材选图策划师。你只能读取素材标签、文件名和其他文字元数据，不能查看图片本身。你的任务是从当前账号的候选素材中，选择最符合本篇笔记目标、内容方向和图集叙事的指定数量图片，并给出最终使用顺序。

不得声称看过图片，不得根据 URL 猜测画面，不得虚构标签中没有的信息。标签缺失或过于笼统时，应降低该素材优先级，但候选素材不足时仍可结合文件名、适用内容、地点和尺寸做保守判断。

只返回 JSON，不要返回 Markdown、解释或代码块。`,
      input: `请从候选素材中选择恰好 ${input.imageCount} 张图片。

硬性要求：
- 只能选择候选素材中存在的 assetKey，不能创造、重复或遗漏 assetKey。
- images 必须恰好包含 ${input.imageCount} 项，order 必须从 1 连续到 ${input.imageCount}。
- 第 1 张固定作为封面，优先匹配封面方向、主题识别度和竖版可用性。
- 其余图片按照本篇主题、素材事实和读者理解需要安排，每张图片承担不同且明确的职责；不得反向限定正文的叙事顺序。
- 选择依据只能来自 tags、suitableTypes、filePath、location、shotAt、sourceType 和尺寸等文字元数据。
- reason 必须写清素材标签与本篇笔记信息的匹配关系，不得写成已经识别了真实画面。
- 不要生成图片精修 Prompt；本次只负责选图和排序。

账号和任务上下文：
${JSON.stringify(
  {
    account: input.account,
    noteTask: input.noteTask,
    noteContent: input.noteContent,
    singleGoal: input.singleGoal,
    styleBrief: input.styleBrief,
    expertRules: input.expertRules
  },
  null,
  2
)}

候选素材：
${JSON.stringify(assets, null, 2)}

返回以下 JSON：
{
  "setStrategy": "本篇图集的选图与排序策略",
  "images": [
    {
      "assetKey": "原样返回候选素材中的 assetKey",
      "order": 1,
      "role": "封面/场景说明/细节说明/信息补充等",
      "reason": "仅根据素材标签和文字元数据说明选择理由"
    }
  ]
}`
    });

    if (!response.ok) return { usedLlm: false, error: response.error };
    const plan = parseAutoSelectionPlan(response.text, input.assets, input.imageCount);
    if (!plan) {
      return { usedLlm: false, error: "AI 返回的自动选图结果不完整、包含无效素材或无法解析，请重试。" };
    }
    return { usedLlm: true, data: plan, model: response.model || model };
  } catch (error) {
    return { usedLlm: false, error: error instanceof Error ? error.message : "AI 自动选图调用失败。" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateImageRefinementPlanWithLlm(input: {
  account: Record<string, unknown>;
  noteTask: Record<string, unknown>;
  noteContent: string;
  singleGoal: string;
  styleBrief: string[];
  expertRules: string;
  assets: ImageRefinementAsset[];
  baseRequirements: string;
  selectionMode?: "manual" | "ai_auto";
  removeWatermarks?: boolean;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
  credentials?: BackendAiCredentials;
}): Promise<ImageRefinementResult> {
  const model = process.env.AI_MODEL || "gpt-5.5";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("backend ai timeout"), 8 * 60 * 1000);
  const assets = input.assets.map((asset, index) => ({
    assetKey: imageRefinementAssetKey(asset, index),
    ...asset
  }));
  const selectionMode = input.selectionMode === "ai_auto" ? "ai_auto" : "manual";
  const selectionDescription = selectionMode === "ai_auto"
    ? "后端选图 AI 已经根据候选素材标签完成选图和排序"
    : "用户已经手动完成选图和排序";
  const watermarkRequirement = input.removeWatermarks
    ? `
- 用户明确要求执行去水印。逐张检查所有类型的水印、品牌水印、账号角标、平台角标和来源文字；如存在，editPrompt 必须明确要求完整去除，并根据邻近画面自然补全背景，不留下模糊块、涂抹痕迹、重复纹理、文字残影或明显修补边界。`
    : "";

  try {
    const response = await completeWithBackendAi({
      model,
      signal: controller.signal,
      knowledgeSnapshotId: input.knowledgeSnapshotId,
      knowledgeSourceKeys: input.knowledgeSourceKeys,
      credentials: input.credentials,
      instructions: `你是小红书图文内容的图片精修策划师。你的任务是根据账号、笔记目标和已经确定的素材元数据，为每张素材生成一条可供 xiaohongshu_auto_op edit-image 使用的精修 Prompt。

当前接口只能读取文字和素材元数据，不能直接查看 URL 对应的图片。不得声称已经看过图片，不得虚构图片中不存在的人物、空间、产品、景观、设施、文字或事实。Prompt 必须采用保守编辑策略，要求执行端以指定原图为准，保留真实主体、结构和关键信息。

只返回 JSON，不要返回 Markdown、解释或代码块。`,
      input: `请为下面这组已经确定的图片生成一份完整的逐图精修计划。

硬性要求：
- images 必须与输入 assets 一一对应，不能遗漏、重复或增加素材。
- assetKey 必须原样返回。
- ${selectionDescription}，精修阶段不得评价、筛选、替换或建议其他图片。
- assets 的输入顺序就是已经确定的最终图集顺序，禁止重新排序；第一张固定作为封面，一张输入素材必须对应一张精修成品。
- order 必须等于对应素材在输入 assets 中从 1 开始的序号。
- editPrompt 必须是可直接传给图片编辑模型的中文提示词，明确保留什么、调整什么、禁止改变什么。
- 默认使用 photo_refine，只做照片级精修：调整构图、光线、色彩、清晰度和必要的背景整理。不得主动把真实图片改造成信息卡、流程图、结构说明图、路线/要点卡，不得增加空白气泡、空白文字框、卡片容器或文字占位区域。
- 使用 photo_refine 时 textBlocks 必须返回空数组，不要规划任何图上文字。
- 只有笔记目标、封面方向或用户额外要求明确需要图上文字时，才使用 photo_with_text。此时 textBlocks 必须列出所有准确文字，editPrompt 必须逐字包含这些文字，并要求图片模型在本次 edit-image 中直接完成排版；不得输出“待填写”“后期添加”等占位内容。
- 每个文字块尽量不超过 12 个汉字，每张图片不超过 6 个文字块。不得添加未经核验的价格、路线参数、营业时间、联系方式或业务事实。
- 如果素材信息不足，使用保守精修，不得补造具体事实。
- 素材标签只作为策划参考，执行端以指定原图为准；不得要求执行端比较标签后停止任务。
- reviewNotes 只写事实信息和成品效果的必要核验项，不得要求比较原图与素材标签是否一致。
- 输出尺寸由 CLI 统一请求为 1536x2048，不要自行编写 CLI 命令。该尺寸仅作为请求参数，不得在 reviewNotes 或 globalReviewNotes 中要求核验成品实际像素，也不得因实际像素与请求值不同而判定失败。
${watermarkRequirement}

账号和任务上下文：
${JSON.stringify(
  {
    account: input.account,
    noteTask: input.noteTask,
    noteContent: input.noteContent,
    singleGoal: input.singleGoal,
    styleBrief: input.styleBrief,
    expertRules: input.expertRules
  },
  null,
  2
)}

已经确定的素材：
${JSON.stringify(assets, null, 2)}

现有图片硬规则和内容要求：
${input.baseRequirements}

返回以下 JSON：
{
  "setStrategy": "整组图片的视觉和叙事策略",
  "globalEditRules": ["整组统一规则"],
  "images": [
    {
      "assetKey": "原样返回输入 assetKey",
      "order": 1,
      "role": "封面/正文信息图/场景图等",
      "recognitionBasis": "根据文件名、标签和适用内容概括的素材信息",
      "renderMode": "photo_refine 或 photo_with_text",
      "editPrompt": "可直接用于 edit-image 的完整中文精修 Prompt",
      "negativePrompt": "本图禁止出现或禁止修改的内容",
      "textBlocks": [],
      "reviewNotes": "执行前和出图后的人工核验项"
    }
  ],
  "globalReviewNotes": ["整组图片的真实性和业务信息核验项"]
}`
    });

    if (!response.ok) return { usedLlm: false, error: response.error };
    const plan = parsePlan(response.text, input.assets, selectionMode);
    if (!plan) {
      return { usedLlm: false, error: "AI 返回的逐图精修结果不完整或无法解析，请重试。" };
    }
    const resolvedPlan = input.removeWatermarks
      ? {
          ...plan,
          globalEditRules: [
            ...plan.globalEditRules,
            "逐张检查并去除所有类型的水印、品牌水印、账号角标、平台角标和来源文字；自然补全背景，不得留下模糊块、涂抹痕迹、重复纹理、文字残影或明显修补边界。"
          ],
          images: plan.images.map((image) => ({
            ...image,
            editPrompt: `${image.editPrompt}\n检查原图中的所有类型水印、品牌水印、账号角标、平台角标和来源文字；如存在则完整去除，并根据邻近画面自然补全背景，不留下模糊块、涂抹痕迹、重复纹理、文字残影或明显修补边界。`,
            reviewNotes: `${image.reviewNotes}；确认所有水印、账号角标、平台角标、来源文字和相关残影已经去除。`
          }))
        }
      : plan;
    return { usedLlm: true, data: resolvedPlan, model: response.model || model };
  } catch (error) {
    return { usedLlm: false, error: error instanceof Error ? error.message : "AI 调用失败。" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateMixedImagePlanWithLlm(input: {
  account: Record<string, unknown>;
  noteTask: Record<string, unknown>;
  noteContent: string;
  realImageRefinementRequirement: string;
  aiAssistantRequirement: string;
  styleBrief: string[];
  expertRules: string;
  realAssets: ImageRefinementAsset[];
  manualImageCount: number;
  autoImageCount: number;
  aiImageCount: number;
  baseRequirements: string;
  removeWatermarks?: boolean;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
  credentials?: BackendAiCredentials;
}): Promise<MixedImagePlanResult> {
  const model = process.env.AI_MODEL || "gpt-5.5";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("backend ai timeout"), 8 * 60 * 1000);
  const realAssets = input.realAssets.map((asset, index) => ({
    assetKey: imageRefinementAssetKey(asset, index),
    ...asset
  }));
  const watermarkRequirement = input.removeWatermarks
    ? "\n- 用户开启去水印：所有真实素材的 editPrompt 必须要求完整去除水印、账号角标和来源文字，并自然补全背景；AI 辅助图不需要写去水印要求。"
    : "";

  try {
    const response = await completeWithBackendAi({
      model,
      signal: controller.signal,
      knowledgeSnapshotId: input.knowledgeSnapshotId,
      knowledgeSourceKeys: input.knowledgeSourceKeys,
      credentials: input.credentials,
      instructions: "你是小红书混合图集策划师。你只能读取真实素材的文字元数据，不能查看图片本身。你需要对已经确定顺序的真实素材生成保守精修 Prompt，并为末尾 AI 辅助图生成完整画面 Prompt。只返回合法 JSON，不返回 Markdown、解释或代码块。",
      input: `请为当前笔记生成一份混合图集逐图计划。

固定来源顺序：
1. 前 ${input.manualImageCount} 张为用户手动指定的真实素材，顺序不可改变；第 1 张在此数量大于 0 时固定为封面。
2. 接下来 ${input.autoImageCount} 张为后端 AI 已选中的真实素材，顺序不可改变；仅当手动素材为 0 时，其中第 1 张为封面。
3. 最后 ${input.aiImageCount} 张为 AI 辅助图，不得作为封面。

硬性要求：
- realImages 必须与输入真实素材一一对应，assetKey 必须原样返回，不能遗漏、重复、增删或重排。真实素材只能做照片级精修，不得改造成信息卡、流程图或空白文字框。
- 真实素材的 editPrompt 必须明确保留真实主体、结构和事实信息；只有确实需要图上文字时才使用 photo_with_text，并在 textBlocks 与 editPrompt 中逐字写明所有文字。
- “真实素材精修要求”只用于 realImages，必须直接体现在真实素材的 editPrompt 中；不得把“AI 辅助图要求”写入真实素材的 editPrompt、negativePrompt 或文字块。
- aiImages 必须恰好输出 ${input.aiImageCount} 项，order 从 1 连续到 ${input.aiImageCount}。每张必须有完整 generationPrompt、negativePrompt、正文对应句和核验项。
- AI 辅助图位于真实素材之后，服务于补足表达；可以生成创作性实拍感画面，但不得声称其是已核验的具体地点、路线、案例或用户反馈。
- “AI 辅助图要求”只用于 aiImages，必须直接体现在 generationPrompt、文字块或 textEditPrompt 中；不得把“真实素材精修要求”写入 AI 辅助图的生成或文字编辑要求。
- AI 辅助图优先使用 visual 生成自然风景、步道、装备、抵达感、生活方式或局部氛围画面；只有确实需要结构化提醒时才使用 info_card，整组最多 1 张。
- AI 辅助图若包含信息卡、气泡、文字框、标题区、流程节点或要点栏位，必须提供非空 textBlocks 和 textEditPrompt；所有文字必须逐字写入 textEditPrompt，不得留空白占位区域。
- 每个文字块尽量不超过 12 个汉字，每张不超过 6 个文字块；不得写未经确认的价格、活动、库存、营业时间、路线参数、资质或联系方式。${watermarkRequirement}

账号和任务上下文：
${JSON.stringify({
  account: input.account,
  noteTask: input.noteTask,
  noteContent: input.noteContent,
  realImageRefinementRequirement: input.realImageRefinementRequirement,
  aiAssistantRequirement: input.aiAssistantRequirement,
  styleBrief: input.styleBrief,
  expertRules: input.expertRules
}, null, 2)}

真实素材（已按“手动 → 自动”最终顺序排列）：
${JSON.stringify(realAssets, null, 2)}

现有图片规则：
${input.baseRequirements}

返回 JSON：
{
  "setStrategy": "整组混合图集策略",
  "globalRules": ["整组统一规则"],
  "realImages": [
    {
      "assetKey": "原样返回输入 assetKey",
      "role": "封面/场景图/细节图等",
      "recognitionBasis": "仅根据文件名和文字元数据概括",
      "renderMode": "photo_refine 或 photo_with_text",
      "editPrompt": "可直接用于 edit-image 的完整中文 Prompt",
      "negativePrompt": "真实素材不得改变的内容",
      "textBlocks": [],
      "reviewNotes": "真实素材核验项"
    }
  ],
  "aiImages": [
    {
      "order": 1,
      "role": "AI 辅助图用途",
      "visualBasis": "本图依据的笔记内容",
      "renderMode": "visual 或 info_card",
      "generationPrompt": "可直接用于 generate-image 的完整中文 Prompt",
      "negativePrompt": "本图禁止生成内容",
      "textBlocks": [],
      "textEditPrompt": "有文字时基于底图调用 edit-image 的完整 Prompt；无文字留空",
      "bodySentence": "对应正文句",
      "reviewNotes": "核验项"
    }
  ],
  "globalReviewNotes": ["整组核验项"]
}`
    });

    if (!response.ok) return { usedLlm: false, error: response.error };
    const parsed = extractJson(response.text);
    if (!parsed) return { usedLlm: false, error: "AI 返回的混合图集计划无法解析。" };
    const realPlan = parsePlan(
      JSON.stringify({
        setStrategy: readString(parsed.setStrategy),
        globalEditRules: readStringArray(parsed.globalRules),
        images: parsed.realImages,
        globalReviewNotes: readStringArray(parsed.globalReviewNotes)
      }),
      input.realAssets,
      "manual"
    );
    const aiPlan = input.aiImageCount
      ? parseAiAuxiliaryImagePlan(
          JSON.stringify({
            setStrategy: readString(parsed.setStrategy),
            globalGenerationRules: readStringArray(parsed.globalRules),
            images: parsed.aiImages,
            globalReviewNotes: readStringArray(parsed.globalReviewNotes)
          }),
          input.aiImageCount
        )
      : null;
    if (!realPlan || (input.aiImageCount > 0 && !aiPlan)) {
      return { usedLlm: false, error: "AI 返回的混合图集计划不完整或顺序无效，请重试。" };
    }
    return {
      usedLlm: true,
      data: {
        setStrategy: readString(parsed.setStrategy) || "按真实素材和 AI 辅助图的固定来源顺序组成统一图集。",
        globalRules: readStringArray(parsed.globalRules),
        realPlan,
        aiPlan,
        globalReviewNotes: readStringArray(parsed.globalReviewNotes)
      },
      model: response.model || model
    };
  } catch (error) {
    return { usedLlm: false, error: error instanceof Error ? error.message : "AI 调用失败。" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAiAuxiliaryImagePlanWithLlm(input: {
  account: Record<string, unknown>;
  noteTask: Record<string, unknown>;
  noteContent: string;
  singleGoal: string;
  styleBrief: string[];
  expertRules: string;
  imageCount: number;
  baseRequirements: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
  credentials?: BackendAiCredentials;
}): Promise<
  | { usedLlm: true; data: AiAuxiliaryImagePlan; model: string }
  | { usedLlm: false; error: string }
> {
  const model = process.env.AI_MODEL || "gpt-5.5";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("backend ai timeout"), 8 * 60 * 1000);

  try {
    const response = await completeWithBackendAi({
      model,
      signal: controller.signal,
      knowledgeSnapshotId: input.knowledgeSnapshotId,
      knowledgeSourceKeys: input.knowledgeSourceKeys,
      credentials: input.credentials,
      instructions: `你是小红书图文内容的 AI 辅助图策划师。你只能读取文字上下文，不能查看任何图片。你的任务是把账号定位、单篇笔记目标和内容方向转换成一组可由 xiaohongshu_auto_op xhs-creative 完整执行的逐图中文 Prompt。

这些图片服务于内容表达和种草氛围。没有真实素材时，可以生成带有创作性的地点、场景、产品、人物、体验和情绪画面；涉及具体账号业务时，应让画面服务于本篇主题和品牌记忆，不要写成内部核验说明。凡是包含信息框、气泡、标题区、流程节点或卡片栏位的画面，最终成品必须填入完整文字，不能留下空白占位框。

只返回 JSON，不要返回 Markdown、解释或代码块。`,
      input: `请生成 ${input.imageCount} 张 AI 辅助图的逐图执行方案。

硬性要求：
- images 必须恰好包含 ${input.imageCount} 项，order 必须从 1 连续到 ${input.imageCount}，不得遗漏、重复或增加。
- generationPrompt 必须是完整、明确、可单独直接传给 generate-image 的中文提示词，不能让 Agent 再自行策划画面。
- 每条 generationPrompt 必须明确：图片用途、主体与信息层级、构图、视觉风格、光线或配色、3:4 竖版构图，以及希望观众获得的情绪和记忆点。
- 输出尺寸由 CLI 统一请求为 1536x2048，Prompt 中只需使用 3:4 竖版构图语言，不要编写 CLI 命令。该尺寸仅作为请求参数，不得在 reviewNotes 或 globalReviewNotes 中要求核验成品实际像素，也不得因实际像素与请求值不同而判定失败。
- 各张图片必须承担不同信息职责，并共同服务笔记叙事顺序。
- renderMode 只能是 visual 或 info_card。优先使用 visual 生成自然风景、步道、装备、抵达感、生活方式或局部氛围画面；只有笔记确实需要结构化提醒时才使用 info_card，整组最多 1 张。
- info_card 必须提供非空 textBlocks 和 textEditPrompt；textEditPrompt 必须逐字包含所有 textBlocks.text，并明确要求基于生成底图使用 edit-image 完成文字排版。不得生成只有空白框、空白气泡或占位区域的最终成品。
- visual 如果需要文字，同样必须提供 textBlocks 和 textEditPrompt；不需要文字时两者留空。
- 每个文字块尽量不超过 12 个汉字，每张图片不超过 6 个文字块。文字必须准确、简短、可直接发布，禁止使用“待填写”“后期添加”等占位词。
- 不得生成 Logo、水印、车牌、手机号或可识别个人信息。
- negativePrompt 要写本图特有的禁止项；Agent 会把它与 generationPrompt 一起传给图片模型。
- 不得把 AI 画面声称为已核验的具体地点、路线、案例、测量结果或用户反馈。
- 若笔记缺少具体地点、路线、产品或业务资料，优先使用创作性氛围画面、生活方式场景或不指向具体事实的视觉表达，不要让缺口限制画面的感染力。

账号和任务上下文：
${JSON.stringify(
  {
    account: input.account,
    noteTask: input.noteTask,
    noteContent: input.noteContent,
    singleGoal: input.singleGoal,
    styleBrief: input.styleBrief,
    expertRules: input.expertRules
  },
  null,
  2
)}

现有图片硬规则和内容要求：
${input.baseRequirements}

返回以下 JSON：
{
  "setStrategy": "整组辅助图的视觉与叙事策略",
  "globalGenerationRules": ["整组图片统一规则"],
  "images": [
    {
      "order": 1,
      "role": "风景补充图/氛围画面/装备或抵达感画面/必要信息卡等",
      "visualBasis": "本图依据的笔记内容，以及为何不构成事实证据",
      "renderMode": "visual 或 info_card",
      "generationPrompt": "可直接用于 generate-image 的完整中文 Prompt",
      "negativePrompt": "本图禁止生成的内容和禁止造成的误导",
      "textBlocks": [{ "text": "最终成品必须出现的准确文字", "position": "位置", "style": "字体、颜色与版式" }],
      "textEditPrompt": "基于生成底图调用 edit-image 添加全部准确文字的完整 Prompt；无文字时留空",
      "bodySentence": "与本图对应的正文句；不需要则留空",
      "reviewNotes": "出图后必须人工核验的事项"
    }
  ],
  "globalReviewNotes": ["整组图片的真实性、合规和内容核验项"]
}`
    });

    if (!response.ok) return { usedLlm: false, error: response.error };
    const plan = parseAiAuxiliaryImagePlan(response.text, input.imageCount);
    if (!plan) {
      return { usedLlm: false, error: "AI 返回的逐图辅助图结果不完整或无法解析，请重试。" };
    }
    return { usedLlm: true, data: plan, model: response.model || model };
  } catch (error) {
    return { usedLlm: false, error: error instanceof Error ? error.message : "AI 调用失败。" };
  } finally {
    clearTimeout(timeout);
  }
}
