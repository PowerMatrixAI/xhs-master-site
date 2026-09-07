import { completeWithBackendAi } from "@/lib/backendAiServerClient";

export type VideoSourceAsset = {
  id: number;
  filePath: string;
  fileUrl: string;
  fileType: string;
  tags?: string;
  suitableTypes?: string;
};

export type VideoStorySourceType = "trend" | "idea" | "template";

export type VideoStoryDraft = {
  title: string;
  summary: string;
  emotionalArc: string;
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
    knowledgeSourceKeys: string[];
  };
  shots: Array<{
    order: number;
    beat: string;
    role: string;
    description: string;
    suggestedMaterial: string;
  }>;
};

type VideoShot = {
  order: number;
  assetUrl: string;
  role: string;
  editPrompt: string;
  videoPrompt: string;
};

type StoryVideoShot = {
  order: number;
  role: string;
  description: string;
  frameSource: "asset" | "generate";
  assetUrl: string;
  framePrompt: string;
  mainVideoPrompt: string;
  endingTransitionPrompt: string;
  videoPrompt: string;
};

export type StoryVideoFramePlan = Array<{
  order: number;
  role: string;
  description: string;
  frameSource: "asset" | "generate";
  assetUrl: string;
  framePrompt: string;
}>;

export type StoryVideoMotionPlan = Array<{
  order: number;
  mainVideoPrompt: string;
  endingTransitionPrompt: string;
}>;

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function compactStoryContext(account: Record<string, unknown>, noteTask: Record<string, unknown>) {
  return {
    account: {
      name: account.name,
      accountParam: account.accountParam,
      accountType: account.accountType,
      city: account.city,
      personaBase: account.personaBase,
      targetUsers: account.targetUsers,
      contentDirections: account.contentDirections,
      businessGoals: account.businessGoals,
      materialCondition: account.materialCondition,
      taboos: account.taboos,
      strategy: typeof account.strategy === "object" && account.strategy
        ? (account.strategy as { markdown?: unknown }).markdown || ""
        : ""
    },
    noteTask: {
      id: noteTask.id,
      topicTitle: noteTask.topicTitle,
      contentType: noteTask.contentType,
      contentGoal: noteTask.contentGoal,
      targetUser: noteTask.targetUser,
      painPoint: noteTask.painPoint,
      coreView: noteTask.coreView,
      requiredMaterials: noteTask.requiredMaterials,
      recommendedAssets: noteTask.recommendedAssets,
      coverCopyDirection: noteTask.coverCopyDirection,
      expectedGoal: noteTask.expectedGoal
    }
  };
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseShots(value: unknown, assets: VideoSourceAsset[]): VideoShot[] | null {
  if (!Array.isArray(value) || value.length !== assets.length) return null;
  const byUrl = new Map(assets.map((asset) => [asset.fileUrl, asset]));
  const shots = value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const assetUrl = String(item.assetUrl || "").trim();
    const editPrompt = String(item.editPrompt || "").trim();
    const videoPrompt = String(item.videoPrompt || "").trim();
    if (!byUrl.has(assetUrl) || !editPrompt || !videoPrompt) return null;
    return {
      order: index + 1,
      assetUrl,
      role: String(item.role || `镜头 ${index + 1}`).trim(),
      editPrompt,
      videoPrompt
    };
  });
  if (shots.some((shot) => !shot)) return null;
  const urls = shots.map((shot) => shot!.assetUrl);
  if (new Set(urls).size !== assets.length || assets.some((asset) => !urls.includes(asset.fileUrl))) return null;
  return shots as VideoShot[];
}

function parseStoryDraft(value: unknown, minimumShotCount: number): VideoStoryDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const title = String(item.title || "").trim();
  const summary = String(item.summary || "").trim();
  const emotionalArc = String(item.emotionalArc || "").trim();
  const noteTaskRaw = item.noteTask;
  if (!title || !summary || !emotionalArc || !noteTaskRaw || typeof noteTaskRaw !== "object" || Array.isArray(noteTaskRaw) || !Array.isArray(item.shots) || item.shots.length < minimumShotCount || item.shots.length > 6) return null;
  const noteTaskItem = noteTaskRaw as Record<string, unknown>;
  const requiredTaskField = (field: string) => String(noteTaskItem[field] || "").trim();
  const noteTask = {
    topicTitle: requiredTaskField("topicTitle"),
    contentType: requiredTaskField("contentType"),
    contentGoal: requiredTaskField("contentGoal"),
    targetUser: requiredTaskField("targetUser"),
    painPoint: requiredTaskField("painPoint"),
    coreView: requiredTaskField("coreView"),
    requiredMaterials: requiredTaskField("requiredMaterials"),
    recommendedAssets: requiredTaskField("recommendedAssets"),
    coverCopyDirection: requiredTaskField("coverCopyDirection"),
    commentHook: requiredTaskField("commentHook"),
    expectedGoal: requiredTaskField("expectedGoal"),
    writingStyleName: requiredTaskField("writingStyleName"),
    // 故事生成阶段不接收 K1-Kn 片段清单，不能让模型猜测知识库来源 key。
    knowledgeSourceKeys: []
  };
  if (Object.entries(noteTask).some(([key, field]) => key !== "knowledgeSourceKeys" && !field)) return null;
  const shots = item.shots.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const shot = raw as Record<string, unknown>;
    const beat = String(shot.beat || "").trim();
    const role = String(shot.role || "").trim();
    const description = String(shot.description || "").trim();
    const suggestedMaterial = String(shot.suggestedMaterial || "").trim();
    if (!beat || !role || !description || !suggestedMaterial) return null;
    return { order: index + 1, beat, role, description, suggestedMaterial };
  });
  if (shots.some((shot) => !shot)) return null;
  return { title, summary, emotionalArc, noteTask, shots: shots as VideoStoryDraft["shots"] };
}

