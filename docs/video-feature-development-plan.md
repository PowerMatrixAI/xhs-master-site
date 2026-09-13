# 小红书视频功能完整开发方案

> 状态：待开发
> 版本：V3 轻量实现版
> 更新日期：2026-08-01
> 适用项目：`xhs-master-site`、`xhs_server`、`xiaohongshu_auto_op`

## 1. 文档目的

本文档定义小红书视频功能第一阶段的最终实现方案，作为前端、服务端和 OpenClaw 三方开发依据。

本方案遵循一个核心原则：

> 视频方案与当前图片方案保持相同的数据模型。服务端保存素材和最终 OpenClaw 执行指令，不单独保存生成前的素材选择、镜头排序和逐镜头编辑状态。

因此，第一阶段不新增视频方案表和视频镜头表，不引入 `note_task_video_plans` 或 `note_task_video_shots`。所有逐镜头信息均写入最终的 `note_tasks.plan` 文本。

## 2. 建设目标

在现有“周计划 -> 图片方案 -> 笔记草稿”图文工作流之外，增加完整的视频笔记工作流：

1. 周计划能够区分图文笔记和视频笔记。
2. 视频笔记进入独立的“视频方案”模块。
3. 用户可以上传或从素材库选择一个视频直接使用。
4. 用户可以选择 2-6 张素材库图片生成多段视频并拼接。
5. 系统生成一份完整、可直接交给 OpenClaw 的视频执行指令。
6. 最终视频执行指令保存到单篇任务的 `plan` 字段。
7. 刷新页面或更换设备后能够恢复并复制最终视频指令。
8. 本站不执行图片精修、图生视频、视频拼接或真实发布。
9. OpenClaw 使用 `xiaohongshu_auto_op` 完成实际视频任务并保存小红书草稿。

## 3. 产品边界

### 3.1 第一阶段支持

- 图文笔记类型：`image_text`
- 视频笔记类型：`video_text`
- 上传一个视频并直接使用，不做视频精修。
- 从当前账号素材库选择一个视频直接使用。
- 手动选择并排序 2-6 张素材库图片。
- 文本 AI 根据单篇任务和图片元数据生成逐镜头方案。
- OpenClaw 依次完成图片精修、图生视频和视频拼接。
- 视频与正文一起填写到指定小红书账号并保存草稿箱。
- 视频素材和最终执行指令持久化。

### 3.2 第一阶段不支持

- 纯文生视频。
- 对用户上传的视频执行 AI 精修。
- 普通“图片生成视频”模式不自动生成旁白、字幕和背景音乐；“创意故事视频”扩展模式支持火山引擎单一旁白，不支持字幕、背景音乐、角色多音色或口型同步。
- 自动选择小红书站内音乐。
- 复杂转场特效。
- 在 `xhs-master-site` 或 `xhs_server` 上执行视频生成。
- 未经用户确认自动发布小红书笔记。
- 在刷新后恢复生成前的素材勾选状态。
- 在刷新后恢复可编辑的镜头排序表单。
- 将逐镜头 Prompt 拆成服务端结构化记录。

用户直接提供的视频可以保留原音。普通图片生成的视频默认无音频，拼接时丢弃音轨；创意故事视频只传递 version=1 的紧凑 `plan.json`，由 `xiaohongshu_auto_op story-video prepare/render/reset` 负责首帧、Kling、火山旁白、混音、拼接、验收和断点续跑。

## 4. 总体流程

```text
用户设置本周总篇数和视频篇数
-> 周计划 AI 生成 image_text / video_text 任务
-> 服务端保存周计划并返回真实任务 ID
-> 视频任务进入“视频方案”
-> 用户选择直接视频或图片生成视频
-> 直接视频：前端生成模板化 OpenClaw 指令
-> 图片生成视频：后端文本 AI 生成逐镜头方案
-> 前端将逐镜头方案组装为完整 OpenClaw 指令
-> 服务端把最终指令保存到 note_tasks.plan
-> 用户复制指令给 OpenClaw
-> OpenClaw 下载素材并完成视频处理
-> 笔记草稿模块生成正文与视频草稿箱指令
-> OpenClaw 填写视频笔记并保存草稿箱
```

