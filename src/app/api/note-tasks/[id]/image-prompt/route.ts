import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { accountVisualMode, buildCompactImageStyleBrief, buildImagePrompt, buildImageStyleStudy, isWeddingAccount } from "@/lib/imagePrompts";
import { styleBriefFromStudy } from "@/lib/imageStyleStudy";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";
import {
  generateAiAuxiliaryImagePlanWithLlm,
  generateImageAutoSelectionWithLlm,
  generateImageRefinementPlanWithLlm,
  generateMixedImagePlanWithLlm,
  imageRefinementAssetKey,
  type AiAuxiliaryImagePlan,
  type ImageAutoSelectionPlan,
  type ImageRefinementAsset,
  type ImageRefinementPlan,
  type MixedImagePlan
} from "@/lib/imageRefinementLlm";

function nonEmptyLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeImageCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 9)) : 5;
}

function normalizeOptionalImageCount(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 9)) : 0;
}

function remotePath(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.pathname : "";
  } catch {
    return "";
  }
}

function normalizeSelectedAssets(value: unknown, fallbackUrls: string[]): ImageRefinementAsset[] {
  const rawAssets = Array.isArray(value) ? value : [];
  const normalized = rawAssets
    .map((raw, index) => {
      const asset = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
      const fileUrl = readText(asset.fileUrl);
      const fallbackPath = remotePath(fileUrl);
      if (!fallbackPath) return null;
      return {
        id: readNumber(asset.id) || index + 1,
        filePath: readText(asset.filePath) || fallbackPath,
        fileUrl,
        fileType: readText(asset.fileType) || "image",
        sourceType: readText(asset.sourceType) || "真实素材",
        location: readText(asset.location),
        shotAt: readText(asset.shotAt),
        tags: readText(asset.tags),
        suitableTypes: readText(asset.suitableTypes),
        riskNotes: readText(asset.riskNotes),
        width: readNumber(asset.width),
        height: readNumber(asset.height)
      } satisfies ImageRefinementAsset;
    })
    .filter((asset): asset is ImageRefinementAsset => Boolean(asset));

  const source = normalized.length
    ? normalized
    : fallbackUrls.map((fileUrl, index) => ({
        id: index + 1,
        filePath: remotePath(fileUrl) || fileUrl,
        fileUrl,
        fileType: "image",
        sourceType: "真实素材",
        location: "",
        shotAt: "",
        tags: "",
        suitableTypes: "",
        riskNotes: "",
        width: 0,
        height: 0
      }));

  const byUrl = new Map<string, ImageRefinementAsset>();
  for (const asset of source) {
    if (!byUrl.has(asset.fileUrl)) byUrl.set(asset.fileUrl, asset);
  }
  return Array.from(byUrl.values());
}