function parseStoryVideoFramePlan(value: unknown, assets: VideoSourceAsset[], manualAssets: VideoSourceAsset[], expectedShotCount: number): StoryVideoFramePlan | null {
  if (!Array.isArray(value) || value.length !== expectedShotCount || value.length < 3 || value.length > 6) return null;
  const validUrls = new Set(assets.map((asset) => asset.fileUrl));
  const requiredUrls = new Set(manualAssets.map((asset) => asset.fileUrl));
  const usedAssetUrls = new Set<string>();
  const shots = value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const frameSource = item.frameSource === "asset" ? "asset" : "generate";
    const assetUrl = String(item.assetUrl || "").trim();
    const role = String(item.role || "").trim();
    const description = String(item.description || "").trim();
    const framePrompt = String(item.framePrompt || "").trim();
    if (!role || !description || !framePrompt) return null;
    if (frameSource === "asset") {
      if (!validUrls.has(assetUrl) || usedAssetUrls.has(assetUrl)) return null;
      usedAssetUrls.add(assetUrl);
    } else if (assetUrl) {
      return null;
    }
    return { order: index + 1, role, description, frameSource, assetUrl, framePrompt };
  });
  if (shots.some((shot) => !shot)) return null;
  if ([...requiredUrls].some((url) => !usedAssetUrls.has(url))) return null;
  return shots as StoryVideoFramePlan;
}

function parseStoryVideoMotionPlan(value: unknown, framePlan: StoryVideoFramePlan): StoryVideoMotionPlan | null {
  if (!Array.isArray(value) || value.length !== framePlan.length) return null;
  const motions = value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const order = Number(item.order);
    const mainVideoPrompt = String(item.mainVideoPrompt || "").trim();
    const endingTransitionPrompt = String(item.endingTransitionPrompt || "").trim();
    if (order !== index + 1 || !mainVideoPrompt || !endingTransitionPrompt) return null;
    return { order, mainVideoPrompt, endingTransitionPrompt };
  });
  if (motions.some((motion) => !motion)) return null;
  return motions as StoryVideoMotionPlan;
}

function combineStoryVideoPlans(framePlan: StoryVideoFramePlan, motionPlan: StoryVideoMotionPlan): StoryVideoShot[] {
  return framePlan.map((frame, index) => {
    const motion = motionPlan[index];
    const videoPrompt = `总时长严格为5秒。前约4秒主体内容：${motion.mainVideoPrompt}；最后约1秒片尾转场：${motion.endingTransitionPrompt}`;
    return { ...frame, ...motion, videoPrompt };
  });
}