职责划分：

| 模块 | 职责 |
| --- | --- |
| `xhs-master-site` | 页面交互、周计划生成、视频方案 AI 调用、指令组装和复制 |
| `xhs_server` | 任务、素材和最终 `plan` 持久化，账号与任务归属校验 |
| `xiaohongshu_auto_op` | 下载素材、图片精修、图生视频、拼接、填写视频笔记、保存草稿 |

## 5. 数据模型

### 5.1 单篇任务

视频与图片统一使用 `note_tasks`：

| API 字段 | 数据库建议字段 | 含义 |
| --- | --- | --- |
| `id` | `id` | 服务端真实任务 ID |
| `type` | `type` | `image_text` 或 `video_text` |
| `requiredMaterials` | `required_materials` | 当前帖子需要的通用素材 |
| `plan` | `plan` | 最终可复制给 OpenClaw 的执行指令 |
| `bodyDraft` | `body_draft` | 配套正文或正文结果 |

`plan` 根据 `type` 解释：

- `image_text`：图片方案及 OpenClaw 图片执行指令。
- `video_text`：视频方案及 OpenClaw 视频执行指令。

不增加或继续使用：

```text
postFormat
requiredImages
imagePlan
videoPlan
videoCount
note_task_video_plans
note_task_video_shots
```

### 5.2 素材

图片和视频统一保存在现有素材表：

| 字段 | 含义 |
| --- | --- |
| `id` | 素材服务端 ID |
| `filePath` | COS 对象路径 |
| `fileUrl` | OpenClaw 可下载的公网 URL |
| `fileType` | `image` 或 `video` |
| `sourceType` | `real` 或其他服务端允许值 |
| `tags` | 素材标签 |
| `suitableTypes` | 适用内容类型 |
| `width` | 宽度 |
| `height` | 高度 |
| `sizeBytes` | 文件大小 |
| `hash` | 文件哈希 |

视频文件本身的路径、URL、类型和基础信息只保存在素材表，不写入单篇任务的额外结构表。

### 5.3 视频逐镜头信息

图片生成视频模式需要的以下信息：

- 图片 URL
- 图片顺序
- 每张图片的用途
- 每张图片的精修 Prompt
- 每段视频 Prompt
- 每段时长
- 拼接顺序和参数
- 验收要求

全部写入最终 OpenClaw 指令，并整体保存到 `note_tasks.plan`。

服务端不拆解、不解析、不单独保存这些内容。

### 5.4 视频数量

“本周视频笔记数量”只作为生成周计划前的临时参数，不保存到周计划表。

保存后动态统计：

```ts
const videoCount = noteTasks.filter((task) => task.type === "video_text").length;
const imageTextCount = noteTasks.filter((task) => task.type === "image_text").length;
```

## 6. 服务端详细实现方案

本节可以直接作为 `xhs_server` 的开发依据。

### 6.1 服务端需要支持的任务字段

确保单篇任务支持：

```text
type
requiredMaterials
plan
bodyDraft
```

约束：

```text
type IN ('image_text', 'video_text')
```

历史数据迁移：

- 空 `type` 统一为 `image_text`。
- 原 `requiredImages` 或 `required_images` 迁移到 `requiredMaterials`。
- 原 `imagePlan` 或 `image_plan` 迁移到 `plan`。
- 迁移完成后，旧字段停止读写。

### 6.2 保存周计划

接口：

```text
POST /client/account/v1/saveWeeklyPlan
```

请求中的每个任务必须包含：

```json
{
  "type": "video_text",
  "publishAt": "2026-08-06",
  "contentType": "路线实拍",
  "contentGoal": "降低路线理解成本",
  "topicTitle": "这段林线适不适合新手",
  "targetUser": "户外新手",
  "painPoint": "图片无法表现坡度",
  "coreView": "用连续镜头展示真实路况",
  "bodyStructure": "",
  "requiredMaterials": "路线现场图或一段真实视频",
  "recommendedAssets": "",
  "coverCopyDirection": "",
  "commentHook": "",
  "expectedGoal": "",
  "status": "待生成",
  "bodyDraft": "",
  "plan": ""
}
```