function markdownList(items: string[], emptyText: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${emptyText}`;
}

function photoRefinementStyleBrief(items: string[]) {
  return items.filter((item) => !/信息卡|互动卡|流程图|结构图|要点图|漫画卡|文字框|气泡|文字占位/.test(item));
}

function formatTextBlocks(blocks: Array<{ text: string; position: string; style: string }>) {
  if (!blocks.length) return "- 无；本图不需要文字。";
  return blocks
    .map((block, index) => `${index + 1}. 文字：${block.text}\n   - 位置：${block.position}\n   - 样式：${block.style}`)
    .join("\n");
}

function isImageAsset(asset: ImageRefinementAsset) {
  const type = asset.fileType.toLowerCase();
  return type === "image"
    || type.startsWith("image/")
    || /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(asset.fileUrl);
}

function formatAutoSelectionPlan(plan: ImageAutoSelectionPlan, assets: ImageRefinementAsset[]) {
  const assetsByKey = new Map(assets.map((asset, index) => [imageRefinementAssetKey(asset, index), asset]));
  const lines = plan.images.map((item) => {
    const asset = assetsByKey.get(item.assetKey);
    if (!asset) return "";
    return `${item.order}. ${item.role}
   - 素材 ID：${asset.id}
   - 素材 URL：${asset.fileUrl}
   - 素材标签：${asset.tags || "未标注"}
   - 选择理由：${item.reason}`;
  }).filter(Boolean);

  return `# AI 自动选图结果

## 选图策略

${plan.setStrategy}

## 已选素材与顺序

${lines.join("\n")}`;
}

function formatImageRefinementPlan(plan: ImageRefinementPlan, assets: ImageRefinementAsset[], startOrder = 0) {
  const assetsByKey = new Map(assets.map((asset, index) => [imageRefinementAssetKey(asset, index), asset]));
  const imageSections = plan.images.map((item) => {
    const asset = assetsByKey.get(item.assetKey);
    if (!asset) return "";
    const dimensions = asset.width && asset.height ? `${asset.width}x${asset.height}` : "未记录";
    return `### 图片 ${item.order + startOrder}：${item.role}

- 素材 ID：${asset.id}
- 原图 URL：${asset.fileUrl}
- 素材文件：${asset.filePath}
- 素材标签：${asset.tags || "未标注"}
- 适用内容：${asset.suitableTypes || "未标注"}
- 拍摄地点/时间：${[asset.location, asset.shotAt].filter(Boolean).join(" / ") || "未记录"}
- 原图尺寸：${dimensions}
- 素材信息摘要：${item.recognitionBasis}
- 成品模式：${item.renderMode === "photo_with_text" ? "照片精修并直接排入文字" : "纯照片精修"}

#### 成品文字

${formatTextBlocks(item.textBlocks)}

#### 本图精修 Prompt

${item.editPrompt}

#### 本图负向约束

${item.negativePrompt}

#### 核验要求

${[asset.riskNotes, item.reviewNotes].filter(Boolean).join("；") || "保留原图真实主体、结构和事实信息。"}`;
  }).filter(Boolean);

  return `# 逐图图片精修方案

## 整组策略

${plan.setStrategy}

## 整组编辑规则

${markdownList(plan.globalEditRules, "保持原图真实主体、结构和事实信息，整组视觉风格统一。")}

## 逐图任务

${imageSections.join("\n\n")}

## 整组人工核验

${markdownList(plan.globalReviewNotes, "核对真实画面、图上文字和业务事实后再进入发布流程。")}`;
}

function formatAiAuxiliaryImagePlan(plan: AiAuxiliaryImagePlan, startOrder = 0) {
  const imageSections = plan.images.map((item) => `### 图片 ${item.order + startOrder}：${item.role}

- 画面依据：${item.visualBasis}
- 成品模式：${item.renderMode === "info_card" ? "完整信息卡（必须完成文字编辑）" : "普通辅助图"}
- 正文对应句：${item.bodySentence || "无"}

#### 成品文字

${formatTextBlocks(item.textBlocks)}

#### 本图生成 Prompt

${item.generationPrompt}

#### 本图负向约束

${item.negativePrompt}

${item.textBlocks.length ? `#### 本图文字编辑 Prompt

${item.textEditPrompt}` : ""}

#### 核验要求

${item.reviewNotes}`);

  return `# AI 辅助图逐图生成方案

## 整组策略

${plan.setStrategy}

## 整组生成规则

${markdownList(plan.globalGenerationRules, "整组保持统一风格；需要文字时必须生成包含准确文字的完整成品，不把辅助画面伪装成真实事实证据。")}

## 逐图任务

${imageSections.join("\n\n")}

## 整组人工核验

${markdownList(plan.globalReviewNotes, "确认画面不包含未经核验的事实信息；带文字的图片必须逐字核对后才能作为成品。")}`;
}

function formatMixedImagePlan(
  plan: MixedImagePlan,
  realAssets: ImageRefinementAsset[],
  manualImageCount: number
) {
  const realSection = formatImageRefinementPlan(plan.realPlan, realAssets);
  const aiSection = plan.aiPlan
    ? formatAiAuxiliaryImagePlan(plan.aiPlan, realAssets.length)
    : "无 AI 辅助图。";
  return `# 混合图集逐图方案

## 整组策略

${plan.setStrategy}

## 固定图集顺序

1. 手动指定素材库图片：${manualImageCount} 张${manualImageCount ? "，第 1 张为封面。" : "。"}
2. AI 自动选图：${realAssets.length - manualImageCount} 张${manualImageCount ? "。" : "，第 1 张为封面。"}
3. AI 辅助图：${plan.aiPlan?.images.length || 0} 张，全部排在真实图片之后且不作为封面。

## 真实素材精修要求

${realSection}

## AI 辅助图生成要求

${aiSection}

## 整组规则

${markdownList(plan.globalRules, "保持三段来源顺序不变；真实素材保留事实信息，AI 辅助图只承担补充表达。")}

## 整组人工核验

${markdownList(plan.globalReviewNotes, "确认真实素材未被失真修改，AI 辅助图不冒充真实事实，带文字图片已逐字核对。")}`;
}

function buildOpenclawTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  imageSourceMode: string;
  openclawImagePaths: string;
  selectedAssets?: ImageRefinementAsset[];
  removeWatermarks?: boolean;
  prompt: string;
}) {
  const {
    account,
    noteTask,
    imageSourceMode,
    openclawImagePaths,
    selectedAssets = [],
    removeWatermarks = false,
    prompt
  } = input;
  const taskName = `xhs-image-task-${noteTask.id}`;
  const accountName = shellQuote(account.accountParam);
  const imageSources = nonEmptyLines(openclawImagePaths);
  const isMixed = imageSourceMode === "mixed";
  const sourceList = selectedAssets.length
    ? selectedAssets.map((asset, index) => `${index + 1}. ${asset.fileUrl}${asset.tags ? `\n   - 标签：${asset.tags}` : ""}${asset.suitableTypes ? `\n   - 适用内容：${asset.suitableTypes}` : ""}`).join("\n")
    : imageSources.length
    ? imageSources.map((source, index) => `${index + 1}. ${source}`).join("\n")
    : "未提供；按具体要求确认需要生成的辅助图片。";
  const usesExistingImages = imageSourceMode !== "ai_generate";
  const sourceModeLabel = imageSourceMode === "ai_auto_select"
    ? "AI 自动选图"
    : imageSourceMode === "remote_images"
    ? "多张素材库图片"
    : isMixed
    ? "混合模式"
    : "AI 辅助图";
  const realEditCommand = `uv run python scripts/cli.py edit-image \\
  --prompt "$IMAGE_PROMPT" \\
  --images "$INPUT_IMAGE" \\
  --output-dir "$ACCOUNT_ASSETS_DIR" \\
  --size "1536x2048" \\
  --quality "medium"`;
  const aiGenerateCommand = `uv run python scripts/cli.py generate-image \\
  --prompt "$IMAGE_PROMPT" \\
  --output-dir "$IMAGE_OUTPUT_DIR" \\
  --size "1536x2048"

# 仅当本图存在“成品文字”时，继续执行文字编辑：
uv run python scripts/cli.py edit-image \\
  --prompt "$TEXT_EDIT_PROMPT" \\
  --images "$BASE_IMAGE" \\
  --output-dir "$ACCOUNT_ASSETS_DIR" \\
  --size "1536x2048" \\
  --quality "medium"`;
  const command = isMixed
    ? `# 真实素材精修（手动指定素材和 AI 自动选图均使用此命令）
${realEditCommand}

# AI 辅助图生成
${aiGenerateCommand}`
    : usesExistingImages
    ? realEditCommand
    : aiGenerateCommand;
  const sourceSteps = isMixed
    ? `1. 进入已安装的 xiaohongshu_auto_op skill 根目录。
2. 设置 \`ACCOUNT_NAME=${accountName}\`、\`TASK_DIR="$PWD/.tasks/${taskName}"\`、\`BASE_OUTPUT_DIR="$TASK_DIR/base-images"\`、\`ACCOUNT_ASSETS_DIR="$PWD/assets/$ACCOUNT_NAME"\`，然后创建 \`$TASK_DIR/assets\`、\`$BASE_OUTPUT_DIR\` 和 \`$ACCOUNT_ASSETS_DIR\`。
3. 下载下方“指定真实图片”中的全部 URL 到 \`$TASK_DIR/assets\`，保留原始扩展名并取得本地绝对路径。真实图片必须严格按照“手动 → 自动”的顺序处理，不得增删、替换或重排。
4. 主会话必须先完成建目录、下载和原图校验，再将仅包含图片编辑、AI 辅助图生成和验收的部分委派给后台子会话；禁止把整个任务未经初始化直接交给子会话。
5. 先逐张处理“真实素材精修要求”中的图片：每张设置 \`INPUT_IMAGE\` 与 \`IMAGE_PROMPT\` 后执行 edit-image。只有真实素材需要执行去水印要求。
6. 如“AI 辅助图生成要求”中存在图片，再逐张生成末尾补图。无文字图直接输出到 \`$ACCOUNT_ASSETS_DIR\`；有成品文字的图先输出底图到 \`$BASE_OUTPUT_DIR\`，再用 edit-image 和 \`TEXT_EDIT_PROMPT\` 完成文字排版，最终成品写入 \`$ACCOUNT_ASSETS_DIR\`。
7. 最终按“手动指定素材库图片 → AI 自动选图 → AI 辅助图”的固定顺序，将全部通过验收的成品绝对路径逐行写入 \`$TASK_DIR/image-paths.txt\`。不得让 AI 辅助图排在真实素材之前。
8. 任务完成后，无论图片核验是否通过，都必须在最终回复中将全量图片作为附件或可直接查看的文件提供给用户，不得以压缩包形式提供；如果当前会话无法附加文件，必须逐张明确返回其本地绝对路径和文件名。未通过核验的图片不得写入 \`image-paths.txt\`，但必须保留并说明图片序号、原图 URL 或路径、生成后的 \`local_path\` 与未通过原因。`
    : usesExistingImages
    ? `1. 进入已安装的 xiaohongshu_auto_op skill 根目录。
2. 设置 \`ACCOUNT_NAME=${accountName}\`、\`TASK_DIR="$PWD/.tasks/${taskName}"\`、\`ACCOUNT_ASSETS_DIR="$PWD/assets/$ACCOUNT_NAME"\`，然后创建 \`$TASK_DIR/assets\` 和 \`$ACCOUNT_ASSETS_DIR\`。
3. 下载“指定图片”中的全部 URL 到 \`$TASK_DIR/assets\`，保留原始扩展名，并取得每张图片的本地绝对路径。只允许使用这些指定图片，不得扫描或替换为其他素材。
4. 主会话必须先完成建目录、下载和原图校验，再将仅包含图片编辑与验收的部分委派给后台子会话；禁止把整个任务未经初始化直接交给子会话。
5. 此处原图校验只确认文件完整可读、下载数量正确且本地路径与指定图片顺序一致，不比较素材标签，也不因标签差异中止任务。
6. 后台子会话严格按照下方“逐图任务”的顺序和“本图精修 Prompt”逐张执行。每次把当前图片的本地绝对路径设置为 \`INPUT_IMAGE\`，把该图 Prompt 设置为 \`IMAGE_PROMPT\`，执行一次图片编辑命令，并完成对应成品验收。
7. 任务完成后，无论图片核验是否通过，都必须在最终回复中将全量图片作为附件或可直接查看的文件提供给用户，不得以压缩包形式提供；如果当前会话无法附加文件，必须逐张明确返回其本地绝对路径和文件名，确保用户能够自行查看。如果某张图片核验未通过：不得删除、覆盖或隐瞒该图片；不得把它写入 \`image-paths.txt\`，但必须继续处理其余图片。最终回复还必须单独列出该图片的图片序号、原图路径或 URL、生成后的 \`local_path\`、未通过的具体核验项和原因。`
    : `1. 进入已安装的 xiaohongshu_auto_op skill 根目录。
2. 设置 \`ACCOUNT_NAME=${accountName}\`、\`TASK_DIR="$PWD/.tasks/${taskName}"\`、\`BASE_OUTPUT_DIR="$TASK_DIR/base-images"\`、\`ACCOUNT_ASSETS_DIR="$PWD/assets/$ACCOUNT_NAME"\`，然后创建这些目录。
3. 严格按照下方“逐图任务”的顺序执行；每张图的“本图生成 Prompt”和“本图文字编辑 Prompt”已经由 AI 生成，不得擅自改写、合并或省略。
4. 如果本图“成品文字”为“无”，设置 \`IMAGE_OUTPUT_DIR="$ACCOUNT_ASSETS_DIR"\`，将“本图负向约束”追加到 \`IMAGE_PROMPT\` 后执行一次 generate-image；其返回 JSON 中的 \`local_path\` 就是最终成品。
5. 如果本图存在“成品文字”，设置 \`IMAGE_OUTPUT_DIR="$BASE_OUTPUT_DIR"\`，先执行 generate-image 取得返回 JSON 中的 \`local_path\`，并将该路径设置为 \`BASE_IMAGE\`。该底图只是中间产物，不得写入 \`image-paths.txt\`。
6. 对存在“成品文字”的图片，把完整“本图文字编辑 Prompt”设置为 \`TEXT_EDIT_PROMPT\`，以 \`BASE_IMAGE\` 为输入执行 edit-image。必须把“成品文字”中的所有文字逐字写入对应位置；edit-image 返回的 \`local_path\` 才是最终成品。
7. 对文字成品逐字核对，不得存在空白气泡、空白文字框、占位词、错字、漏字或额外文字。如有错误，只重试本图的 edit-image 文字编辑步骤，最多两次，不要重新生成底图；仍失败则报告失败，不得把底图当成品。
8. 任务完成后，无论图片核验是否通过，都必须在最终回复中将全量图片作为附件或可直接查看的文件提供给用户，不得以压缩包形式提供；如果当前会话无法附加文件，必须逐张明确返回其本地绝对路径和文件名，确保用户能够自行查看。如果某张图片核验未通过：不得删除、覆盖或隐瞒该图片；不得把它写入 \`image-paths.txt\`，但必须继续处理其余图片。最终回复还必须单独列出该图片的图片序号、原图路径或 URL、生成后的 \`local_path\`、未通过的具体核验项和原因。`;
  const commandVariables = isMixed
    ? "真实素材使用 `INPUT_IMAGE` 与 `IMAGE_PROMPT` 执行 edit-image；AI 辅助图使用 `IMAGE_PROMPT` 执行 generate-image。存在成品文字时，`BASE_IMAGE` 使用 generate-image 返回的 `local_path`，`TEXT_EDIT_PROMPT` 必须写入所有准确文字。"
    : usesExistingImages
    ? "`IMAGE_PROMPT` 必须替换为当前单张图片对应的完整精修提示词；`INPUT_IMAGE` 必须替换为 Agent 下载后的本地绝对路径。"
    : "`IMAGE_PROMPT` 必须替换为当前图片对应的完整“本图生成 Prompt”并追加负向约束；`IMAGE_OUTPUT_DIR` 根据是否存在成品文字选择最终素材目录或底图目录。存在成品文字时，`BASE_IMAGE` 使用 generate-image 返回的 `local_path`，`TEXT_EDIT_PROMPT` 使用完整“本图文字编辑 Prompt”。";
  const watermarkSection = usesExistingImages && removeWatermarks
    ? `## 去除叠加水印和账号角标

用户已经明确开启去水印。执行每一张真实图片的 \`edit-image\` 时，只去除明显后期叠加在画面上的平台水印、账号角标或来源标记，并根据邻近画面自然补全背景。

不得去除、遮盖、重绘或作为验收失败项处理原始物体本身固有的文字、Logo、刻印、包装信息、餐具标识、衣物图案、店内招牌、菜单文字或其他真实场景元素。只有能明确判断为悬浮叠加、与物体透视和材质无关的平台或账号来源标记时，才执行去除。

验收只检查平台水印、账号角标和悬浮来源标记是否已去除且补图自然。物体本身固有的文字、Logo、刻印和真实场景文字允许保留，不需要处理，也不得因此重试或判定失败。

`
    : "";

  return {
    title: `${noteTask.topicTitle} Agent 图片执行任务`,
    command,
    content: `# Agent 图片执行任务

请使用 **xiaohongshu_auto_op** 的 **xhs-creative** skill 完成本篇配图，不要使用其他图片工具。

## 任务上下文
- 业务账号：${account.name}
- 账号参数：${account.accountParam}
- 单篇任务：${noteTask.topicTitle}
- 图片来源模式：${sourceModeLabel}

注意：\`${account.accountParam}\` 是 xiaohongshu_auto_op 的账号键。\`edit-image\` / \`generate-image\` 不依赖小红书浏览器登录账号，因此不要把它作为 \`--account\` 传给 CLI；但所有成品图必须保存到该账号的 \`assets/${account.accountParam}/\` 素材目录。

${watermarkSection}## ${isMixed ? "指定真实图片（手动指定素材库图片 → AI 自动选图）" : "指定图片"}
${sourceList}

## 执行步骤
${sourceSteps}

## 必须使用的 CLI 命令

${commandVariables}

\`\`\`bash
${command}
\`\`\`

## 尺寸处理原则

CLI 必须保留 \`--size "1536x2048"\` 作为图片生成或编辑的请求参数，但执行完成后不要核验成品文件的实际像素尺寸。即使图片服务返回的实际尺寸与请求值不同，也不得因此重试、判定失败、丢弃图片或将其排除在 \`image-paths.txt\` 之外。

完成后必须确认每张通过验收的成品图都位于 \`$ACCOUNT_ASSETS_DIR\`，再按图文发布顺序，把这些成品图的本地绝对路径逐行写入 \`$TASK_DIR/image-paths.txt\`。清单中不得写入任务临时目录或其他账号目录中的图片。

完成后必须返回通过验收图片的图片序号、\`local_path\` 和实际使用的 Prompt。使用已有图片时还要返回对应原图。不要发布小红书内容。

## 具体要求

${prompt}`
  };
}