export async function generateVideoStoryDraft(input: {
  account: Record<string, unknown> & { name: string; accountParam: string };
  noteTask: Record<string, unknown> & { id: number; topicTitle: string };
  sourceType: VideoStorySourceType;
  sourceContent: string;
  extraRequirements?: string;
  manualAssets?: VideoSourceAsset[];
  availableWritingStyles: string[];
  expertRules?: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const manualAssetCount = input.manualAssets?.length || 0;
  const response = await completeWithBackendAi({
    instructions: "你是小红书竖屏短视频故事策划师。把用户选择的灵感、自由创意或故事模板发展成可由多个5秒镜头完成的生活化短故事。只返回JSON，不要输出Markdown。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `为当前账号新建一版待用户确认的故事型视频。

硬性要求：
- 故事必须服务于账号定位、业务场景和可用素材，具有清楚的开头、发展、情绪变化和结尾。
- 输出 ${Math.max(3, manualAssetCount)}-6 个镜头节点；每个节点后续固定生成 5 秒视频。
- 用户手动指定图片时，镜头数必须大于等于手选图片数；每张图都必须安排合理剧情节点，不得遗漏，也不得编造图片元数据之外的具体事实。剩余镜头由后续 AI 自动选图或生成 AI 首帧补全。
- 镜头描述必须能转化为具体画面，不要写运营分析、制作说明或空泛口号。
- suggestedMaterial 只描述需要什么画面，不得声称看过素材库图片。
- 不生成标题正文，不执行视频制作。
- noteTask 是故事的系统落点，不是另一个选题：其中 topicTitle、contentGoal、coreView 和素材要求必须直接来自该故事；writingStyleName 必须从 availableWritingStyles 中选择一项精确名称。

账号与任务：
${JSON.stringify(compactStoryContext(input.account, input.noteTask), null, 2)}

故事来源类型：${input.sourceType}
故事来源内容：${input.sourceContent}

用户希望故事使用的素材库图片：
${input.manualAssets?.length ? JSON.stringify(input.manualAssets.map((asset) => ({
    filePath: asset.filePath,
    fileUrl: asset.fileUrl,
    tags: asset.tags || "",
    suitableTypes: asset.suitableTypes || ""
  })), null, 2) : "用户未手动指定图片；按账号定位和故事来源设计故事。"}

用户补充要求：
${input.extraRequirements || "暂无；围绕本篇任务自然发挥。"}

已沉淀专家规则：
${input.expertRules || "暂无相关规则。"}

可选爆款文风名称：
${input.availableWritingStyles.join("、")}

返回格式：
{"title":"故事标题","summary":"故事摘要","emotionalArc":"情绪主线","noteTask":{"topicTitle":"由故事自然派生的笔记主题","contentType":"故事型视频","contentGoal":"","targetUser":"","painPoint":"","coreView":"","requiredMaterials":"","recommendedAssets":"","coverCopyDirection":"","commentHook":"","expectedGoal":"","writingStyleName":"必须精确匹配可选文风名称"},"shots":[{"order":1,"beat":"剧情节点","role":"镜头职责","description":"具体画面和事件","suggestedMaterial":"建议需要的画面"}]}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能生成视频故事：${response.error}`);
  const parsed = extractJson(response.text);
  const story = parseStoryDraft(parsed, Math.max(3, manualAssetCount));
  if (!story) throw new Error("后端 AI 返回的视频故事 JSON 不完整，请重试。");
  return story;
}

export function buildDirectVideoTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  asset: VideoSourceAsset;
}) {
  const { account, noteTask, asset } = input;
  const taskDir = `$PWD/.tasks/xhs-video-task-${noteTask.id}`;
  return `# Agent 视频准备任务

请在 **xiaohongshu_auto_op** skill 根目录完成本任务。这里只准备视频文件，不发布、不填写小红书表单。

## 任务上下文
- 业务账号：${account.name}
- 账号参数：${account.accountParam}
- 单篇任务：${noteTask.topicTitle}
- 视频模式：直接使用用户指定视频，不做精修、转码或重新生成

## 指定视频
- 文件：${asset.filePath}
- URL：${asset.fileUrl}

## 执行要求
1. 创建任务目录 \`${taskDir}\` 和账号素材目录 \`$PWD/assets/${account.accountParam}/\`。
2. 从上述 URL 下载视频到账号素材目录，保留合理扩展名；下载失败时停止并报告。
3. 确认文件存在且可被本机读取，不修改视频内容。
4. 将该视频的本地绝对路径作为唯一一行写入 \`${taskDir}/video-path.txt\`。
5. 返回视频本地绝对路径和 \`video-path.txt\` 路径。不要发布或保存草稿。`;
}

export async function buildImageToVideoTask(input: {
  account: Record<string, unknown> & { name: string; accountParam: string };
  noteTask: Record<string, unknown> & { id: number; topicTitle: string };
  assets: VideoSourceAsset[];
  expertRules?: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const response = await completeWithBackendAi({
    instructions: "你是小红书竖屏短视频分镜策划师。根据任务信息和用户已经排序的图片文字元数据，为每张图片生成有情绪、有画面感的图片精修提示词和首帧生视频动态提示词。不得声称看过图片；允许为氛围、情绪和叙事补充创作性画面。只返回 JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `为以下任务生成逐图视频方案。图片顺序已经由用户确定，不得增删、替换或重新排序。

要求：
- shots 与 assets 一一对应，assetUrl 原样返回。
- editPrompt 用于 edit-image：统一为适合 9:16 视频首帧的构图、光线、色调和情绪，可适度延展背景、氛围和生活场景。
- videoPrompt 用于 generate-video：描述 5 秒内自然、有感染力的镜头运动、主体微动和情绪变化，可进行创作性场景延展。
- 相邻镜头节奏和色调连贯，最终可按输入顺序拼接。

上下文：
${JSON.stringify({ account: input.account, noteTask: input.noteTask }, null, 2)}

已沉淀专家规则：
${input.expertRules || "暂无相关规则；按当前任务信息生成。"}

素材：
${JSON.stringify(input.assets, null, 2)}

返回：
{"overallDirection":"整片方向","shots":[{"assetUrl":"原 URL","role":"镜头职责","editPrompt":"图片精修 Prompt","videoPrompt":"首帧生视频 Prompt"}]}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能生成视频分镜：${response.error}`);
  const parsed = extractJson(response.text);
  const shots = parseShots(parsed?.shots, input.assets);
  if (!shots) throw new Error("后端 AI 返回的视频分镜 JSON 不完整或素材对应关系无效，请重试。");

  const taskDir = `$PWD/.tasks/xhs-video-task-${input.noteTask.id}`;
  const assetsDir = `$PWD/assets/${input.account.accountParam}`;
  const taskDirLiteral = `.tasks/xhs-video-task-${input.noteTask.id}`;
  const sourceDownloads = shots.map((shot, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `curl --fail --location --retry 3 --connect-timeout 20 --output "$TASK_DIR/source-${number}.jpg" ${shellQuote(shot.assetUrl)}\ntest -s "$TASK_DIR/source-${number}.jpg"`;
  }).join("\n");
  const runShotCalls = shots.map((shot, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `run_shot "${number}" ${shellQuote(shot.editPrompt)} ${shellQuote(shot.videoPrompt)}`;
  }).join("\n");
  const clipArguments = shots.map((_, index) => `"$TASK_DIR/clip-${String(index + 1).padStart(2, "0")}.mp4"`).join(" ");
  const frameArguments = shots.map((_, index) => `"$TASK_DIR/frame-${String(index + 1).padStart(2, "0")}.png"`).join(" ");
  const shotSections = shots.map((shot, index) => `### 镜头 ${shot.order}｜${shot.role}
- 原图 URL：${shot.assetUrl}
- 下载文件：\`$TASK_DIR/source-${String(index + 1).padStart(2, "0")}.jpg\`
- 精修图：\`$TASK_DIR/frame-${String(index + 1).padStart(2, "0")}.png\`
- 视频片段：\`$TASK_DIR/clip-${String(index + 1).padStart(2, "0")}.mp4\`
- 图片精修 Prompt：${shot.editPrompt}
- 视频动态 Prompt：${shot.videoPrompt}`).join("\n\n");

  return `# Agent 图片转视频执行任务

请使用 **xiaohongshu_auto_op** 的 **xhs-creative** skill 完成本任务。不要发布或填写小红书表单。

## 任务上下文
- 业务账号：${input.account.name}
- 账号参数：${input.account.accountParam}
- 单篇任务：${input.noteTask.topicTitle}
- 最终任务目录：\`${taskDir}\`
- 账号素材目录：\`${assetsDir}\`

## 会话分工
主会话必须先完成下方“主会话初始化”中的依赖预检、建目录和全部原图下载，再将下方“后台子会话执行脚本”完整交给后台子会话执行。禁止把整个任务未经初始化直接交给子会话；子会话不得只检查文件后结束，必须以 \`video-path.txt\` 和 \`result.json\` 已成功写入作为完成条件。

## 主会话初始化（必须亲自完成）

在 skill 根目录依次执行。不得委派本段，不得用 \`find -printf\` 或其他目录扫描命令替代指定文件检查。

\`\`\`bash
set -euo pipefail
uv sync
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
uv run python - <<'PY'
import os
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(), override=False)
missing = []
if not os.getenv("KLING_API_KEY"):
    missing.append("KLING_API_KEY")
if not (os.getenv("AISHARING_API_KEY") or os.getenv("OPENAI_OFFICIAL_API_KEY")):
    missing.append("AISHARING_API_KEY 或 OPENAI_OFFICIAL_API_KEY")
if missing:
    raise SystemExit("缺少视频任务依赖配置：" + "、".join(missing))
PY

TASK_DIR="$PWD/${taskDirLiteral}"
ACCOUNT_ASSETS_DIR="$PWD/assets/${input.account.accountParam}"
mkdir -p "$TASK_DIR" "$ACCOUNT_ASSETS_DIR"
${sourceDownloads}
echo "主会话初始化完成：全部 ${shots.length} 张原图已下载。"
\`\`\`

## 后台子会话执行脚本

主会话初始化成功后，将以下脚本原样保存为 \`$TASK_DIR/run-video-worker.sh\`，再执行 \`bash "$TASK_DIR/run-video-worker.sh"\`。该脚本是唯一允许的后处理方式：不得自行改用 \`find -printf\`，不得按目录猜测文件名；每次均从 CLI 的 JSON 结果读取 \`local_path\`。

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="$PWD/${taskDirLiteral}"
ACCOUNT_ASSETS_DIR="$PWD/assets/${input.account.accountParam}"
FINAL_VIDEO="$ACCOUNT_ASSETS_DIR/video-note-${input.noteTask.id}.mp4"

json_local_path() {
  uv run python - "$1" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
if not payload.get("success") or not payload.get("local_path"):
    raise SystemExit("CLI 未返回 success=true 和 local_path")
print(payload["local_path"])
PY
}

run_shot() {
  local number="$1"
  local edit_prompt="$2"
  local video_prompt="$3"
  local source="$TASK_DIR/source-$number.jpg"
  local frame="$TASK_DIR/frame-$number.png"
  local clip="$TASK_DIR/clip-$number.mp4"
  local edit_result="$TASK_DIR/edit-$number.json"
  local video_result="$TASK_DIR/video-$number.json"

  test -s "$source"
  if [ ! -s "$frame" ]; then
    uv run python scripts/cli.py edit-image \\
      --prompt "$edit_prompt" \\
      --images "$source" \\
      --output-dir "$TASK_DIR" \\
      --size "1536x2048" \\
      --quality "medium" > "$edit_result"
    local edited_path
    edited_path="$(json_local_path "$edit_result")"
    test -s "$edited_path"
    cp -f "$edited_path" "$frame"
  fi
  test -s "$frame"

  if [ ! -s "$clip" ]; then
    uv run python scripts/cli.py generate-video \\
      --first-frame-image "$frame" \\
      --video-prompt "$video_prompt" \\
      --duration 5 \\
      --mode std \\
      --sound off \\
      --output-dir "$TASK_DIR" > "$video_result"
    local generated_video_path
    generated_video_path="$(json_local_path "$video_result")"
    test -s "$generated_video_path"
    cp -f "$generated_video_path" "$clip"
  fi
  test -s "$clip"
}

${runShotCalls}

if [ ! -s "$FINAL_VIDEO" ]; then
  uv run python scripts/cli.py concat-videos \\
    --videos ${clipArguments} \\
    --output "$FINAL_VIDEO" \\
    --size 720x1280 \\
    --fps 24 \\
    --fit crop \\
    --audio drop \\
    --overwrite > "$TASK_DIR/concat.json" 2>&1
fi
test -s "$FINAL_VIDEO"
printf '%s\\n' "$FINAL_VIDEO" > "$TASK_DIR/video-path.txt"

uv run python - "$TASK_DIR/result.json" "$FINAL_VIDEO" ${frameArguments} ${clipArguments} <<'PY'
import json
import sys
result_path, final_video, *paths = sys.argv[1:]
half = len(paths) // 2
with open(result_path, "w", encoding="utf-8") as handle:
    json.dump({"success": True, "finalVideo": final_video, "frames": paths[:half], "clips": paths[half:]}, handle, ensure_ascii=False, indent=2)
PY

test -s "$TASK_DIR/video-path.txt"
test -s "$TASK_DIR/result.json"
echo "视频任务完成：$FINAL_VIDEO"
\`\`\`

## 任务完成与失败边界

- 任何命令失败时，脚本会立即停止；返回失败镜头编号、对应 JSON 文件和错误信息。
- 重试时必须再次执行同一脚本。脚本会跳过已有的 \`frame-NN.png\`、\`clip-NN.mp4\` 和最终视频，只继续缺失步骤。
- 不得将“已检查文件”视为完成；只有 \`video-path.txt\` 和 \`result.json\` 均存在且非空才算完成。
- 不要发布或保存小红书草稿。

## 逐镜头方案

${shotSections}

## 整片方向
${String(parsed?.overallDirection || "按输入顺序形成连贯、自然、适合小红书竖屏观看的短视频。")}`;
}

export async function planStoryVideoFrames(input: {
  account: Record<string, unknown> & { name: string; accountParam: string };
  noteTask: Record<string, unknown> & { id: number; topicTitle: string };
  story: VideoStoryDraft;
  assets: VideoSourceAsset[];
  manualAssets?: VideoSourceAsset[];
  expertRules?: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const manualAssets = input.manualAssets || [];
  const response = await completeWithBackendAi({
    instructions: "你是小红书故事型竖屏短视频首帧与素材规划师。根据已确认故事、用户指定图片和素材库文字元数据，规划3-6个镜头的首帧来源和首帧处理提示词。只返回JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `根据已确认故事规划镜头的首帧与素材来源。

硬性要求：
- 必须严格输出 ${input.story.shots.length} 个镜头，且顺序与已确认故事节点一一对应；只规划首帧，不要输出视频动态或转场。
- “用户手动指定图片”中的每张图片都必须使用且只能使用一次，AI可以根据故事需要决定它在镜头序列中的位置。
- 手选图不足以完成故事时，再从“其余候选素材”中匹配真实图片；仍有缺口时使用 frameSource=generate 生成AI首帧。
- 只能根据文件名、标签、适用类型等文字元数据判断素材，不得声称看过图片。
- 同一素材 URL 只能使用一次。没有明确匹配素材时使用 frameSource=generate，不得勉强套用不相关图片。
- 使用真实素材时，framePrompt 是 edit-image 精修提示词，要保留真实主体和空间，仅调整9:16构图、光线、色彩和必要背景。
- 使用AI首帧时，framePrompt 是 generate-image 提示词，要明确主体、环境、构图、光线、色调和9:16竖屏画面。

账号与任务：
${JSON.stringify(compactStoryContext(input.account, input.noteTask), null, 2)}

已确认故事：
${JSON.stringify(input.story, null, 2)}

已沉淀专家规则：
${input.expertRules || "暂无相关规则。"}

用户手动指定图片（必须全部使用）：
${manualAssets.length ? JSON.stringify(manualAssets.map((asset) => ({
    id: asset.id,
    filePath: asset.filePath,
    fileUrl: asset.fileUrl,
    tags: asset.tags || "",
    suitableTypes: asset.suitableTypes || ""
  })), null, 2) : "用户未手动指定图片。"}

其余候选素材库图片：
${input.assets.length ? JSON.stringify(input.assets.filter((asset) => !manualAssets.some((manual) => manual.fileUrl === asset.fileUrl)).map((asset) => ({
    id: asset.id,
    filePath: asset.filePath,
    fileUrl: asset.fileUrl,
    fileType: asset.fileType,
    tags: asset.tags || "",
    suitableTypes: asset.suitableTypes || ""
  })), null, 2) : "当前没有可用真实图片，全部首帧使用AI生成。"}

返回格式：
{"overallDirection":"整片方向","shots":[{"order":1,"role":"镜头职责","description":"本镜头画面内容","frameSource":"asset或generate","assetUrl":"asset时原样返回URL，generate时为空字符串","framePrompt":"首帧精修或生成Prompt"}]}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能规划故事视频首帧与素材：${response.error}`);
  const parsed = extractJson(response.text);
  const framePlan = parseStoryVideoFramePlan(parsed?.shots, input.assets, manualAssets, input.story.shots.length);
  if (!framePlan) throw new Error("后端 AI 返回的故事视频首帧规划 JSON 不完整或素材对应关系无效，请重试。");
  return { overallDirection: String(parsed?.overallDirection || "按已确认故事形成连贯的竖屏短视频。"), framePlan };
}

export async function planStoryVideoMotion(input: {
  story: VideoStoryDraft;
  framePlan: StoryVideoFramePlan;
  expertRules?: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const response = await completeWithBackendAi({
    instructions: "你是小红书故事型竖屏短视频动态导演。根据已确认故事和已锁定首帧计划，为每个镜头生成5秒内的主体动态与片尾转场。只返回JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `为以下已锁定的首帧镜头规划视频动态与片尾转场。

硬性要求：
- 严格按 framePlan 中的 order 输出，数量必须完全一致；不得更换素材、首帧来源、镜头顺序、角色或画面职责。
- mainVideoPrompt 只描述前约4秒的主体运动、镜头运动、环境微动和情绪变化。
- endingTransitionPrompt 描述最后约1秒的自然转场动作、遮挡、光影、推拉或运动趋势，为下一镜头建立衔接；最后一个镜头必须写自然收束，不得跳转到未出现的画面。
- 不生成独立转场镜头，不要求字幕、配音、背景音乐或新增首帧画面。

已确认故事：
${JSON.stringify(input.story, null, 2)}

已锁定首帧计划：
${JSON.stringify(input.framePlan, null, 2)}

已沉淀专家规则：
${input.expertRules || "暂无相关规则。"}

返回格式：
{"shots":[{"order":1,"mainVideoPrompt":"前约4秒主体动态","endingTransitionPrompt":"最后约1秒片尾转场或自然收束"}]}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能规划故事视频动态与转场：${response.error}`);
  const parsed = extractJson(response.text);
  const motionPlan = parseStoryVideoMotionPlan(parsed?.shots, input.framePlan);
  if (!motionPlan) throw new Error("后端 AI 返回的视频动态与转场 JSON 不完整，请重试。");
  return motionPlan;
}

export function buildStoryVideoTask(input: {
  account: Record<string, unknown> & { name: string; accountParam: string };
  noteTask: Record<string, unknown> & { id: number; topicTitle: string };
  story: VideoStoryDraft;
  framePlan: StoryVideoFramePlan;
  motionPlan: StoryVideoMotionPlan;
  overallDirection?: string;
}) {
  if (
    input.framePlan.length < 3
    || input.framePlan.length > 6
    || input.motionPlan.length !== input.framePlan.length
    || input.framePlan.some((shot, index) => shot.order !== index + 1 || !shot.role || !shot.description || !shot.framePrompt)
    || input.motionPlan.some((shot, index) => shot.order !== index + 1 || !shot.mainVideoPrompt || !shot.endingTransitionPrompt)
  ) {
    throw new Error("首帧或动态规划结果无效，无法组装故事视频任务。");
  }
  const shots = combineStoryVideoPlans(input.framePlan, input.motionPlan);

  const taskDir = `$PWD/.tasks/xhs-video-task-${input.noteTask.id}`;
  const assetsDir = `$PWD/assets/${input.account.accountParam}`;
  const taskDirLiteral = `.tasks/xhs-video-task-${input.noteTask.id}`;
  const realShots = shots.filter((shot) => shot.frameSource === "asset");
  const generatedShots = shots.filter((shot) => shot.frameSource === "generate");
  const sourceDownloads = realShots.map((shot) => {
    const number = String(shot.order).padStart(2, "0");
    return `curl --fail --location --retry 3 --connect-timeout 20 --output "$TASK_DIR/source-${number}.download" ${shellQuote(shot.assetUrl)}
uv run python - "$TASK_DIR/source-${number}.download" "$TASK_DIR/source-${number}.png" <<'PY'
from pathlib import Path
import sys
from PIL import Image

source, target = map(Path, sys.argv[1:])
with Image.open(source) as image:
    image.load()
    image.convert("RGB").save(target, "PNG")
if not target.is_file() or target.stat().st_size == 0:
    raise SystemExit("下载图片无法标准化为可读 PNG")
PY
test -s "$TASK_DIR/source-${number}.png"`;
  }).join("\n");
  const prepareShotCalls = shots.map((shot) => {
    const number = String(shot.order).padStart(2, "0");
    return `prepare_frame "${number}" "${shot.frameSource}" ${shellQuote(shot.framePrompt)}`;
  }).join("\n");
  const renderShotCalls = shots.map((shot) => {
    const number = String(shot.order).padStart(2, "0");
    return `render_video "${number}" ${shellQuote(shot.videoPrompt)}`;
  }).join("\n");
  const clipArguments = shots.map((shot) => `"$TASK_DIR/clip-${String(shot.order).padStart(2, "0")}.mp4"`).join(" ");
  const frameArguments = shots.map((shot) => `"$TASK_DIR/frame-${String(shot.order).padStart(2, "0")}.png"`).join(" ");
  const shotSections = shots.map((shot) => `### 镜头 ${shot.order}｜${shot.role}
- 画面内容：${shot.description}
- 首帧来源：${shot.frameSource === "asset" ? `素材库图片 ${shot.assetUrl}` : "AI 生成"}
- 首帧文件：\`$TASK_DIR/frame-${String(shot.order).padStart(2, "0")}.png\`
- 视频片段：\`$TASK_DIR/clip-${String(shot.order).padStart(2, "0")}.mp4\`
- 首帧${shot.frameSource === "asset" ? "精修" : "生成"} Prompt：${shot.framePrompt}
- 前约 4 秒主体动态：${shot.mainVideoPrompt}
- 最后约 1 秒片尾转场：${shot.endingTransitionPrompt}
- 传给 generate-video 的完整 5 秒 Prompt：${shot.videoPrompt}`).join("\n\n");
  const imageCredentialChecks = [
    realShots.length ? `if not (os.getenv("AISHARING_API_KEY") or os.getenv("OPENAI_OFFICIAL_API_KEY")):\n    missing.append("AISHARING_API_KEY 或 OPENAI_OFFICIAL_API_KEY（真实首帧精修）")` : "",
    generatedShots.length ? `if not (os.getenv("GACCODE_API_KEY") or os.getenv("OPENAI_OFFICIAL_API_KEY")):\n    missing.append("GACCODE_API_KEY 或 OPENAI_OFFICIAL_API_KEY（AI首帧生成）")` : ""
  ].filter(Boolean).join("\n");

  return `# Agent 故事驱动视频执行任务

请使用 **xiaohongshu_auto_op** 的 **xhs-creative** skill 完成本任务。不要发布或填写小红书表单。

## 任务上下文
- 业务账号：${input.account.name}
- 账号参数：${input.account.accountParam}
- 单篇任务：${input.noteTask.topicTitle}
- 故事标题：${input.story.title}
- 故事摘要：${input.story.summary}
- 情绪主线：${input.story.emotionalArc}
- 镜头数量：${shots.length} 段，每段固定 5 秒
- 最终任务目录：\`${taskDir}\`
- 账号素材目录：\`${assetsDir}\`

## 执行方式
本任务必须使用 Hermes Kanban 分阶段编排。Kanban 只负责阶段调度与状态，不替代本任务脚本；每个 worker 都只执行指定阶段的 \`bash\` 命令，禁止把完整任务再次嵌套进另一套编排。

固定 Kanban 参数：
- assignee：\`default\`（不得写为 \`@default\`）。
- workspace：主会话当前 xiaohongshu_auto_op Skill 根目录，即 \`dir:<该根目录的绝对路径>\`；所有卡必须使用同一 workspace，不能创建临时 workspace 或切换目录。
- 首帧准备卡 max-runtime：45 分钟。
- 视频渲染卡 max-runtime：90 分钟。
- 每个离线 worker 成功或失败时必须显式调用 \`kanban_complete\`；成功说明产物路径，失败说明镜头编号、日志路径和错误。
- 主会话负责创建卡、等待依赖完成、执行视觉验收和最终交付；不要创建额外的“总任务卡”。

只有 \`video-path.txt\`、\`result.json\` 和最终成片均通过验收才算完成。

## 主会话初始化（必须亲自完成）

在 skill 根目录依次执行。不得委派本段，不得用 \`find -printf\` 或目录扫描替代指定文件检查。

\`\`\`bash
set -euo pipefail
SKILL_ROOT="$PWD"
uv sync --extra imagegen
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
uv run python - "$SKILL_ROOT/.env" <<'PY'
import os
from pathlib import Path
import sys
from dotenv import load_dotenv

load_dotenv(Path(sys.argv[1]), override=False)
missing = []
if not os.getenv("KLING_API_KEY"):
    missing.append("KLING_API_KEY")
${imageCredentialChecks}
if missing:
    raise SystemExit("缺少故事视频任务依赖配置：" + "、".join(missing))
PY

TASK_DIR="$PWD/${taskDirLiteral}"
ACCOUNT_ASSETS_DIR="$PWD/assets/${input.account.accountParam}"
mkdir -p "$TASK_DIR" "$ACCOUNT_ASSETS_DIR"
${sourceDownloads || "echo \"本任务没有需要下载的真实首帧。\""}
echo "主会话初始化完成：已准备 ${realShots.length} 张真实素材下载项。"
\`\`\`

## Kanban 阶段执行脚本

主会话初始化成功后，将以下脚本原样保存为 \`$TASK_DIR/run-story-video.sh\`，然后严格按以下 Kanban 生命周期执行：

1. 创建“首帧准备”卡：assignee \`default\`，workspace 为上述 Skill 根目录，max-runtime 45 分钟。卡片只允许执行：\`bash "$TASK_DIR/run-story-video.sh" prepare\`。完成条件：所有 \`frame-NN.png\` 存在且非空；worker 调用 \`kanban_complete\` 并返回首帧路径。
2. 主会话等待“首帧准备”卡完成后，亲自执行下方首帧视觉验收。验收未通过则停止任务并报告，绝不创建渲染卡。
3. 视觉验收通过后，创建依赖于“首帧准备”完成的“视频渲染与拼接”卡：assignee \`default\`，同一 workspace，max-runtime 90 分钟。卡片只允许执行：\`bash "$TASK_DIR/run-story-video.sh" render\`。完成条件：通过脚本中的最终成片校验，worker 调用 \`kanban_complete\` 并返回 \`video-path.txt\`、\`result.json\` 和成片路径。
4. 主会话等待渲染卡完成，核对最终产物并按“最终回复要求”交付。

脚本必须从 CLI 混合日志中提取 JSON 的 \`local_path\`，不得按目录猜测文件名。

## 首帧视觉验收（render 前必须完成）

主会话必须逐张查看 \`frame-NN.png\`，确认：主体、场地和关键真实物件未被错误替换；同一角色或主体在连续镜头中保持一致；未凭空加入招牌、清晰人脸、价格、联系方式或未经确认的业务事实；画面适合 9:16 竖屏。任一首帧不符合时，停止，不得调用 Kling，报告镜头编号、文件路径和原因。

## Kling 计费与超时

- 每个镜头的 Kling 等待时间不得低于 15 分钟；脚本已固定 \`--timeout 900\`。
- 任一镜头超时后，必须先从该镜头的 \`video-NN.json\` 日志中保留并提取 \`task_id\`，使用当前安装版本提供的 Kling 任务状态查询能力确认最终状态。
- 只有状态明确为失败时，才允许创建新的渲染卡重新提交；状态仍在排队/处理中时继续等待，不得重复提交；当前环境无法查询 task_id 时停止并报告 task_id，不得猜测失败或直接重跑。
- 确认失败后，先执行 \`bash "$TASK_DIR/run-story-video.sh" reset-video NN\` 删除该镜头上一轮失败日志和对应残缺片段，再重新执行 \`render\`；只补缺失或明确失败的镜头。

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="$PWD/${taskDirLiteral}"
ACCOUNT_ASSETS_DIR="$PWD/assets/${input.account.accountParam}"
FINAL_VIDEO="$ACCOUNT_ASSETS_DIR/video-note-${input.noteTask.id}.mp4"

json_local_path() {
  uv run python - "$1" <<'PY'
import json
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
decoder = json.JSONDecoder()
for index, char in enumerate(raw):
    if char != "{":
        continue
    try:
        payload, _ = decoder.raw_decode(raw[index:])
    except json.JSONDecodeError:
        continue
    if isinstance(payload, dict) and payload.get("success") and payload.get("local_path"):
        print(payload["local_path"])
        break
else:
    raise SystemExit("CLI 日志中未找到 success=true 且包含 local_path 的 JSON 结果")
PY
}

prepare_frame() {
  local number="$1"
  local frame_source="$2"
  local frame_prompt="$3"
  local source="$TASK_DIR/source-$number.png"
  local frame="$TASK_DIR/frame-$number.png"
  local clip="$TASK_DIR/clip-$number.mp4"
  local frame_result="$TASK_DIR/frame-$number.json"

  if [ ! -s "$frame" ]; then
    if [ "$frame_source" = "asset" ]; then
      test -s "$source"
      uv run python scripts/cli.py edit-image \\
        --prompt "$frame_prompt" \\
        --images "$source" \\
        --output-dir "$TASK_DIR" \\
        --size "1536x2048" \\
        --quality "medium" > "$frame_result" 2>&1
    else
      uv run python scripts/cli.py generate-image \\
        --prompt "$frame_prompt" \\
        --output-dir "$TASK_DIR" \\
        --size "1536x2048" > "$frame_result" 2>&1
    fi
    local generated_frame_path
    generated_frame_path="$(json_local_path "$frame_result")"
    test -s "$generated_frame_path"
    cp -f "$generated_frame_path" "$frame"
  fi
  test -s "$frame"
}

render_video() {
  local number="$1"
  local video_prompt="$2"
  local frame="$TASK_DIR/frame-$number.png"
  local clip="$TASK_DIR/clip-$number.mp4"
  local video_result="$TASK_DIR/video-$number.json"

  test -s "$frame"
  if [ ! -s "$clip" ]; then
    uv run python scripts/cli.py generate-video \\
      --first-frame-image "$frame" \\
      --video-prompt "$video_prompt" \\
      --duration 5 \\
      --mode std \\
      --sound off \\
      --output-dir "$TASK_DIR" \\
      --timeout 900 \\
      --poll-interval 5 \\
      --request-timeout 60 > "$video_result" 2>&1
    local generated_video_path
    generated_video_path="$(json_local_path "$video_result")"
    test -s "$generated_video_path"
    cp -f "$generated_video_path" "$clip"
  fi
  test -s "$clip"
}

prepare_all() {
${prepareShotCalls}
  echo "首帧准备完成：请主会话逐张视觉检查 frame-NN.png 后再执行 render。"
}

render_all() {
${renderShotCalls}

  if [ ! -s "$FINAL_VIDEO" ]; then
  uv run python scripts/cli.py concat-videos \\
    --videos ${clipArguments} \\
    --output "$FINAL_VIDEO" \\
    --size 720x1280 \\
    --fps 24 \\
    --fit crop \\
    --audio drop \\
    --overwrite > "$TASK_DIR/concat.json"
  fi
  test -s "$FINAL_VIDEO"

  uv run python - "$FINAL_VIDEO" ${frameArguments} ${clipArguments} <<'PY'
import json
import subprocess
import sys
from pathlib import Path

final_video, *artifacts = sys.argv[1:]
for path in artifacts + [final_video]:
    if not Path(path).is_file() or Path(path).stat().st_size == 0:
        raise SystemExit(f"缺少或为空的产物：{path}")
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", final_video],
    check=True,
    capture_output=True,
    text=True,
)
payload = json.loads(probe.stdout)
duration = float(payload.get("format", {}).get("duration", 0))
video = next((item for item in payload.get("streams", []) if item.get("codec_type") == "video"), {})
audio = [item for item in payload.get("streams", []) if item.get("codec_type") == "audio"]
expected = len(artifacts) // 2 * 5
if abs(duration - expected) > 2:
    raise SystemExit(f"成片时长异常：{duration:.2f}s，期望约 {expected}s")
if (video.get("width"), video.get("height")) != (720, 1280):
    raise SystemExit(f"成片尺寸异常：{video.get('width')}x{video.get('height')}")
fps_text = str(video.get("r_frame_rate", "0/1"))
fps_parts = fps_text.split("/", 1)
numerator = float(fps_parts[0])
denominator = float(fps_parts[1]) if len(fps_parts) > 1 else 1.0
if denominator == 0 or abs(numerator / denominator - 24) > 0.5:
    raise SystemExit(f"成片帧率异常：{fps_text}，期望约24fps")
if audio:
    raise SystemExit("成片不应包含音轨")
PY

  printf '%s\\n' "$FINAL_VIDEO" > "$TASK_DIR/video-path.txt"

  uv run python - "$TASK_DIR/result.json" "$FINAL_VIDEO" ${frameArguments} ${clipArguments} <<'PY'
import json
import sys
result_path, final_video, *paths = sys.argv[1:]
half = len(paths) // 2
with open(result_path, "w", encoding="utf-8") as handle:
    json.dump({"success": True, "finalVideo": final_video, "frames": paths[:half], "clips": paths[half:]}, handle, ensure_ascii=False, indent=2)
PY

  uv run python - "$TASK_DIR/result.json" "$TASK_DIR/video-path.txt" "$FINAL_VIDEO" <<'PY'
import json
import sys
from pathlib import Path

result_path, video_path_file, expected_video = sys.argv[1:]
payload = json.loads(Path(result_path).read_text(encoding="utf-8"))
if payload.get("success") is not True:
    raise SystemExit("result.json 未声明 success:true")
paths = [line.strip() for line in Path(video_path_file).read_text(encoding="utf-8").splitlines() if line.strip()]
if paths != [expected_video]:
    raise SystemExit("video-path.txt 必须只包含最终视频绝对路径")
PY

  test -s "$TASK_DIR/video-path.txt"
  test -s "$TASK_DIR/result.json"
  echo "故事视频任务完成：$FINAL_VIDEO"
}

reset_video() {
  shift
  if [ "$#" -eq 0 ]; then
    echo "必须指定至少一个两位镜头编号，例如：reset-video 01" >&2
    exit 64
  fi
  for number in "$@"; do
    case "$number" in
      [0-9][0-9]) ;;
      *) echo "非法镜头编号：$number" >&2; exit 64 ;;
    esac
    rm -f "$TASK_DIR/video-$number.json" "$TASK_DIR/clip-$number.mp4"
    echo "已清理镜头 $number 的失败视频日志与残缺片段。"
  done
}

case "\${1:-}" in
  prepare) prepare_all ;;
  render) render_all ;;
  reset-video) reset_video "$@" ;;
  *) echo "用法：bash $0 prepare | render | reset-video NN [NN...]" >&2; exit 64 ;;
esac
\`\`\`

## 失败与重试边界

- 任一命令失败时立即停止，并返回镜头编号、对应 JSON 文件和错误信息。
- 重试时重新执行同一脚本；已有的 \`frame-NN.png\`、\`clip-NN.mp4\` 和最终视频会被跳过，只补齐缺失步骤。
- 完成判定只看磁盘：\`video-path.txt\` 存在且只含最终视频路径、\`result.json\` 中 \`success:true\`、成片 ffprobe 验收为约15-30秒/720×1280/24fps/无音轨三者齐备才算完成；Kanban 完成通知不作为验收依据。
- 不要发布或保存小红书草稿。

## 最终回复要求

无论成功或失败，都必须在最终回复中提供全部 \`frame-NN.png\`、\`clip-NN.mp4\` 和最终 \`video-note-${input.noteTask.id}.mp4\` 的可查看文件或附件，不得只提供压缩包。失败时额外说明失败镜头、对应输入图/首帧/片段路径和具体错误；成功时说明最终视频路径、\`video-path.txt\` 路径、\`result.json\` 路径及实际使用的镜头数。

## 逐镜头方案

${shotSections}

## 整片方向
${input.overallDirection || "按已确认故事形成有开头、变化和结尾的连贯竖屏短视频。"}`;
}

export function buildVideoDraftTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  bodyPrompt: string;
  selectedDraft?: { label: string; title: string; body: string };
}) {
  const { account, noteTask, bodyPrompt, selectedDraft } = input;
  const accountName = shellQuote(account.accountParam);
  const taskDir = `$PWD/.tasks/xhs-video-task-${noteTask.id}`;
  return `# Agent 视频笔记草稿箱任务

请使用 **xiaohongshu_auto_op** 的 **xhs-publish** skill，为指定账号生成视频笔记的标题和正文，使用视频方案阶段准备好的视频，并保存到小红书草稿箱。严禁真实发布。

## 目标账号
- 业务账号：${account.name}
- skill 账号参数：${account.accountParam}
- 单篇任务：${noteTask.topicTitle}

## 上一阶段视频
- 视频任务目录：\`${taskDir}\`
- 视频路径清单：\`${taskDir}/video-path.txt\`

必须读取清单中的唯一视频绝对路径；清单不存在、为空、包含多个路径或视频文件不存在时立即停止，不得自行寻找替代视频。

## 执行步骤
1. 进入 skill 根目录并复用视频方案已创建的任务目录，不要创建新的任务目录。
2. ${selectedDraft ? "严格使用下方已选文案版本，原样写入 `$TASK_DIR/title.txt` 和 `$TASK_DIR/content.txt`。不得生成、改写、扩写、删减标题、正文或标签。" : "根据下方正文要求生成最终标题、正文和 5-6 个标签，分别写入 `$TASK_DIR/title.txt` 和 `$TASK_DIR/content.txt`。"}
3. 执行登录检查后，用以下命令填写视频发布表单并保存草稿：

\`uv run python scripts/cli.py --account ${accountName} check-login\`

\`uv run python scripts/cli.py --account ${accountName} fill-publish-video --title-file "$TASK_DIR/title.txt" --content-file "$TASK_DIR/content.txt" --video "$FINAL_VIDEO"\`

\`uv run python scripts/cli.py --account ${accountName} save-draft\`

只有前一步成功才能继续。禁止调用 \`publish-video\` 或 \`click-publish\`。

${selectedDraft ? `## 已选文案版本

- 版本：${selectedDraft.label}
- 标题：

\`\`\`text
${selectedDraft.title}
\`\`\`

- 正文（必须原样写入 \`$TASK_DIR/content.txt\`）：

\`\`\`text
${selectedDraft.body}
\`\`\`` : `## 正文生成要求

${bodyPrompt}`}`;
}