保存规则：

- 新建周计划不传周计划 `id`。
- 新建任务不传任务 `id`。
- 更新时已有任务传服务端真实 `id`。
- 删除任务时从 `noteTasks` 数组移除。
- `frequency` 必须等于 `noteTasks.length`。
- `type` 只能是 `image_text` 或 `video_text`。
- 不接收 `videoCount`。
- 不接收 `postFormat`、`requiredImages`、`imagePlan` 或 `videoPlan`。
- 保存成功后返回带真实 ID 的完整周计划和任务数组。

前端必须使用响应数据替换当前周计划，不能继续使用本地临时任务 ID。

### 6.3 保存单篇任务

接口：

```text
POST /client/account/v1/saveNoteTask
```

保存视频方案时请求：

```json
{
  "accountId": 12,
  "weeklyPlanId": 30,
  "noteTask": {
    "id": 66,
    "type": "video_text",
    "publishAt": "2026-08-06",
    "contentType": "路线实拍",
    "contentGoal": "降低路线理解成本",
    "topicTitle": "这段林线适不适合新手",
    "targetUser": "户外新手",
    "painPoint": "图片无法表现坡度",
    "coreView": "用连续镜头展示真实路况",
    "bodyStructure": "",
    "requiredMaterials": "路线现场图或一段真实视频",
    "recommendedAssets": "",
    "coverCopyDirection": "",
    "commentHook": "",
    "expectedGoal": "",
    "status": "方案已生成",
    "bodyDraft": "",
    "plan": "# OpenClaw 视频执行任务\n..."
  }
}
```

服务端负责：

1. 校验当前用户拥有该账号。
2. 校验周计划属于当前账号。
3. 校验任务属于该账号和周计划。
4. 校验 `type` 合法。
5. 保存完整 `plan` 文本，不解析其中逐镜头内容。
6. 返回更新后的完整任务。

### 6.4 切换帖子类型

服务端当前不会因为切换 `type` 自动清空 `plan`，因此第一阶段由前端负责一致性：

1. 切换前检查任务是否已有 `plan`。
2. 已有方案时弹出确认提示。
3. 用户确认后，将新 `type` 与 `plan: ""` 一起提交。
4. 使用服务端响应更新任务。

服务端应允许前端显式提交空 `plan`，并正确覆盖旧值。

不建议服务端在没有前端确认的情况下自动删除 `plan`，避免意外丢失用户已生成的执行指令。

### 6.5 视频素材上传

支持格式：

```text
mp4
mov
m4v
webm
```

获取单个上传地址：

```text
POST /client/cos/v1/signedUploadUrl
```

请求：

```json
{
  "type": "video",
  "ext": "webm"
}
```

获取批量上传地址：

```text
POST /client/cos/v1/batchSignedUploadUrl
```

请求：

```json
{
  "type": "video",
  "exts": ["mp4", "mov", "m4v", "webm"]
}
```

上传完成后保存素材：

```text
POST /client/account/v1/saveAssets
```

```json
{
  "accountId": 12,
  "assets": [
    {
      "filePath": "/xhs/video/20260801/uuid.webm",
      "fileType": "video",
      "sourceType": "real",
      "location": "",
      "shotAt": "",
      "tags": "",
      "suitableTypes": "",
      "coverReady": false,
      "used": false,
      "authorizationState": "",
      "riskNotes": "",
      "width": 0,
      "height": 0,
      "sizeBytes": 0,
      "hash": ""
    }
  ]
}
```

服务端要求：

- 校验 `type=video` 和扩展名。
- 使用签名接口返回的 `file` 作为 `filePath`。
- `saveAssets` 返回素材真实 ID 和稳定公网 `fileUrl`。
- 公网 URL 必须能被 OpenClaw 所在机器下载。
- 不把 COS 中已经不存在的对象作为可用素材返回。
- 应用、网关、Nginx 和 COS 的大小限制应覆盖产品允许的视频大小。

