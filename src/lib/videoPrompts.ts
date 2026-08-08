import { completeWithBackendAi } from "@/lib/backendAiClient";

export type VideoSourceAsset = {
  id: number;
  filePath: string;
  fileUrl: string;
  fileType: string;
  tags?: string;
  suitableTypes?: string;
};

type VideoShot = {
  order: number;
  assetUrl: string;
  role: string;
  editPrompt: string;
  videoPrompt: string;
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
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

export function buildDirectVideoTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  asset: VideoSourceAsset;
}) {
  const { account, noteTask, asset } = input;
  const taskDir = `$PWD/.openclaw_tasks/xhs-video-task-${noteTask.id}`;
  return `# OpenClaw 视频准备任务

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
}) {
  const response = await completeWithBackendAi({
    instructions: "你是小红书竖屏短视频分镜策划师。根据任务信息和用户已经排序的图片文字元数据，为每张图片生成有情绪、有画面感的图片精修提示词和首帧生视频动态提示词。不得声称看过图片；允许为氛围、情绪和叙事补充创作性画面。只返回 JSON。",
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

  const taskDir = `$PWD/.openclaw_tasks/xhs-video-task-${input.noteTask.id}`;
  const assetsDir = `$PWD/assets/${input.account.accountParam}`;
  const taskDirLiteral = `.openclaw_tasks/xhs-video-task-${input.noteTask.id}`;
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

  return `# OpenClaw 图片转视频执行任务

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
    --overwrite > "$TASK_DIR/concat.json"
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

export function buildVideoDraftTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  bodyPrompt: string;
}) {
  const { account, noteTask, bodyPrompt } = input;
  const accountName = shellQuote(account.accountParam);
  const taskDir = `$PWD/.openclaw_tasks/xhs-video-task-${noteTask.id}`;
  return `# OpenClaw 视频笔记草稿箱任务

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
2. 根据下方正文要求生成最终标题、正文和 5-6 个标签，分别写入 \`$TASK_DIR/title.txt\` 和 \`$TASK_DIR/content.txt\`。
3. 执行登录检查后，用以下命令填写视频发布表单并保存草稿：

\`uv run python scripts/cli.py --account ${accountName} check-login\`

\`uv run python scripts/cli.py --account ${accountName} fill-publish-video --title-file "$TASK_DIR/title.txt" --content-file "$TASK_DIR/content.txt" --video "$FINAL_VIDEO"\`

\`uv run python scripts/cli.py --account ${accountName} save-draft\`

只有前一步成功才能继续。禁止调用 \`publish-video\` 或 \`click-publish\`。

## 正文生成要求

${bodyPrompt}`;
}