function commandCopy(account: { accountType: string; name: string; personaBase: string; contentDirections: string; materialCondition: string; businessGoals: string; targetUsers: string }) {
  if (isWeddingAccount(account)) {
      return {
        source: "选择婚礼素材库图片",
        image2: "让 Agent 直接读取婚礼素材库图片，根据逐张 Prompt 做照片级精修；仅在明确要求时直接加入准确短字。",
        draftCategory: "调用已有婚礼图片做细节拆解",
        draft: "读取婚礼素材库图片，先判断每张图片可写成什么小红书选题，再围绕一个高收藏细节规划图集和正文。",
        safety: "命令只作建议；确保婚礼案例、新人/宾客隐私、场地、价格、档期和套餐信息经过人工核验。"
    };
  }
  const accountType = account.accountType;
  const mode = accountVisualMode(accountType);
  const copies = {
    culture_tourism: {
      source: "选择目的地/活动素材库图片",
      image2: "让 Agent 直接读取文旅素材库图片，根据逐张 Prompt 做照片级精修；仅在明确要求时直接加入准确短字。",
      draftCategory: "调用已有文旅素材改图",
      draft: "读取素材库图片，优先识别真实目的地图、活动现场图、导览图和票务截图，再规划图生图、信息卡和图集顺序。",
      safety: "命令只作建议；确保这些素材真实存在、来源清楚，开放时间、票价和活动日期需要人工核验。"
    },
    heritage: {
      source: "选择民俗/非遗素材库图片",
      image2: "让 Agent 直接读取民俗非遗素材库图片，根据逐张 Prompt 做照片级精修；仅在明确要求时直接加入准确短字。",
      draftCategory: "调用已有民俗/非遗素材改图",
      draft: "读取素材库图片，优先识别真实工艺、作品、活动现场和人物图，再规划图生图、信息卡和图集顺序。",
      safety: "命令只作建议；确保人物隐私、作品来源、文化禁忌和表达边界经过人工核验。"
    },
    stay: {
      source: "选择房型/空间素材库图片",
      image2: "让 Agent 直接读取住宿素材库图片，根据逐张 Prompt 做照片级精修；仅在明确要求时直接加入准确短字。",
      draftCategory: "调用已有住宿素材改图",
      draft: "读取素材库图片，优先识别真实房型、窗景、公共区、周边体验和价格政策截图，再规划图集顺序。",
      safety: "命令只作建议；确保房型、景观、价格、房态和政策都需要人工核验。"
    },
    food: {
      source: "选择餐厅素材库图片",
      image2: "让 Agent 直接读取餐厅素材库图片，优先按文件名识别菜品和环境，根据逐张 Prompt 做照片级精修。",
      draftCategory: "调用已有餐厅图片改图",
      draft: "读取素材库图片，要求链接文件名尽量是菜品名、环境名或交通节点名，再按“前几张菜品、后面环境、最后交通漫画卡”的惯例规划图集。",
      safety: "命令只作建议；确保图片真实存在、来源清楚，菜品、活动、价格和交通信息需要人工核验。"
    },
    outdoor: {
      source: "选择路线/现场素材库图片",
      image2: "让 Agent 直接读取路线/现场素材库图片，根据逐张 Prompt 做照片级精修并保持路线事实不变。",
      draftCategory: "调用已有路线/现场图片改图",
      draft: "读取素材库图片，优先识别真实现场图、路线图和轨迹截图，再规划图生图、轻处理和图集顺序。",
      safety: "命令只作建议；确保这些图片真实存在、来源清楚，路线信息需要人工核验。"
    },
    museum: {
      source: "选择展品/展厅素材库图片",
      image2: "让 Agent 直接读取展馆研学素材库图片，根据逐张 Prompt 做照片级精修；仅在明确要求时直接加入准确短字。",
      draftCategory: "调用已有展馆/研学素材改图",
      draft: "读取素材库图片，优先识别真实展品图、展厅图、导览图和票务截图，再规划图集顺序。",
      safety: "命令只作建议；确保展期、票务、拍摄规则和展品版权需要人工核验。"
    },
    product: {
      source: "选择产品/包装素材库图片",
      image2: "让 Agent 直接读取产品素材库图片，根据逐张 Prompt 做照片级精修并保持产品事实不变。",
      draftCategory: "调用已有产品/文创素材改图",
      draft: "读取素材库图片，优先识别真实产品、包装、产地、原料和规格价格图，再规划图集顺序。",
      safety: "命令只作建议；确保产地、规格、价格、库存和资质需要人工核验。"
    },
    service: {
      source: "选择服务/空间素材库图片",
      image2: "让 Agent 直接读取本地服务素材库图片，根据逐张 Prompt 做照片级精修；仅在明确要求时直接加入准确短字。",
      draftCategory: "调用已有本地服务素材改图",
      draft: "读取素材库图片，优先识别真实空间、服务流程、设备资质和案例，再规划图集顺序。",
      safety: "命令只作建议；确保案例真实性、隐私、价格、资质和效果表达需要人工核验。"
    }
  };
  return copies[mode];
}