### 6.6 账号详情

接口：

```text
POST /client/account/v1/detail
```

视频任务返回：

```json
{
  "id": 66,
  "type": "video_text",
  "requiredMaterials": "路线现场图或一段真实视频",
  "bodyDraft": "",
  "plan": "# OpenClaw 视频执行任务\n..."
}
```

账号详情中的素材需要同时返回图片和视频，并通过 `fileType` 区分。

不返回：

```text
videoPlan 对象
videoShots 数组
videoCount
```

### 6.7 通用响应

所有接口统一返回：

```json
{
  "status": true,
  "data": {},
  "message": "",
  "code": ""
}
```

前端必须判断响应体 `status`，不能只判断 HTTP 状态码。

### 6.8 服务端不需要实现的内容

第一阶段服务端不需要：

- 视频方案专用数据库表。
- 视频镜头数据库表。
- 视频方案专用保存接口。
- 逐镜头 Prompt 解析和校验。
- 在服务端执行视频生成。
- 在服务端执行视频拼接。
- 保存 OpenClaw 本机的最终视频路径。

逐镜头信息只是最终 `plan` 文本的一部分。

## 7. 前端数据结构

```ts
type NoteTaskType = "image_text" | "video_text";

type NoteTask = {
  id: number;
  type: NoteTaskType;
  requiredMaterials: string;
  plan: string;
  bodyDraft: string;
};
```

视频方案生成过程可以使用临时前端类型：

```ts
type VideoSourceMode = "direct_video" | "image_to_video";

type VideoShotPlan = {
  sortOrder: number;
  assetId: number;
  sourceUrl: string;
  purpose: string;
  imageEditPrompt: string;
  videoPrompt: string;
  duration: 5 | 10;
  reviewNotes: string;
};

type VideoPlanResult = {
  narrativeGoal: string;
  shots: VideoShotPlan[];
  concatRequirements: string[];
};
```

这些临时结构只用于当前页面和组装 OpenClaw 指令，不直接保存到服务端。

禁止继续使用：

```text
postFormat
requiredImages
imagePlan
videoPlan 字符串字段
```

## 8. 一周计划改造

### 8.1 用户设置

“本周目标设置”增加“本周视频笔记数量”：

- 最小值为 0。
- 最大值等于本周总篇数。
- 每周少于 3 篇时默认 0。
- 每周 3 篇及以上时默认 1。
- 只用于本次周计划生成，不保存独立字段。

内容分配区域同时显示：

- 图文笔记数量
- 视频笔记数量

### 8.2 AI 生成

周计划 AI Prompt 增加：

- 严格生成用户指定数量的 `video_text`。
- 其余任务为 `image_text`。
- 空间动线、路线实拍、制作过程、使用过程、前后变化等优先作为视频。
- 静态清单、政策说明和 FAQ 优先作为图文。
- JSON 输出字段使用 `type`。
- 素材要求字段使用 `requiredMaterials`。

AI 返回后校验数量，不符合时按照视频适配度进行确定性修正。

### 8.3 真实任务 ID

- 新任务不向服务端提交前端临时 ID。
- 前端列表可以使用单独的 `clientKey`。
- 保存后必须使用服务端响应替换本地任务。
- OpenClaw 任务目录使用服务端真实 `noteTask.id`。

### 8.4 手动切换类型

- 切换前检查 `plan`。
- 已有方案时提示该方案将失效。
- 用户确认后提交新 `type` 和空 `plan`。
- 不允许图片方案继续显示在视频任务中，反之亦然。

## 9. 视频方案页面

导航顺序：

```text
图片方案
视频方案
笔记草稿
```

页面只展示 `type=video_text` 的任务。

### 9.1 模式一：直接使用视频

支持：

