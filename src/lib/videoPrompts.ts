import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import { createHash } from "node:crypto";
import { characterDownloadUrl, type StoryCharacter } from "@/lib/storyCharacters";

export type VideoSourceAsset = {
  id: number;
  filePath: string;
  fileUrl: string;
  fileType: string;
  tags?: string;
  suitableTypes?: string;
};

export type VideoStorySourceType = "template";

export type VideoStoryDraft = {
  character?: StoryCharacter | null;
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
  narrationText: string;
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
  narrationText: string;
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

function parseStoryDraft(value: unknown): VideoStoryDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const title = String(item.title || "").trim();
  const summary = String(item.summary || "").trim();
  const emotionalArc = String(item.emotionalArc || "").trim();
  const noteTaskRaw = item.noteTask;
  if (!title || !summary || !emotionalArc || !noteTaskRaw || typeof noteTaskRaw !== "object" || Array.isArray(noteTaskRaw) || !Array.isArray(item.shots) || item.shots.length < 3 || item.shots.length > 6) return null;
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

function parseStoryVideoFramePlan(value: unknown, assets: VideoSourceAsset[], expectedShotCount: number): StoryVideoFramePlan | null {
  if (!Array.isArray(value) || value.length !== expectedShotCount || value.length < 3 || value.length > 6) return null;
  const validUrls = new Set(assets.map((asset) => asset.fileUrl));
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
    const narrationText = String(item.narrationText || "").trim();
    if (order !== index + 1 || !mainVideoPrompt || !endingTransitionPrompt || !narrationText || Array.from(narrationText).length > 30) return null;
    return { order, mainVideoPrompt, endingTransitionPrompt, narrationText };
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
  character?: StoryCharacter | null;
  account: Record<string, unknown> & { name: string; accountParam: string };
  noteTask: Record<string, unknown> & { id: number; topicTitle: string };
  sourceType: VideoStorySourceType;
  sourceContent: string;
  extraRequirements?: string;
  availableWritingStyles: string[];
  expertRules?: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const response = await completeWithBackendAi({
    instructions: "你是小红书竖屏短视频故事策划师。把用户选择的创意故事模板发展成可由多个5秒镜头完成、具有漫剧感与反转的短故事。只返回JSON，不要输出Markdown。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `为当前账号新建一版待用户确认的故事型视频。

硬性要求：
- 必须保留故事模板指定的主角、核心冲突和反转，不得把模板改写为平铺直叙的账号介绍。
- 模板中标记为“强制场景”的场景顺序、人物关系和指定对话必须原样保留；例如要求第 2 个场景出现的对话，不得挪到其他镜头、删减或替换。
- 故事要像短篇漫剧：开头有悬念或目标，中段出现意外、误会或选择，结尾完成反转、和解或新的发现。
- 账号定位、业务场景和可用素材只用于承接故事发生地、道具或环境，不得覆盖模板本身的创意剧情。
- 输出 3-6 个镜头节点；每个节点后续固定生成 5 秒视频。
- 镜头描述必须能转化为具体画面，不要写运营分析、制作说明或空泛口号。
- suggestedMaterial 只描述需要什么画面，不得声称看过素材库图片。
- 不生成标题正文，不执行视频制作。
- noteTask 是故事的系统落点，不是另一个选题：其中 topicTitle、contentGoal、coreView 和素材要求必须直接来自该故事；writingStyleName 必须从 availableWritingStyles 中选择一项精确名称。

账号与任务：
${JSON.stringify(compactStoryContext(input.account, input.noteTask), null, 2)}

故事模板：${input.sourceContent}

选定主角形象（保持名称、毛色、服装和配饰一致；图片由执行智能体读取）：
${JSON.stringify(input.character || "本模板暂未配置参考照片，按模板描述设计主角。")}

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
  const story = parseStoryDraft(parsed);
  if (!story) throw new Error("后端 AI 返回的视频故事 JSON 不完整，请重试。");
  if (/牛来喊[“"]妈妈[”"]，妈妈回应[“"]牛来[”"]/u.test(input.sourceContent)) {
    const secondScene = story.shots[1];
    const secondSceneText = `${secondScene?.beat || ""}${secondScene?.role || ""}${secondScene?.description || ""}`;
    if (!/牛来/u.test(secondSceneText) || !/妈妈/u.test(secondSceneText)) {
      throw new Error("牛来模板的第 2 个场景缺少“牛来”与“妈妈”的指定对话，请重试。");
    }
  }
  return { ...story, character: input.character || null };
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
  expertRules?: string;
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const response = await completeWithBackendAi({
    instructions: "你是小红书故事型竖屏短视频首帧与素材规划师。根据已确认故事、用户指定图片和素材库文字元数据，规划3-6个镜头的首帧来源和首帧处理提示词。只返回JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `根据已确认故事规划镜头的首帧与素材来源。

硬性要求：
- 必须严格输出 ${input.story.shots.length} 个镜头，且顺序与已确认故事节点一一对应；只规划首帧，不要输出视频动态或转场。
- 优先从候选素材库图片中选择与镜头职责匹配的真实图片；只能根据文件名、标签、适用类型等文字元数据判断。
- 候选素材无法匹配当前镜头时，使用 frameSource=generate 生成 AI 首帧；不得勉强套用不相关真实图片。
- 只能根据文件名、标签、适用类型等文字元数据判断素材，不得声称看过图片。
- 同一素材 URL 只能使用一次。没有明确匹配素材时使用 frameSource=generate，不得勉强套用不相关图片。
- 使用真实素材时，framePrompt 是 edit-image 精修提示词，要保留真实主体和空间，仅调整 3:4 构图、光线、色彩和必要背景。
- 使用AI首帧时，framePrompt 是 generate-image 提示词，要明确主体、环境、构图、光线、色调和 3:4 竖版画面。
${input.story.character ? `- 本次已锁定主角参考图：${input.story.character.description}。允许将主角融入真实背景，保留场地主要结构。framePrompt 必须描述主角的位置、姿态、比例和融合光影。AI 背景先单独生成，再与主角参考图通过 edit-image 合成；不要复制角色展示图的背景。` : ""}

账号与任务：
${JSON.stringify(compactStoryContext(input.account, input.noteTask), null, 2)}

已确认故事：
${JSON.stringify(input.story, null, 2)}

已沉淀专家规则：
${input.expertRules || "暂无相关规则。"}

候选素材库图片：
${input.assets.length ? JSON.stringify(input.assets.map((asset) => ({
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
  const framePlan = parseStoryVideoFramePlan(parsed?.shots, input.assets, input.story.shots.length);
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
    instructions: "你是小红书故事型竖屏短视频动态导演和旁白编剧。根据已确认故事和已锁定首帧计划，为每个镜头生成5秒内的主体动态、片尾转场和单一旁白。只返回JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `为以下已锁定的首帧镜头规划视频动态与片尾转场。

硬性要求：
- 严格按 framePlan 中的 order 输出，数量必须完全一致；不得更换素材、首帧来源、镜头顺序、角色或画面职责。
- mainVideoPrompt 只描述前约4秒的主体运动、镜头运动、环境微动和情绪变化。
- endingTransitionPrompt 描述最后约1秒的自然转场动作、遮挡、光影、推拉或运动趋势，为下一镜头建立衔接；最后一个镜头必须写自然收束，不得跳转到未出现的画面。
- narrationText 是单一旁白音色朗读的成品台词，每个镜头必须有且只有一条，建议 6-16 个汉字，最多 30 个字符，正常语速下必须能在前 4 秒内说完。
- 旁白要承接当前镜头的事件或情绪，全部镜头使用同一个叙述者口吻；角色对白也由该旁白音色朗读，不规划多角色音色。
- narrationText 只包含要朗读的中文正文，不得包含“旁白：”、角色标签、舞台说明、Markdown、SSML、字幕指令或引号外说明。
- 不生成独立转场镜头，不要求字幕、背景音乐或新增首帧画面。

已确认故事：
${JSON.stringify(input.story, null, 2)}

已锁定首帧计划：
${JSON.stringify(input.framePlan, null, 2)}

已沉淀专家规则：
${input.expertRules || "暂无相关规则。"}

返回格式：
{"shots":[{"order":1,"mainVideoPrompt":"前约4秒主体动态","endingTransitionPrompt":"最后约1秒片尾转场或自然收束","narrationText":"前4秒内可朗读完成的单一旁白"}]}`
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
    || input.motionPlan.some((shot, index) => shot.order !== index + 1 || !shot.mainVideoPrompt || !shot.endingTransitionPrompt || !shot.narrationText)
  ) {
    throw new Error("首帧或动态规划结果无效，无法组装故事视频任务。");
  }
  const shots = combineStoryVideoPlans(input.framePlan, input.motionPlan);
  const character = input.story.character;
  const characterUrl = character ? characterDownloadUrl(character, process.env.STORY_CHARACTER_PUBLIC_BASE_URL || "") : "";
  const taskDir = `.tasks/xhs-video-task-${input.noteTask.id}`;
  const plan = {
    version: 1,
    account: { name: input.account.name, accountParam: input.account.accountParam },
    noteTask: { id: input.noteTask.id, topicTitle: input.noteTask.topicTitle },
    character: character ? {
      id: character.id,
      name: character.name,
      description: character.description,
      imageUrl: characterUrl,
      expectedFilename: `${character.id}.png`
    } : null,
    shots: shots.map((shot) => ({
      order: shot.order,
      role: shot.role,
      description: shot.description,
      frameSource: shot.frameSource,
      assetUrl: shot.assetUrl,
      framePrompt: character
        ? `第一张输入图是场景背景，第二张是唯一主角参考图。自然融入主角并保持外观一致，不复制参考图背景。${character.description}。${shot.framePrompt}`
        : shot.framePrompt,
      videoPrompt: shot.videoPrompt,
      narrationText: shot.narrationText,
      duration: 5,
      narrationTargetDuration: 4
    }))
  };
  const planJson = JSON.stringify(plan);
  return `# Agent 创意故事视频任务

在 **xiaohongshu_auto_op** Skill 根目录执行。只生成视频，不发布或填写小红书表单。

- 账号：${input.account.name} / ${input.account.accountParam}
- 任务：${input.noteTask.topicTitle}（${input.noteTask.id}）
- 镜头：${shots.length} 段，每段 5 秒；火山引擎单一旁白
- 任务目录：\`$PWD/${taskDir}\`

## 1. 保存计划

\`\`\`bash
TASK_ROOT="$PWD/${taskDir}"
mkdir -p "$TASK_ROOT"
cat > "$TASK_ROOT/plan.json" <<'JSON'
${planJson}
JSON
uv sync --extra imagegen
\`\`\`

${character && !characterUrl ? `将本任务附带的 \`${character.id}.png\` 保存为 \`$TASK_ROOT/character-reference.png\`。` : "角色图已提供公网 HTTPS 地址，由 CLI 下载。"}

## 2. 准备并验收首帧

创建 Hermes Kanban 卡（assignee \`default\`、workspace 为当前 Skill 根目录、max-runtime 45 分钟），只执行：

\`uv run python scripts/cli.py story-video prepare --plan-file "$TASK_ROOT/plan.json" --work-dir "$TASK_ROOT"\`

卡完成后，主会话必须查看返回的全部 \`frame-NN.png\`，核对 3:4 构图、角色外观一致、主体和场地事实正确；不通过则停止。

## 3. 渲染、配音和拼接

首帧验收通过后创建依赖卡（同一 assignee/workspace、max-runtime 90 分钟），只执行：

\`uv run python scripts/cli.py story-video render --plan-file "$TASK_ROOT/plan.json" --work-dir "$TASK_ROOT" --output "$PWD/assets/${input.account.accountParam}/video-note-${input.noteTask.id}.mp4" --size 1080x1440\`

Kling 超时先查任务状态；仅明确失败后执行 \`story-video reset --plan-file "$TASK_ROOT/plan.json" --work-dir "$TASK_ROOT" --shots NN\`，再重跑 render，禁止重复付费提交。worker 必须调用 \`kanban_complete\` 并返回结构化结果。

## 最终回复

回复中提供全部首帧图和最终 \`video-note-${input.noteTask.id}.mp4\`。`;

  /* 旧版内嵌执行脚本保留在源码中作为迁移期参考，但不会进入生成任务。 */
  const fingerprint = createHash("sha256").update(JSON.stringify({ character, frames: input.framePlan, motion: input.motionPlan })).digest("hex").slice(0, 16);

  const assetsDir = `$PWD/assets/${input.account.accountParam}`;
  const taskDirLiteral = taskDir;
  const characterInit = character ? `${characterUrl ? `curl --fail --location --retry 3 --output "$TASK_DIR/character-reference.png" ${shellQuote(characterUrl)}` : `test -s "$TASK_DIR/character-reference.png" || { echo "请先将用户附带的 ${character!.id}.png 放到 $TASK_DIR/character-reference.png"; exit 1; }`}
uv run python - "$TASK_DIR/character-reference.png" <<'PY'
import sys
from PIL import Image
with Image.open(sys.argv[1]) as im:
    im.load()
    im.convert("RGB").save(sys.argv[1], "PNG")
PY` : "";
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
    const prompt = character ? `第一张输入图是场景背景，保留主要空间结构；第二张输入图是唯一主角外观参考。将该主角自然融入背景，保持毛色、服装、配饰和体型一致，不复制参考图的展示背景。${character!.description}。镜头要求：${shot.framePrompt}` : shot.framePrompt;
    return `prepare_frame "${number}" "${shot.frameSource}" ${shellQuote(prompt)}`;
  }).join("\n");
  const renderShotCalls = shots.map((shot) => {
    const number = String(shot.order).padStart(2, "0");
    return `render_video "${number}" ${shellQuote(shot.videoPrompt)} ${shellQuote(shot.narrationText)}`;
  }).join("\n");
  const clipArguments = shots.map((shot) => `"$TASK_DIR/clip-${String(shot.order).padStart(2, "0")}.mp4"`).join(" ");
  const frameArguments = shots.map((shot) => `"$TASK_DIR/frame-${String(shot.order).padStart(2, "0")}.png"`).join(" ");
  const narrationArguments = shots.map((shot) => `"$TASK_DIR/narration-${String(shot.order).padStart(2, "0")}.m4a"`).join(" ");
  const voicedClipArguments = shots.map((shot) => `"$TASK_DIR/voiced-clip-${String(shot.order).padStart(2, "0")}.mp4"`).join(" ");
  const shotSections = shots.map((shot) => `### 镜头 ${shot.order}｜${shot.role}
- 画面内容：${shot.description}
- 首帧来源：${shot.frameSource === "asset" ? `素材库图片 ${shot.assetUrl}` : "AI 生成"}
- 单一旁白：${shot.narrationText}`).join("\n\n");
  const imageCredentialChecks = [
    (realShots.length || character) ? `if not (os.getenv("AISHARING_API_KEY") or os.getenv("OPENAI_OFFICIAL_API_KEY")):\n    missing.append("AISHARING_API_KEY 或 OPENAI_OFFICIAL_API_KEY（首帧精修与角色合成）")` : "",
    generatedShots.length ? `if not (os.getenv("GACCODE_API_KEY") or os.getenv("OPENAI_OFFICIAL_API_KEY")):\n    missing.append("GACCODE_API_KEY 或 OPENAI_OFFICIAL_API_KEY（AI首帧生成）")` : ""
  ].filter(Boolean).join("\n");

  return `# Agent 创意故事视频执行任务

请使用 **xiaohongshu_auto_op** 的 **xhs-creative** skill 完成本任务。不要发布或填写小红书表单。

## 任务上下文
- 业务账号：${input.account.name}
- 账号参数：${input.account.accountParam}
- 单篇任务：${input.noteTask.topicTitle}
- 故事标题：${input.story.title}
- 故事摘要：${input.story.summary}
- 情绪主线：${input.story.emotionalArc}
- 镜头数量：${shots.length} 段，每段固定 5 秒
- 配音方式：火山引擎 Seed Audio 单一旁白；每段旁白目标时长 4 秒，不生成字幕或背景音乐
${character ? `- 主角形象：${character!.name}（${character!.id}）\n- 外观：${character!.description}\n- 主角图：${characterUrl || `由用户随任务附带 ${character!.id}.png，主会话先将收到的图片放至任务目录 character-reference.png；不得使用 localhost 下载链接。`}\n- 所有镜头必须以同一张主角图为外观依据。` : ""}
- 根任务目录：\`${taskDir}\`；账号素材目录：\`${assetsDir}\`
- 本次缓存：\`${taskDir}/runs/${fingerprint}\`；所有 Kanban 卡使用同一 Skill workspace 和绝对 TASK_DIR。

## 执行规则
使用 Hermes Kanban 分两卡执行。两卡固定 assignee \`default\`、workspace \`dir:<xiaohongshu_auto_op Skill 根目录绝对路径>\`；worker 必须调用 \`kanban_complete\`，失败时返回镜头号、日志和错误。主会话负责初始化、等待、视觉验收和最终交付。只有 \`video-path.txt\`、\`result.json\` 与成片均通过验收才完成。

## 主会话初始化（必须亲自完成）

在 Skill 根目录由主会话执行，不得委派：

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
if not os.getenv("VOLCENGINE_TTS_API_KEY"):
    missing.append("VOLCENGINE_TTS_API_KEY")
if not os.getenv("VOLCENGINE_TTS_SPEAKER"):
    missing.append("VOLCENGINE_TTS_SPEAKER")
${imageCredentialChecks}
if missing:
    raise SystemExit("缺少故事视频任务依赖配置：" + "、".join(missing))
PY

TASK_DIR="$PWD/${taskDirLiteral}"
ACCOUNT_ASSETS_DIR="$PWD/assets/${input.account.accountParam}"
mkdir -p "$TASK_DIR" "$ACCOUNT_ASSETS_DIR"
${characterInit}
mkdir -p "$TASK_DIR/runs/${fingerprint}"
${character ? `cp "$TASK_DIR/character-reference.png" "$TASK_DIR/runs/${fingerprint}/character-reference.png"` : ""}
TASK_DIR="$TASK_DIR/runs/${fingerprint}"
${sourceDownloads || "echo \"本任务没有需要下载的真实首帧。\""}
echo "主会话初始化完成：已准备 ${realShots.length} 张真实素材下载项。"
\`\`\`

## Kanban 阶段执行脚本

将以下脚本原样保存为 \`$TASK_DIR/run-story-video.sh\`：先建“首帧准备”卡执行 \`prepare\`（45 分钟），完成后主会话逐张验收；通过后再建依赖卡执行 \`render\`（90 分钟），完成视频、TTS、混音、拼接和校验。脚本从 CLI JSON 提取 \`local_path\`，不得猜文件名。

## 首帧验收

render 前逐张查看 \`frame-NN.png\`：核对 3:4 构图、主体/场地事实和角色连续性，禁止虚构招牌、人脸、价格或联系方式；失败则停止并报告。${character ? "同时对照 character-reference.png 核对主角外观。" : ""}

Kling 每镜头等待 900 秒；超时先用 \`video-NN.json\` 的 \`task_id\` 查状态，明确失败后才 \`reset-video NN\`，禁止重复提交。

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_TASK_DIR="$PWD/${taskDirLiteral}"
TASK_DIR="$ROOT_TASK_DIR/runs/${fingerprint}"
ACCOUNT_ASSETS_DIR="$PWD/assets/${input.account.accountParam}"
FINAL_VIDEO="$TASK_DIR/final.mp4"
CHARACTER_IMAGE="$TASK_DIR/character-reference.png"

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
        --images "$source" ${character ? '"$CHARACTER_IMAGE"' : ""} \\
        --output-dir "$TASK_DIR" \\
        --size "1536x2048" \\
        --quality "medium" > "$frame_result" 2>&1
    else
      uv run python scripts/cli.py generate-image \\
        --prompt "${character ? "仅生成无主角的场景背景，不添加角色。场景依据：" : ""}$frame_prompt" \\
        --output-dir "$TASK_DIR" \\
        --size "1536x2048" > "$frame_result" 2>&1
    fi
    local generated_frame_path
    generated_frame_path="$(json_local_path "$frame_result")"
    test -s "$generated_frame_path"
${character ? `    if [ "$frame_source" != "asset" ]; then
      cp "$generated_frame_path" "$TASK_DIR/background-$number.png"
      uv run python scripts/cli.py edit-image \\
        --images "$TASK_DIR/background-$number.png" "$CHARACTER_IMAGE" \\
        --prompt "$frame_prompt" \\
        --output-dir "$TASK_DIR" --size "1536x2048" --quality medium > "$TASK_DIR/composite-$number.json" 2>&1
      generated_frame_path="$(json_local_path "$TASK_DIR/composite-$number.json")"
      test -s "$generated_frame_path"
    fi` : ""}
    cp -f "$generated_frame_path" "$frame"
  fi
  test -s "$frame"
}

render_video() {
  local number="$1"
  local video_prompt="$2"
  local narration_text="$3"
  local frame="$TASK_DIR/frame-$number.png"
  local clip="$TASK_DIR/clip-$number.mp4"
  local narration_file="$TASK_DIR/narration-$number.txt"
  local narration_audio="$TASK_DIR/narration-$number.m4a"
  local voiced_clip="$TASK_DIR/voiced-clip-$number.mp4"
  local video_result="$TASK_DIR/video-$number.json"
  local speech_result="$TASK_DIR/speech-$number.json"
  local mux_result="$TASK_DIR/mux-$number.json"

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

  if [ ! -s "$narration_file" ]; then
    printf '%s\n' "$narration_text" > "$narration_file"
  fi
  if [ ! -s "$narration_audio" ]; then
    uv run python scripts/cli.py generate-speech \
      --text-file "$narration_file" \
      --output "$narration_audio" \
      --target-duration 4 > "$speech_result" 2>&1
  fi
  test -s "$narration_audio"

  if [ ! -s "$voiced_clip" ]; then
    uv run python scripts/cli.py mux-audio \
      --video "$clip" \
      --audio "$narration_audio" \
      --output "$voiced_clip" > "$mux_result" 2>&1
  fi
  test -s "$voiced_clip"
}

prepare_all() {
${prepareShotCalls}
  echo "首帧准备完成：请主会话逐张视觉检查 frame-NN.png 后再执行 render。"
}

render_all() {
${renderShotCalls}

  if [ ! -s "$FINAL_VIDEO" ]; then
  uv run python scripts/cli.py concat-videos \\
    --videos ${voicedClipArguments} \\
    --output "$FINAL_VIDEO" \\
    --size 720x1280 \\
    --fps 24 \\
    --fit crop \\
    --audio auto \\
    --overwrite > "$TASK_DIR/concat.json"
  fi
  test -s "$FINAL_VIDEO"

  uv run python - "$FINAL_VIDEO" "${shots.length}" ${frameArguments} ${clipArguments} ${narrationArguments} ${voicedClipArguments} <<'PY'
import json
import subprocess
import sys
from pathlib import Path

final_video, shot_count_text, *artifacts = sys.argv[1:]
shot_count = int(shot_count_text)
for path in artifacts + [final_video]:
    if not Path(path).is_file() or Path(path).stat().st_size == 0:
        raise SystemExit(f"缺少或为空的产物：{path}")
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels", "-of", "json", final_video],
    check=True,
    capture_output=True,
    text=True,
)
payload = json.loads(probe.stdout)
duration = float(payload.get("format", {}).get("duration", 0))
video = next((item for item in payload.get("streams", []) if item.get("codec_type") == "video"), {})
audio = [item for item in payload.get("streams", []) if item.get("codec_type") == "audio"]
expected = shot_count * 5
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
if len(audio) != 1:
    raise SystemExit(f"成片必须且只能包含一条音轨，实际为 {len(audio)} 条")
if audio[0].get("codec_name") != "aac":
    raise SystemExit(f"成片音频编码异常：{audio[0].get('codec_name')}，期望 aac")
PY

  cp "$FINAL_VIDEO" "$ACCOUNT_ASSETS_DIR/video-note-${input.noteTask.id}.mp4"
  FINAL_VIDEO="$ACCOUNT_ASSETS_DIR/video-note-${input.noteTask.id}.mp4"
  printf '%s\\n' "$FINAL_VIDEO" > "$TASK_DIR/video-path.txt"

  uv run python - "$TASK_DIR/result.json" "$FINAL_VIDEO" "${shots.length}" ${shellQuote(JSON.stringify(shots.map((shot) => shot.narrationText)))} ${frameArguments} ${clipArguments} ${narrationArguments} ${voicedClipArguments} <<'PY'
import json
import sys
result_path, final_video, shot_count_text, narration_json, *paths = sys.argv[1:]
shot_count = int(shot_count_text)
if len(paths) != shot_count * 4:
    raise SystemExit("故事视频产物数量与镜头数不一致")
frames, clips, narration_audio, voiced_clips = [
    paths[index * shot_count:(index + 1) * shot_count] for index in range(4)
]
with open(result_path, "w", encoding="utf-8") as handle:
    json.dump({"success": True, "finalVideo": final_video, "frames": frames, "clips": clips,
               "narrationTexts": json.loads(narration_json), "narrationAudio": narration_audio,
               "voicedClips": voiced_clips, "audio": {"codec": "aac", "provider": "volcengine"}},
              handle, ensure_ascii=False, indent=2)
PY

  test -s "$TASK_DIR/video-path.txt"
  test -s "$TASK_DIR/result.json"
  cp "$TASK_DIR/video-path.txt" "$ROOT_TASK_DIR/video-path.txt"
  cp "$TASK_DIR/result.json" "$ROOT_TASK_DIR/result.json"
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
    rm -f "$TASK_DIR/video-$number.json" "$TASK_DIR/clip-$number.mp4" \\
      "$TASK_DIR/voiced-clip-$number.mp4" "$TASK_DIR/mux-$number.json" \\
      "$FINAL_VIDEO" "$TASK_DIR/result.json" "$TASK_DIR/video-path.txt" \\
      "$ROOT_TASK_DIR/result.json" "$ROOT_TASK_DIR/video-path.txt"
    echo "已清理镜头 $number 的失败视频、混音片段和旧成片；已生成的有效旁白音频将复用。"
  done
}

case "\${1:-}" in
  prepare) prepare_all ;;
  render) render_all ;;
  reset-video) reset_video "$@" ;;
  *) echo "用法：bash $0 prepare | render | reset-video NN [NN...]" >&2; exit 64 ;;
esac
\`\`\`

## 失败与完成

失败立即返回镜头号、JSON 日志和错误；重跑脚本会复用已有首帧、视频、旁白和混音。仅当 \`video-path.txt\`、\`result.json(success=true)\` 与约15-30秒/720×1280/24fps/单 AAC 音轨成片全部存在并通过校验才完成。不得发布或保存草稿。

## 最终回复要求

回复中提供全部首帧图和最终 \`video-note-${input.noteTask.id}.mp4\`，不得只给压缩包；失败时说明镜头与错误，成功时给出成片、\`video-path.txt\`、\`result.json\` 和镜头数。

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