async function buildImagePromptResult(body: any, requestId: string) {
  const startedAt = Date.now();
  const openclawImagePaths = String(body.openclawImagePaths || "");
  const imageSourceMode = ["ai_generate", "remote_images", "ai_auto_select", "mixed"].includes(String(body.imageSourceMode))
    ? String(body.imageSourceMode)
    : "remote_images";
  const noteContent = String(body.noteContent || "");
  const singleGoal = String(body.singleGoal || "");
  const imageCount = String(body.imageCount || "");
  const normalizedImageCount = normalizeImageCount(imageCount);
  const isMixed = imageSourceMode === "mixed";
  const autoImageCount = isMixed ? normalizeOptionalImageCount(body.autoImageCount) : 0;
  const aiImageCount = isMixed ? normalizeOptionalImageCount(body.aiImageCount) : 0;
  const realImageRefinementRequirement = String(body.realImageRefinementRequirement || "").trim();
  const aiAssistantRequirement = String(body.aiAssistantRequirement || "").trim();
  const knowledgeSnapshotId = String(body.knowledgeSnapshotId || "").trim();
  const knowledgeSourceKeys = Array.isArray(body.knowledgeSourceKeys)
    ? body.knowledgeSourceKeys.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
  const removeWatermarks =
    imageSourceMode !== "ai_generate"
    && (
      body.removeWatermarks === true
      || String(body.removeWatermarks) === "true"
    );
  const noteTask = body.noteTask;
  const account = body.account;
  if (!noteTask || !account) throw new Error("缺少任务上下文");
  if (!String(account.accountParam || "").trim()) {
    throw new Error("当前账号未配置智能体执行账号参数，无法确定账号素材目录。");
  }
  const remoteImageUrls = nonEmptyLines(openclawImagePaths);
  const acceptsManualImages = imageSourceMode === "remote_images" || isMixed;
  if (imageSourceMode === "remote_images" && (!remoteImageUrls.length || remoteImageUrls.some((url) => !remotePath(url)))) {
    throw new Error("请选择至少一张具有完整 HTTP(S) URL 的后端素材图片。");
  }
  if (isMixed && remoteImageUrls.some((url) => !remotePath(url))) {
    throw new Error("混合模式中的手动素材必须使用完整 HTTP(S) URL。" );
  }
  let selectedAssets = acceptsManualImages
    ? normalizeSelectedAssets(body.selectedAssets, remoteImageUrls)
    : [];
  if (imageSourceMode === "remote_images" && !selectedAssets.length) {
    throw new Error("未能读取所选素材的图片信息。");
  }
  if (acceptsManualImages && Array.isArray(body.selectedAssets)) {
    const metadataUrls = selectedAssets.map((asset) => asset.fileUrl);
    if (metadataUrls.length !== remoteImageUrls.length || remoteImageUrls.some((url) => !metadataUrls.includes(url))) {
      throw new Error("所选图片 URL 与素材信息不一致，请重新选择图片后再生成。");
    }
  }
  const manualImageCount = selectedAssets.length;
  const candidateAssets = imageSourceMode === "ai_auto_select" || isMixed
    ? normalizeSelectedAssets(body.candidateAssets ?? account.assets, []).filter(isImageAsset)
    : [];
  if (imageSourceMode === "ai_auto_select" && candidateAssets.length < normalizedImageCount) {
    throw new Error(`当前账号只有 ${candidateAssets.length} 张具有有效 URL 的素材库图片，无法自动选择 ${normalizedImageCount} 张。请补充素材或减少图片数量。`);
  }
  const autoCandidates = isMixed
    ? candidateAssets.filter((asset) => !selectedAssets.some((manualAsset) => manualAsset.fileUrl === asset.fileUrl))
    : candidateAssets;
  if (isMixed) {
    const enabledSourceCount = [manualImageCount > 0, autoImageCount > 0, aiImageCount > 0].filter(Boolean).length;
    const totalImageCount = manualImageCount + autoImageCount + aiImageCount;
    if (enabledSourceCount < 2) {
      throw new Error("混合模式至少需要启用手动素材、AI 自动选图、AI 辅助图中的两类来源。");
    }
    if (totalImageCount > 9) {
      throw new Error(`混合模式共 ${totalImageCount} 张图片，超过单篇最多 9 张的限制。`);
    }
    if (autoImageCount > 0 && autoCandidates.length < autoImageCount) {
      throw new Error(`排除手动素材后，素材库只有 ${autoCandidates.length} 张可供自动选择，无法选择 ${autoImageCount} 张。`);
    }
  }

  const latestReference = account.referenceResearches?.[0];
  const latestImageStudy = account.imageStyleStudies?.[0];
  const imageStyleStudy = latestImageStudy?.summaryMarkdown || buildImageStyleStudy(account, latestReference);
  const styleBrief = styleBriefFromStudy(latestImageStudy);
  const fallbackBrief = buildCompactImageStyleBrief(account, latestReference);
  const resolvedStyleBrief = styleBrief.length ? styleBrief : fallbackBrief;
  const expertRules = formatExpertRulesForPrompt(account.expertRules || [], ["cover", "image_plan", "risk"]);
  const accountContext = {
    id: account.id,
    name: account.name,
    accountParam: account.accountParam,
    accountType: account.accountType,
    personaBase: account.personaBase,
    targetUsers: account.targetUsers,
    painPoints: account.painPoints,
    contentDirections: account.contentDirections,
    businessGoals: account.businessGoals,
    materialCondition: account.materialCondition,
    taboos: account.taboos
  };
  const noteTaskContext = {
    id: noteTask.id,
    topicTitle: noteTask.topicTitle,
    targetUser: noteTask.targetUser,
    painPoint: noteTask.painPoint,
    coreView: noteTask.coreView,
    bodyStructure: "",
    requiredImages: noteTask.requiredMaterials,
    coverCopyDirection: noteTask.coverCopyDirection,
    expectedGoal: noteTask.expectedGoal
  };
  let autoSelectionPlan: ImageAutoSelectionPlan | null = null;
  let selectionModel = "";

  if (imageSourceMode === "ai_auto_select" || (isMixed && autoImageCount > 0)) {
    const requestedAutoImageCount = isMixed ? autoImageCount : normalizedImageCount;
    const selectionCandidates = isMixed ? autoCandidates : candidateAssets;
    console.info("[image-auto-selection] calling backend AI", {
      requestId,
      noteTaskId: noteTask.id,
      accountId: account.id,
      candidateCount: selectionCandidates.length,
      imageCount: requestedAutoImageCount
    });
    const selectionResult = await generateImageAutoSelectionWithLlm({
      account: accountContext,
      noteTask: noteTaskContext,
      noteContent,
      singleGoal,
      styleBrief: resolvedStyleBrief,
      expertRules,
      imageCount: requestedAutoImageCount,
      assets: selectionCandidates,
      knowledgeSnapshotId,
      knowledgeSourceKeys
    });
    if (!selectionResult.usedLlm) {
      console.error("[image-auto-selection] backend AI failed", {
        requestId,
        noteTaskId: noteTask.id,
        candidateCount: selectionCandidates.length,
        imageCount: requestedAutoImageCount,
        elapsedMs: Date.now() - startedAt,
        error: selectionResult.error
      });
      throw new Error(`AI 未能完成自动选图：${selectionResult.error}`);
    }

    const assetsByKey = new Map(selectionCandidates.map((asset, index) => [imageRefinementAssetKey(asset, index), asset]));
    const autoSelectedAssets = selectionResult.data.images
      .map((item) => assetsByKey.get(item.assetKey))
      .filter((asset): asset is ImageRefinementAsset => Boolean(asset));
    if (autoSelectedAssets.length !== requestedAutoImageCount) {
      throw new Error("AI 自动选图结果包含无效素材，请重试。");
    }
    selectedAssets = isMixed ? [...selectedAssets, ...autoSelectedAssets] : autoSelectedAssets;
    autoSelectionPlan = selectionResult.data;
    selectionModel = selectionResult.model;
    console.info("[image-auto-selection] backend AI completed", {
      requestId,
      noteTaskId: noteTask.id,
      candidateCount: selectionCandidates.length,
      selectedCount: autoSelectedAssets.length,
      selectedAssetIds: autoSelectedAssets.map((asset) => asset.id),
      model: selectionModel,
      elapsedMs: Date.now() - startedAt
    });
  }

  const canonicalImagePaths = selectedAssets.length
    ? selectedAssets.map((asset) => asset.fileUrl).join("\n")
    : openclawImagePaths;
  const content = buildImagePrompt({
    account,
    noteTask,
    styleBrief: resolvedStyleBrief,
    openclawImagePaths: canonicalImagePaths,
    imageSourceMode,
    noteContent,
    singleGoal,
    imageCount: String(isMixed ? manualImageCount + autoImageCount + aiImageCount : normalizedImageCount),
    autoImageCount: String(autoImageCount),
    aiImageCount: String(aiImageCount),
    realImageRefinementRequirement,
    aiAssistantRequirement,
    expertRules
  });
  let taskRequirements = content;
  let aiModel = "";

  if (isMixed) {
    console.info("[mixed-image-planning] calling backend AI", {
      requestId,
      noteTaskId: noteTask.id,
      accountId: account.id,
      manualImageCount,
      autoImageCount,
      aiImageCount
    });
    const mixedResult = await generateMixedImagePlanWithLlm({
      account: accountContext,
      noteTask: noteTaskContext,
      noteContent,
      realImageRefinementRequirement,
      aiAssistantRequirement,
      styleBrief: resolvedStyleBrief,
      expertRules,
      realAssets: selectedAssets,
      manualImageCount,
      autoImageCount,
      aiImageCount,
      baseRequirements: content,
      removeWatermarks,
      knowledgeSnapshotId,
      knowledgeSourceKeys
    });
    if (!mixedResult.usedLlm) {
      throw new Error(`AI 未能生成混合图集方案：${mixedResult.error}`);
    }
    aiModel = mixedResult.model;
    taskRequirements = `${autoSelectionPlan ? `${formatAutoSelectionPlan(autoSelectionPlan, autoCandidates)}\n\n` : ""}${formatMixedImagePlan(mixedResult.data, selectedAssets, manualImageCount)}`;
    console.info("[mixed-image-planning] backend AI completed", {
      requestId,
      noteTaskId: noteTask.id,
      model: aiModel,
      elapsedMs: Date.now() - startedAt
    });
  } else if (imageSourceMode === "remote_images" || imageSourceMode === "ai_auto_select") {
    console.info("[image-refinement] calling backend AI", {
      requestId,
      noteTaskId: noteTask.id,
      accountId: account.id,
      assetCount: selectedAssets.length
    });
    const refinementResult = await generateImageRefinementPlanWithLlm({
      account: accountContext,
      noteTask: noteTaskContext,
      noteContent,
      singleGoal,
      styleBrief: photoRefinementStyleBrief(resolvedStyleBrief),
      expertRules,
      assets: selectedAssets,
      baseRequirements: content,
      selectionMode: imageSourceMode === "ai_auto_select" ? "ai_auto" : "manual",
      removeWatermarks,
      knowledgeSnapshotId,
      knowledgeSourceKeys
    });

    if (!refinementResult.usedLlm) {
      console.error("[image-refinement] backend AI failed", {
        requestId,
        noteTaskId: noteTask.id,
        assetCount: selectedAssets.length,
        elapsedMs: Date.now() - startedAt,
        error: refinementResult.error
      });
      throw new Error(`AI 未能生成${imageSourceMode === "ai_auto_select" ? "自动选图后的" : ""}逐图图片精修任务：${refinementResult.error}`);
    }

    aiModel = refinementResult.model;
    const refinementPlan = formatImageRefinementPlan(refinementResult.data, selectedAssets);
    taskRequirements = autoSelectionPlan
      ? `${formatAutoSelectionPlan(autoSelectionPlan, candidateAssets)}\n\n${refinementPlan}`
      : refinementPlan;
    console.info("[image-refinement] backend AI completed", {
      requestId,
      noteTaskId: noteTask.id,
      assetCount: selectedAssets.length,
      model: aiModel,
      elapsedMs: Date.now() - startedAt
    });
  } else {
    console.info("[image-generation-planning] calling backend AI", {
      requestId,
      noteTaskId: noteTask.id,
      accountId: account.id,
      imageCount: normalizedImageCount
    });
    const generationResult = await generateAiAuxiliaryImagePlanWithLlm({
      account: accountContext,
      noteTask: noteTaskContext,
      noteContent,
      singleGoal,
      styleBrief: resolvedStyleBrief,
      expertRules,
      imageCount: normalizedImageCount,
      baseRequirements: content,
      knowledgeSnapshotId,
      knowledgeSourceKeys
    });

    if (!generationResult.usedLlm) {
      console.error("[image-generation-planning] backend AI failed", {
        requestId,
        noteTaskId: noteTask.id,
        imageCount: normalizedImageCount,
        elapsedMs: Date.now() - startedAt,
        error: generationResult.error
      });
      throw new Error(`AI 未能生成辅助图逐图任务：${generationResult.error}`);
    }

    aiModel = generationResult.model;
    taskRequirements = formatAiAuxiliaryImagePlan(generationResult.data);
    console.info("[image-generation-planning] backend AI completed", {
      requestId,
      noteTaskId: noteTask.id,
      imageCount: normalizedImageCount,
      model: aiModel,
      elapsedMs: Date.now() - startedAt
    });
  }

  const copy = commandCopy(account);
  const openclawTask = buildOpenclawTask({
    account,
    noteTask,
    imageSourceMode,
    openclawImagePaths: canonicalImagePaths,
    selectedAssets,
    removeWatermarks,
    prompt: taskRequirements
  });
  const category = imageSourceMode === "ai_generate"
    ? "生成 AI 辅助图"
    : imageSourceMode === "ai_auto_select"
    ? "AI 自动选图并生成单篇配图"
    : isMixed
    ? "生成混合图集方案"
    : "用素材库图片生成单篇配图";
  const commands = [
    {
      category,
      command: openclawTask.command,
      description: "由 Agent 在 xiaohongshu_auto_op skill 目录中准备本地图片，并按单张 Prompt 逐次执行真实 CLI。",
      safetyNote: imageSourceMode === "ai_generate"
        ? "AI 辅助图不得伪装成真实案例、真实现场或真实客户反馈。"
        : isMixed
        ? "真实素材必须保留可核验事实；AI 辅助图不得伪装成真实现场、真实案例或真实客户反馈。"
        : copy.safety
    }
  ];

  return {
    openclawTask: {
      title: openclawTask.title,
      content: openclawTask.content
    },
    imagePrompt: {
      title: `${noteTask.topicTitle} 图片要求`,
      content: taskRequirements,
      path: ""
    },
    referenceStyle: imageStyleStudy,
    ai: {
      used: true,
      model: aiModel,
      selectionModel: selectionModel || undefined,
    calls: imageSourceMode === "ai_auto_select" || (isMixed && autoImageCount > 0) ? 2 : 1,
      requestId
    },
    commands
  };
}

export async function POST(request: Request, _context: { params: { id: string } }) {
  const requestId = request.headers.get("x-request-id") || `image-refinement-${Date.now()}`;
  const body = await request.json().catch(() => ({}));
  if (!body.noteTask || !body.account) {
    return NextResponse.json({ error: "缺少任务上下文" }, { status: 400 });
  }
  if (body.noteTask.type === "video_text") {
    return NextResponse.json({ error: "视频笔记不能生成图片方案，请前往视频方案。" }, { status: 400 });
  }

  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildImagePromptResult(body, requestId)));
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status, requestId });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });

  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildImagePromptResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error || "任务执行失败" });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