- 本地上传一个视频。
- 从当前账号素材库选择一个视频。
- 支持 MP4、MOV、M4V、WEBM。
- 使用 `<video>` 预览真实内容。
- 不调用后端文本 AI。
- 不执行视频精修和拼接。

生成模板化 OpenClaw 指令，包含：

1. 账号名称和账号参数。
2. 单篇任务信息。
3. 指定视频公网 URL。
4. 下载到账号素材目录的要求。
5. 文件存在且非空检查。
6. 将最终绝对路径写入 `video-path.txt`。
7. 禁止重新生成、拼接和发布。

生成后调用 `saveNoteTask`，把完整指令保存到 `noteTask.plan`。

### 9.2 模式二：素材库图片生成视频

支持：

- 手动选择 2-6 张素材库图片。
- 使用缩略图和放大预览查看内容。
- 按选择顺序加入镜头列表。
- 支持拖动或按钮调整顺序。
- 默认每段 5 秒。
- 默认 `std` 模式。
- 默认输出 720x1280、24fps。
- 点击生成后调用一次后端文本 AI。

页面刷新后只恢复已经保存的最终 `plan`，不恢复生成前的勾选和排序状态。

## 10. 视频方案 AI

### 10.1 输入

- 完整账号策划案。
- 当前周计划。
- 单篇任务类型、主题、目标、用户痛点、正文方向和互动目标。
- `requiredMaterials`。
- 用户选择的图片顺序。
- 图片 ID、有效 URL、标签、来源类型和风险备注。
- 当前账号启用的 `cover`、`video_plan`、`risk` 专家规则。

后端文本 AI 不读取图片像素，只根据任务信息和素材元数据生成计划。OpenClaw 执行时读取真实图片。

### 10.2 输出

```ts
type VideoShotPlan = {
  sortOrder: number;
  assetId: number;
  sourceUrl: string;
  purpose: string;
  imageEditPrompt: string;
  videoPrompt: string;
  duration: 5 | 10;
  reviewNotes: string;
};

type VideoPlanResult = {
  narrativeGoal: string;
  shots: VideoShotPlan[];
  concatRequirements: string[];
};
```

校验要求：

- AI 不得新增用户未选择的素材 ID。
- 默认保持用户选择的素材顺序。
- 每张图片对应一条镜头记录。
- 每条必须包含精修 Prompt 和图生视频 Prompt。
- 时长只能为 5 或 10 秒。
- 不得伪造图片中没有依据的地点、人物、产品、路线或事件。
- 解析失败时不保存部分结果。

### 10.3 前端 BFF API Route

新增：

```text
POST /api/note-tasks/[id]/video-prompt
GET  /api/note-tasks/[id]/video-prompt?uuid=...
```

- `direct_video` 同步生成固定模板，不调用 AI。
- `image_to_video` 调用现有后端异步文本 AI并轮询结果。
- BFF 解析 AI JSON并校验素材 ID、顺序和时长。
- BFF 将结果组装成完整 OpenClaw 指令。
- 前端调用 `saveNoteTask` 将指令保存到 `plan`。

## 11. `xiaohongshu_auto_op` 执行基线

开发前必须核对 `xiaohongshu_auto_op` 当前版本的 `SKILL.md`、子技能文档和 `scripts/cli.py`。以下命令以当前已知实现为基线，实际开发时以 skill 代码为准。

### 11.1 图片精修

```bash
uv run python scripts/cli.py edit-image \
  --prompt "$IMAGE_PROMPT" \
  --images "$INPUT_IMAGE" \
  --output-dir "$REFINED_FRAMES_DIR" \
  --size "1536x2048" \
  --quality "medium"
```

使用返回 JSON 中的 `local_path` 作为后续首帧图。

### 11.2 单段图生视频

```bash
uv run python scripts/cli.py generate-video \
  --first-frame-image "$REFINED_IMAGE" \
  --video-prompt "$VIDEO_PROMPT" \
  --duration "5" \
  --mode "std" \
  --sound "off" \
  --output-dir "$SEGMENTS_DIR"
```

### 11.3 视频拼接

