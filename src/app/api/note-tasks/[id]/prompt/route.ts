import { NextResponse } from "next/server";
import { buildTaskPrompt } from "@/lib/prompt";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";
import { buildVideoDraftTask } from "@/lib/videoPrompts";

type SelectedDraft = {
  id: string;
  label: string;
  title: string;
  body: string;
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildOpenclawDraftTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  prompt: string;
  selectedDraft?: SelectedDraft;
}) {
  const { account, noteTask, prompt, selectedDraft } = input;
  const accountName = shellQuote(account.accountParam);
  const accountFlag = `--account ${accountName}`;
  const imageTaskDir = `$PWD/.tasks/xhs-image-task-${noteTask.id}`;
  const checkLoginCommand = `uv run python scripts/cli.py ${accountFlag} check-login`;
  const fillCommand = `uv run python scripts/cli.py ${accountFlag} fill-publish \\
  --title-file "$TASK_DIR/title.txt" \\
  --content-file "$TASK_DIR/content.txt" \\
  --images "\${IMAGE_PATHS[@]}"`;
  const saveCommand = `uv run python scripts/cli.py ${accountFlag} save-draft`;
  const command = `TASK_DIR="${imageTaskDir}"
ACCOUNT_NAME=${accountName}
ACCOUNT_ASSETS_DIR="$PWD/assets/$ACCOUNT_NAME"
IMAGE_PATHS=()
while IFS= read -r IMAGE_PATH; do
  [ -n "$IMAGE_PATH" ] || continue
  case "$IMAGE_PATH" in
    "$ACCOUNT_ASSETS_DIR"/*) ;;
    *) echo "图片不属于当前账号素材目录: $IMAGE_PATH" >&2; exit 1 ;;
  esac
  [ -f "$IMAGE_PATH" ] || { echo "图片不存在: $IMAGE_PATH" >&2; exit 1; }
  IMAGE_PATHS+=("$IMAGE_PATH")
done < "$TASK_DIR/image-paths.txt"
[ "\${#IMAGE_PATHS[@]}" -gt 0 ] || { echo "图片清单为空" >&2; exit 1; }
${checkLoginCommand} && \\
${fillCommand} && \\
${saveCommand}`;

  return {
    title: `${noteTask.topicTitle} Agent 图文草稿箱任务`,
    command,
    content: `# Agent 图文草稿箱任务

请使用 **xiaohongshu_auto_op** 的 **xhs-publish** skill，为指定账号生成一篇图文笔记并保存到小红书草稿箱。只允许保存草稿，严禁调用 \`publish\` 或 \`click-publish\`，不得真实发布。

## 目标账号
- 业务账号：${account.name}
- skill 账号参数：${account.accountParam}
- 单篇任务：${noteTask.topicTitle}

\`${account.accountParam}\` 必须已经配置在 xiaohongshu_auto_op 的 \`accounts.json\` 中，并对应正确的小红书登录账号。如果账号不存在、登录失效或无法确认对应关系，立即停止并报告，不得回退到默认账号。

## 上一阶段图片
- 账号素材目录：\`$PWD/assets/${account.accountParam}/\`
- 图片任务目录：\`${imageTaskDir}\`
- 图片顺序清单：\`${imageTaskDir}/image-paths.txt\`

必须先读取 \`image-paths.txt\`，按文件中的逐行顺序使用图片，并验证所有路径均为存在的本地绝对路径，而且都位于当前 skill 根目录的 \`assets/${account.accountParam}/\` 下。如果清单不存在、为空、任一图片不存在或图片属于其他账号目录，立即停止并提示重新完成“图片方案”任务，不得自行寻找或生成替代图片。

## 执行步骤
1. 进入已安装的 xiaohongshu_auto_op skill 根目录。
2. 复用图片方案阶段已创建的 \`TASK_DIR="${imageTaskDir}"\`，并确认该目录及其中的 \`image-paths.txt\` 已存在；不要再次创建或改用其他任务目录。
3. 执行登录检查：

\`\`\`bash
${checkLoginCommand}
\`\`\`

4. ${selectedDraft ? "严格使用下方已选文案版本。不得生成、改写、扩写、删减标题、正文或标签，也不得重新选择其他文风。" : "根据下方“正文生成要求”生成最终标题、正文和标签。标题必须符合 skill 的 20 单位限制；正文使用简体中文、自然分段，并把 5-6 个话题标签放在最后一行。"}
5. 只把最终标题写入 UTF-8 文件 \`$TASK_DIR/title.txt\`；只把最终正文和最后一行标签写入 UTF-8 文件 \`$TASK_DIR/content.txt\`。不要把候选标题、封面文案、图片说明或内部核验项写进发布正文。
6. 将 \`image-paths.txt\` 中的全部路径按原顺序展开到 \`--images\` 后，执行 \`fill-publish\`。该命令只填写图文发布表单，不点击发布。
7. 只有 \`fill-publish\` 成功后，才对同一个 \`${account.accountParam}\` 账号执行 \`save-draft\`，确认返回“内容已保存到草稿箱”。
8. 完成后返回最终标题、正文、图片绝对路径列表、目标账号和草稿保存结果。不要执行任何发布动作。

## 必须使用的 CLI 命令

以下命令会按顺序读取 \`image-paths.txt\`，把全部绝对路径展开到 \`--images\`：

\`\`\`bash
${command}
\`\`\`

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

${prompt}`}`
  };
}

export async function POST(request: Request, _context: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const noteTask = body.noteTask;
  const account = body.account;
  const weeklyPlan = body.weeklyPlan;
  const selectedDraft = body.selectedDraft as Partial<SelectedDraft> | undefined;
  if (!noteTask || !account || !weeklyPlan) return NextResponse.json({ error: "缺少任务上下文" }, { status: 400 });
  if (!String(account.accountParam || "").trim()) {
    return NextResponse.json({ error: "当前账号未配置智能体执行账号参数，无法生成草稿箱任务。" }, { status: 400 });
  }
  if (!String(noteTask.writingStyleName || "").trim() || !String(noteTask.writingStyleReference || "").trim()) {
    return NextResponse.json({ error: "当前笔记任务缺少已选爆款文风资料。请重新生成本周计划后再生成草稿指令。" }, { status: 400 });
  }
  if (!selectedDraft || !String(selectedDraft.label || "").trim() || !String(selectedDraft.title || "").trim() || !String(selectedDraft.body || "").trim()) {
    return NextResponse.json({ error: "请先选择一个后端 AI 生成的标题和正文版本。" }, { status: 400 });
  }

  const content = buildTaskPrompt({
    account,
    strategy: account.strategy,
    weeklyPlan,
    noteTask,
    expertRules: formatExpertRulesForPrompt(account.expertRules || [], ["title", "body", "interaction", "risk"])
  });
  const isVideo = noteTask.type === "video_text";
  const resolvedDraft: SelectedDraft = {
    id: String(selectedDraft.id || ""),
    label: String(selectedDraft.label).trim(),
    title: String(selectedDraft.title).trim(),
    body: String(selectedDraft.body).trim()
  };
  const openclawTask = isVideo
    ? { title: `${noteTask.topicTitle} Agent 视频草稿箱任务`, content: buildVideoDraftTask({ account, noteTask, bodyPrompt: content, selectedDraft: resolvedDraft }), command: "" }
    : buildOpenclawDraftTask({ account, noteTask, prompt: content, selectedDraft: resolvedDraft });
  const prompt = {
    id: Date.now(),
    accountId: account.id,
    noteTaskId: noteTask.id,
    title: noteTask.topicTitle,
    content
  };

  const commands = [
    {
      category: isVideo ? "生成视频笔记并保存到草稿箱" : "生成图文并保存到草稿箱",
      command: openclawTask.command,
      description: isVideo ? "使用视频方案阶段的成品视频，填写对应账号的视频发布表单并保存草稿。" : "使用图片方案阶段的成品图，填写对应小红书账号的图文发布表单并保存草稿。",
      safetyNote: isVideo ? "只允许 fill-publish-video 后执行 save-draft；严禁真实发布。" : "只允许 fill-publish 后执行 save-draft；严禁调用 publish 或 click-publish。"
    }
  ];

  return NextResponse.json({
    openclawTask: {
      title: openclawTask.title,
      content: openclawTask.content
    },
    prompt,
    commands
  });
}