```bash
uv run python scripts/cli.py concat-videos \
  --videos "${SEGMENT_PATHS[@]}" \
  --output "$FINAL_VIDEO" \
  --size "720x1280" \
  --fps 24 \
  --fit crop \
  --audio drop
```

### 11.4 视频草稿箱

```bash
uv run python scripts/cli.py --account "$ACCOUNT_NAME" fill-publish-video \
  --title-file "$TASK_DIR/title.txt" \
  --content-file "$TASK_DIR/content.txt" \
  --video "$FINAL_VIDEO"

uv run python scripts/cli.py --account "$ACCOUNT_NAME" save-draft
```

只允许执行 `fill-publish-video` 和 `save-draft`，禁止执行真实发布命令。

## 12. OpenClaw 视频任务规范

任务目录：

```text
$PWD/.openclaw_tasks/xhs-video-task-${noteTaskId}
```

目录结构：

```text
source-images/
refined-frames/
segments/
video-path.txt
```

图片生成视频的执行顺序：

1. 主会话进入 `xiaohongshu_auto_op` 根目录。
2. 主会话创建任务目录和账号素材目录。
3. 主会话下载全部原图并按镜头顺序保存清单。
4. 主会话检查文件存在且非空。
5. 主会话完成初始化后，才允许把图片精修、逐段视频生成和验收交给后台子会话。
6. 子会话按顺序逐张执行 `edit-image`。
7. 使用精修结果 `local_path` 执行 `generate-video`。
8. 收集每段视频的 `local_path`。
9. 严格按照镜头顺序执行 `concat-videos`。
10. 将最终视频保存到 `$PWD/assets/${ACCOUNT_NAME}/`。
11. 将最终绝对路径写入 `video-path.txt`。

禁止把未经初始化的整个任务直接交给子会话。

## 13. 画幅方案

第一阶段：

```text
精修图：1536x2048
最终视频：720x1280
帧率：24fps
拼接方式：crop
```

所有图片精修 Prompt 必须要求核心主体位于中央 9:16 安全区域，降低裁切丢失主体的风险。

## 14. 视频笔记草稿箱

“笔记草稿”根据 `type` 分流。

### `image_text`

- 必须先有图片 `plan`。
- 读取 `image-paths.txt`。
- 执行图文填写和 `save-draft`。

### `video_text`

- 必须先有非空视频 `plan`。
- 读取 `video-path.txt`。
- 生成标题和正文。
- 执行 `fill-publish-video`。
- 执行 `save-draft`。

视频任务没有非空 `plan` 时，禁用“生成视频笔记草稿箱指令”。

## 15. 首页快捷通道

- 图文任务显示：生成图片方案、生成文字方案。
- 视频任务显示：生成视频方案、生成文字方案。
- 视频来源必须由用户选择，首页不能静默决定来源模式。
- 视频 `plan` 为空时显示“前往生成视频方案”。
- 视频 `plan` 非空后才允许生成和复制视频草稿箱指令。

## 16. 服务端修改清单

服务端需要确保：

1. `note_tasks` 支持 `type`、`requiredMaterials`、`plan`。
2. `saveWeeklyPlan` 支持混合保存 `image_text` 和 `video_text`。
3. `saveNoteTask` 能够保存和清空完整 `plan`。
4. 新建任务时允许省略 `id`。
5. 更新任务时返回服务端真实任务 ID。
6. 视频上传支持 MP4、MOV、M4V、WEBM。
7. 视频素材通过 `saveAssets` 保存并返回稳定公网 URL。
8. 账号详情同时返回图片和视频素材。
9. 账号详情返回任务的 `type`、`requiredMaterials`、`plan`。
10. 不返回 COS 中已经失效的素材作为可用素材。
11. 所有接口校验账号、周计划、任务和素材归属。
12. 所有接口使用统一 `status/data/message/code` 响应。

服务端不需要新增：

- `videoCount`
- `postFormat`
- `note_tasks.video_plan`
- `note_task_video_plans`
- `note_task_video_shots`
- 视频方案专用保存、详情和删除接口

## 17. 前端改动范围

主要修改：

- `src/app/components/XhsMasterApp.tsx`
- `src/lib/api.ts`
- `src/lib/llm.ts`
- `src/lib/weeklyPlan.ts`
- `src/lib/markdown.ts`
- `src/app/api/weekly-plans/generate/route.ts`
- `src/app/api/note-tasks/[id]/prompt/route.ts`
- `src/app/api/assets/upload/route.ts`

新增：

- `src/lib/videoPlanningLlm.ts`
- `src/lib/videoPrompts.ts`
- `src/app/api/note-tasks/[id]/video-prompt/route.ts`

## 18. 开发顺序

1. 前后端全局迁移为 `type`、`requiredMaterials`、`plan`。
2. 修正周计划和单篇任务的真实 ID 回写。
3. 验证现有图文流程在通用字段下正常工作。
4. 增加周计划视频篇数设置和 `video_text` 生成。
5. 增加视频素材上传、预览和选择。
6. 新增视频方案页面和直接视频模式。
7. 实现图片生成视频的异步文本 AI 方案。
8. 将最终 OpenClaw 指令保存到 `noteTask.plan`。
9. 按 `type` 改造笔记草稿和首页快捷通道。
10. 完成视频功能后接入专家复盘的 `video_plan` 规则。

## 19. 验收标准

### 数据和接口

- 周计划能够保存图文和视频混合任务。
- 新任务不提交前端临时 ID。
- 保存后使用服务端真实任务 ID。
- `frequency` 与任务数量一致。
- 视频数量由任务类型动态统计。
- 视频执行指令完整保存在 `note_tasks.plan`。
- 类型切换后不存在不兼容的旧 `plan`。
- 刷新后能够查看并复制最终视频指令。
- 失效素材不会出现在可用素材列表中。

### 视频方案

- 用户可以上传或选择一个视频生成直接使用任务。
- 用户可以选择并排序 2-6 张图片。
- AI 为每张图片生成图片精修 Prompt 和图生视频 Prompt。
- 最终指令包含素材 URL、镜头顺序、时长、Prompt 和拼接要求。
- 生成失败时不覆盖已有 `plan`。
- 保存失败时不显示成功状态。

### OpenClaw

- 指令使用当前 skill 真实存在的 CLI 和参数。
- 主会话先完成目录创建、下载和文件检查。
- 图片依次精修并生成视频。
- 视频按照指定顺序拼接。
- 最终路径写入 `video-path.txt`。
- 视频笔记只保存草稿，不执行真实发布。

### 前端体验

- 所有执行按钮具有 loading 状态。
- 视频素材可以预览。
- 类型切换有明确确认提示。
- 图片方案和视频方案不会互相串用。
- 桌面端和移动端不存在容器溢出、文字重叠或无法操作。

## 20. 回归测试

至少覆盖：

1. 历史图文任务迁移后正常显示图片方案。
2. 新建全图文周计划。
3. 新建图文与视频混合周计划。
4. 更新已有周计划并新增视频任务。
5. 图文切换视频并清空旧图片 `plan`。
6. 视频切换图文并清空旧视频 `plan`。
7. 上传 MP4、MOV、M4V、WEBM。
8. 直接视频模式生成、保存、刷新和复制。
9. 图片生成视频模式生成、保存、刷新和复制。
10. 素材 URL 无效时前端阻止生成。
11. AI 返回非法素材 ID、非法时长或重复顺序时不保存。
12. 视频方案生成成功但保存失败时不显示成功。
13. 视频草稿箱指令能够读取 `video-path.txt`。
14. 图文工作流不受视频功能影响。

## 21. 后续演进

第一阶段只保存最终指令，因此无法恢复生成前的素材勾选和镜头编辑状态。

如果未来图片方案和视频方案都需要跨设备恢复可编辑状态，应统一设计：

```text
note_task_plans
note_task_plan_assets
note_task_plan_steps
```

该通用模型应同时服务图片和视频，不应只为视频增加专用 `video_shots` 表。
