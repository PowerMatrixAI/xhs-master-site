import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import {
  fetchMusicCandidatesFromBackend,
  isHttpsUrl,
  type MusicCandidate,
  type FeaturedVlogFramePlan,
  type FeaturedVlogMotionPlan,
  type FeaturedVlogScript,
  type FeaturedVlogTemplate,
} from "@/lib/featuredVlog";
import type { BackendAiCredentials } from "@/lib/backendAiClient";
import type { VideoSourceAsset } from "@/lib/videoPrompts";

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  const source = fenced || text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(source.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean))) : [];
}

export async function generateFeaturedVlogScript(input: {
  account: Record<string, unknown>;
  noteTask: Record<string, unknown>;
  template: FeaturedVlogTemplate;
  extraRequirements?: string;
  availableWritingStyles: string[];
  knowledgeSnapshotId?: string;
  knowledgeSourceKeys?: string[];
}) {
  const response = await completeWithBackendAi({
    instructions: "你是民宿旅行纪录片与 Vlog 编导。将体验编排模板改写成适合当前民宿的 3-6 镜头短视频脚本。只返回合法 JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `请为当前民宿账号生成一份待用户确认的精选vlog视频脚本。

要求：
- 必须根据模板的整体主线和环节编排创作，保留所有标记为必须的体验环节；最终镜头为 3-6 个，每个后续生成约 5 秒视频。
- 将账号真实业务资料用于确定地点、房型、设施、服务与活动。资料未提及的信息不得补造；不声称虚构游客是实际顾客，不生成真实顾客评价。
- suggestedMaterial 只描述镜头需要的画面类型（如入口、客房、林间步道），不要把“素材必须能证明属于本民宿或拍摄当日现场”写成选图前提。画面素材可以承接氛围和体验叙事，但不能据此宣称未核实的房型、设施或服务是本店事实。
- 如模板需要户外活动但账号资料没有已核实的具体活动，可从“登山、玩水、徒步”中选择一种作为游客视角的通用体验画面；不要称其为民宿提供的项目、已举办的活动或附近真实可达的路线/水域，不添加地点、距离、价格或开放信息。
- 遵循模板的叙事视角与视觉方向。允许采用主观镜头，或按照模板安排虚构游客角色；人物入镜时保持场景描述连贯。
- 每镜描述需可视化，给出体验阶段、镜头职责、事件动作和适合使用的素材，不写生成图片或视频的技术操作步骤。
- 输出整片情绪标签和配乐氛围标签，供后续从平台曲库匹配；不得指定、编造曲名或 URL。
- noteTask 是现有周计划笔记字段，主题应描述这条视频的体验内容；writingStyleName 必须从可选文风中选一个精确名称。

账号资料：
${JSON.stringify({
  name: input.account.name,
  accountType: input.account.accountType,
  city: input.account.city,
  personaBase: input.account.personaBase,
  targetUsers: input.account.targetUsers,
  contentDirections: input.account.contentDirections,
  businessGoals: input.account.businessGoals,
  materialCondition: input.account.materialCondition,
  taboos: input.account.taboos,
  strategy: input.account.strategy
}, null, 2)}

当前周计划视频笔记：
${JSON.stringify({ topicTitle: input.noteTask.topicTitle, contentGoal: input.noteTask.contentGoal, requiredMaterials: input.noteTask.requiredMaterials }, null, 2)}

平台模板：
${JSON.stringify({
  ...input.template,
  beats: input.template.beats.map((beat) => ({
    name: beat.name,
    shotDuty: beat.shotDuty,
    visualGuidance: beat.visualGuidance,
    required: beat.required
  }))
}, null, 2)}

用户补充要求：
${input.extraRequirements || "无"}

可选文风名称：${input.availableWritingStyles.join("、")}

只返回以下结构：
{"title":"视频脚本标题","summary":"脚本概要","perspective":"叙事视角","moodTags":["整片情绪标签"],"musicTags":["配乐标签"],"noteTask":{"topicTitle":"本周笔记主题","contentType":"精选Vlog视频","contentGoal":"","targetUser":"","painPoint":"","coreView":"","requiredMaterials":"","recommendedAssets":"","coverCopyDirection":"","commentHook":"","expectedGoal":"","writingStyleName":"精确文风名称"},"shots":[{"order":1,"beat":"体验环节","role":"镜头职责","description":"具体发生的画面和事件","suggestedMaterial":"可用实拍素材建议","subjectPresence":"pov|traveler|environment"}]}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能生成精选vlog脚本：${response.error}`);
  const parsed = extractJson(response.text);
  const rawTask = parsed?.noteTask && typeof parsed.noteTask === "object" ? parsed.noteTask as Record<string, unknown> : {};
  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : [];
  const shots = rawShots.map((raw, index) => {
    const shot = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const order = Number(shot.order);
    const beat = text(shot.beat);
    const role = text(shot.role);
    const description = text(shot.description);
    const suggestedMaterial = text(shot.suggestedMaterial);
    const subjectPresence = shot.subjectPresence;
    if (order !== index + 1 || !beat || !role || !description || !suggestedMaterial || !["pov", "traveler", "environment"].includes(String(subjectPresence))) return null;
    return { order, beat, role, description, suggestedMaterial, subjectPresence: subjectPresence as "pov" | "traveler" | "environment" };
  });
  const title = text(parsed?.title);
  const summary = text(parsed?.summary);
  const perspective = text(parsed?.perspective);
  const writingStyleName = text(rawTask.writingStyleName);
  if (!title || !summary || !perspective || shots.length < 3 || shots.length > 6 || shots.some((shot) => !shot)) {
    throw new Error("后端 AI 返回的精选vlog脚本不完整，请重试。");
  }
  if (!input.availableWritingStyles.includes(writingStyleName)) throw new Error("精选vlog脚本未选择有效的账号文风，请重新生成。");
  const noteTask: FeaturedVlogScript["noteTask"] = {
    topicTitle: text(rawTask.topicTitle),
    contentType: "精选Vlog视频",
    contentGoal: text(rawTask.contentGoal),
    targetUser: text(rawTask.targetUser),
    painPoint: text(rawTask.painPoint),
    coreView: text(rawTask.coreView),
    requiredMaterials: text(rawTask.requiredMaterials),
    recommendedAssets: text(rawTask.recommendedAssets),
    coverCopyDirection: text(rawTask.coverCopyDirection),
    commentHook: text(rawTask.commentHook),
    expectedGoal: text(rawTask.expectedGoal),
    writingStyleName,
    writingStyleReference: "",
    knowledgeSourceKeys: input.knowledgeSourceKeys || []
  };
  if (!noteTask.topicTitle || !noteTask.contentGoal) throw new Error("后端 AI 返回的精选vlog笔记信息不完整，请重试。");
  const script: FeaturedVlogScript = {
    title,
    summary,
    perspective,
    moodTags: stringArray(parsed?.moodTags),
    musicTags: stringArray(parsed?.musicTags),
    noteTask,
    shots: shots as FeaturedVlogScript["shots"]
  };
  return { script, model: response.model };
}

type FeaturedAssetReference = {
  assetKey: string;
  fileUrl: string;
  fileName: string;
  tags: string;
  suitableTypes: string;
};

function assetReferences(assets: VideoSourceAsset[]): FeaturedAssetReference[] {
  return assets.filter((asset) => isHttpsUrl(asset.fileUrl)
    && ((asset.fileType || "").toLowerCase().startsWith("image")
      || /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/iu.test(asset.fileUrl)))
    .map((asset, index) => ({
      assetKey: `A${String(index + 1).padStart(2, "0")}`,
      fileUrl: asset.fileUrl,
      fileName: asset.filePath.split(/[\\/]/u).pop() || `asset-${asset.id}`,
      tags: asset.tags || "",
      suitableTypes: asset.suitableTypes || ""
    }));
}

export async function planFeaturedVlogFrames(input: {
  script: FeaturedVlogScript;
  template: FeaturedVlogTemplate;
  assets: VideoSourceAsset[];
  credentials: BackendAiCredentials;
}) {
  const candidates = assetReferences(input.assets);
  const skeleton = input.script.shots.map((shot) => ({
    order: shot.order,
    role: shot.role,
    description: shot.description,
    frameSource: "generate",
    assetKey: "",
    framePrompt: ""
  }));
  const response = await completeWithBackendAi({
    credentials: input.credentials,
    instructions: "你是民宿旅行 Vlog 的首帧与素材规划师。依据脚本和图片文字元数据，为每个镜头规划真实素材或 AI 首帧。只返回 JSON。",
    input: `规划精选vlog每个镜头的首帧来源。

规则：
- 严格按脚本镜头数量和顺序输出，不能增删镜头。
- 优先从当前账号素材库选图：依据文件名、标签和适用类型，只要素材描述的主要场景或主体能承接镜头画面，就选择 asset。无需标签写明民宿名称、拍摄地点或日期，也无需原图已经包含游客手部、行李和完整动作；这些视角和动作可在后续精修中补充。不得声称已经看过图片或核实其拍摄地点。
- 每个素材最多使用一次，只返回候选 assetKey，不返回 URL。
- 仅在候选素材没有能承接镜头主要场景或主体的图片时选择 generate；不要因为脚本提及“真实现场”“已核验”，或素材标签只是通用场景描述，就拒绝画面匹配的素材。也不得勉强使用场景不相关的图片。
- 输出骨架中的 generate 只是待填写的默认值；有画面匹配素材时须改为 asset 并填写对应 assetKey。选用素材只代表画面匹配，不等于确认它是该民宿实拍；不得在 framePrompt 中据此补造本店招牌、房型、设施或具体地点。
- 若素材标签无法证明场地归属，在 overallDirection 中提示发布前人工核验素材与民宿的关系；不要把通用素材描述成已核验的本店现场。
- 脚本涉及尚未核实的活动时，允许从“登山、玩水、徒步”中选一种拍成不指向具体地点或民宿服务的通用体验画面；不要因缺少已核实活动而留空、暂停镜头，也不得把 AI 画面表述为真实活动记录。
- asset 的 framePrompt 描述保留原图空间和主体、补充游客视角与动作的精修要求；generate 的 framePrompt 描述场景、主体、构图、光线和摄影质感。
- POV 镜头优先通过镜头位置和手部/行走视角呈现，不必额外制造游客正脸。

脚本：
${JSON.stringify(input.script, null, 2)}

模板视觉要求：
${JSON.stringify({ visualGuidance: input.template.visualGuidance, perspectiveGuidance: input.template.perspectiveGuidance }, null, 2)}

账号素材候选：
${JSON.stringify(candidates.map(({ fileUrl: _url, ...item }) => item), null, 2)}

严格返回：
{"overallDirection":"整片方向","shots":${JSON.stringify(skeleton)}}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能规划精选vlog首帧：${response.error}`);
  const parsed = extractJson(response.text);
  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : [];
  if (rawShots.length !== input.script.shots.length) throw new Error("精选vlog首帧规划镜头数量不正确。");
  const byKey = new Map(candidates.map((asset) => [asset.assetKey, asset]));
  const used = new Set<string>();
  const framePlan = rawShots.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const frameSource = item.frameSource === "asset" ? "asset" : item.frameSource === "generate" ? "generate" : "";
    const assetKey = text(item.assetKey);
    const framePrompt = text(item.framePrompt);
    const expected = input.script.shots[index];
    if (Number(item.order) !== index + 1 || text(item.role) !== expected.role || !text(item.description) || !framePrompt || !frameSource) return null;
    if (frameSource === "asset") {
      const asset = byKey.get(assetKey);
      if (!asset || used.has(assetKey)) return null;
      used.add(assetKey);
      return { order: index + 1, role: expected.role, description: text(item.description), frameSource, assetUrl: asset.fileUrl, framePrompt };
    }
    if (assetKey) return null;
    return { order: index + 1, role: expected.role, description: text(item.description), frameSource, assetUrl: "", framePrompt };
  });
  if (framePlan.some((shot) => !shot)) throw new Error("精选vlog首帧规划包含无效素材映射，请重试。");
  return { overallDirection: text(parsed?.overallDirection) || "按脚本形成真实、连贯的民宿体验 Vlog。", framePlan: framePlan as FeaturedVlogFramePlan, model: response.model };
}

export async function planFeaturedVlogMotion(input: {
  script: FeaturedVlogScript;
  framePlan: FeaturedVlogFramePlan;
  expertRules?: string;
  credentials: BackendAiCredentials;
}) {
  if (input.framePlan.length !== input.script.shots.length) throw new Error("精选vlog首帧计划与脚本镜头数量不匹配。");
  const response = await completeWithBackendAi({
    credentials: input.credentials,
    instructions: "你是民宿体验 Vlog 导演。为每个已锁定首帧设计自然的主体动态、镜头运动及镜头间转场。只返回 JSON，不写旁白。",
    input: `根据已确认脚本和首帧规划视频动态。

硬性要求：
- 与首帧规划镜头数量、顺序完全一致，不得更换场景和镜头职责。
- 每个片段总长 5 秒；主体动态约前 4 秒，最后约 1 秒自然转场。
- 动作应真实可拍，突出入住体验和环境氛围，不添加未提供事实、招牌文字或可识别的真实顾客。
- 对未核实的活动镜头，只表现脚本所选“登山、玩水、徒步”中的通用动作，不暗示民宿实际提供、组织该活动或保证附近存在相应路线/水域。
- 不生成旁白、字幕、配乐或新增镜头。

脚本：
${JSON.stringify(input.script, null, 2)}

首帧计划：
${JSON.stringify(input.framePlan, null, 2)}

专家规则：
${input.expertRules || "暂无。"}

严格返回：
{"shots":[{"order":1,"mainVideoPrompt":"主体动态","endingTransitionPrompt":"片尾转场"}]}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能规划精选vlog动态与转场：${response.error}`);
  const parsed = extractJson(response.text);
  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : [];
  if (rawShots.length !== input.framePlan.length) throw new Error("精选vlog动态规划镜头数量不正确。");
  const motionPlan = rawShots.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const mainVideoPrompt = text(item.mainVideoPrompt);
    const endingTransitionPrompt = text(item.endingTransitionPrompt);
    return Number(item.order) === index + 1 && mainVideoPrompt && endingTransitionPrompt
      ? { order: index + 1, mainVideoPrompt, endingTransitionPrompt }
      : null;
  });
  if (motionPlan.some((shot) => !shot)) throw new Error("精选vlog动态规划结果不完整，请重试。");
  return { motionPlan: motionPlan as FeaturedVlogMotionPlan, model: response.model };
}

export async function selectFeaturedVlogMusic(input: {
  accountId: number;
  script: FeaturedVlogScript;
  credentials: BackendAiCredentials;
}) {
  const candidates = await fetchMusicCandidatesFromBackend(input.accountId, input.credentials);
  if (!candidates.length) throw new Error("平台配乐库没有可用且具备 HTTPS 下载地址的曲目，请联系管理员上传并启用配乐。");
  const musicCandidates = candidates.map((item) => ({
    id: item.id,
    name: item.name,
    tags: item.tags,
    durationSeconds: item.durationSeconds,
    mimeType: item.mimeType
  }));
  const response = await completeWithBackendAi({
    credentials: input.credentials,
    instructions: "你是视频配乐策划师。对给定的全部有效候选配乐进行相对匹配比较，必须选出与视频主题、摄影风格、节奏和情绪匹配度最高的一首。只返回合法 JSON，其中 musicId 必须是候选中的一个数字 ID，不得返回 null、空值或编造曲名、ID、链接。",
    input: `为该精选vlog选择一首整片配乐。

选曲规则：
- 下方是平台配乐库提供的全部有效候选，已经通过可用状态与下载地址校验；从中比较并选择最优的一首，不设置“足够适合才选择”的门槛。
- 优先根据曲目标签与视频主题、整体风格、情绪和节奏的语义匹配度排序，不要求标签完全相同或覆盖每一个镜头。
- 若没有完全匹配的曲目，仍须选择相对匹配度最高的一首；标签较少时结合曲目名称判断，不得因此返回空选择。
- 配乐用于贯穿整片；无需适合每个镜头的全部情绪变化。时长不足可以循环、过长可以裁切，不将时长差异作为拒选条件。
- 只依据文字元数据判断，不声称听过或分析过音频。必须返回一个候选数字 ID。

脚本：
${JSON.stringify({ title: input.script.title, summary: input.script.summary, perspective: input.script.perspective, moodTags: input.script.moodTags, musicTags: input.script.musicTags, shots: input.script.shots }, null, 2)}

候选曲目（只能返回以下 id）：
${JSON.stringify(musicCandidates, null, 2)}

格式：{"musicId":28,"reason":"为什么该曲目在现有候选中与主题和风格最匹配"}`
  });
  if (!response.ok) throw new Error(`后端 AI 未能选择配乐：${response.error}`);
  const parsed = extractJson(response.text);
  const rawMusicId = parsed?.musicId;
  const musicId = typeof rawMusicId === "number" || (typeof rawMusicId === "string" && rawMusicId.trim())
    ? Number(rawMusicId)
    : NaN;
  const selected = candidates.find((candidate) => candidate.id === musicId && isHttpsUrl(candidate.audioUrl));
  if (!Number.isInteger(musicId) || !selected) throw new Error("后端 AI 未返回候选曲库中的有效配乐 ID，请重试自动选曲。");
  return { music: selected, reason: text(parsed?.reason), model: response.model };
}

export function buildFeaturedVlogVideoTask(input: {
  account: { name: string; accountParam: string };
  noteTask: { id: number; topicTitle: string };
  template: FeaturedVlogTemplate;
  script: FeaturedVlogScript;
  framePlan: FeaturedVlogFramePlan;
  motionPlan: FeaturedVlogMotionPlan;
  music: MusicCandidate;
  overallDirection: string;
}) {
  if (input.script.shots.length < 3 || input.script.shots.length > 6
    || input.framePlan.length !== input.script.shots.length
    || input.motionPlan.length !== input.script.shots.length
    || input.framePlan.some((shot, index) => shot.order !== index + 1 || !shot.framePrompt)
    || input.motionPlan.some((shot, index) => shot.order !== index + 1 || !shot.mainVideoPrompt || !shot.endingTransitionPrompt)
    || !isHttpsUrl(input.music.audioUrl)) {
    throw new Error("精选vlog任务资料不完整，无法组装执行计划。");
  }
  const styleAnchor = input.framePlan.find((shot) => shot.frameSource === "asset" && shot.assetUrl);
  const shots = input.framePlan.map((frame, index) => ({
    ...frame,
    videoPrompt: `总时长严格为 5 秒。前约 4 秒主体动态：${input.motionPlan[index].mainVideoPrompt}；最后约 1 秒转场：${input.motionPlan[index].endingTransitionPrompt}`,
    duration: 5
  }));
  const taskDir = `.tasks/xhs-featured-vlog-${input.noteTask.id}`;
  const plan = {
    version: 1,
    kind: "featured_vlog",
    account: { name: input.account.name, accountParam: input.account.accountParam },
    noteTask: { id: input.noteTask.id, topicTitle: input.noteTask.topicTitle },
    template: { id: input.template.id, name: input.template.name },
    script: {
      title: input.script.title,
      summary: input.script.summary,
      perspective: input.script.perspective,
      moodTags: input.script.moodTags,
      musicTags: input.script.musicTags
    },
    styleReference: styleAnchor ? { source: "asset", imageUrl: styleAnchor.assetUrl } : undefined,
    music: {
      id: input.music.id,
      name: input.music.name,
      tags: input.music.tags,
      durationSeconds: input.music.durationSeconds,
      audioUrl: input.music.audioUrl
    },
    shots: shots.map((shot) => ({
      order: shot.order,
      role: shot.role,
      description: shot.description,
      frameSource: shot.frameSource,
      assetUrl: shot.assetUrl,
      framePrompt: shot.framePrompt,
      videoPrompt: shot.videoPrompt,
      duration: shot.duration
    }))
  };
  const executionSteps = `1. 保存 plan.json 后执行：\`uv run python scripts/cli.py featured-vlog prepare --plan-file "$PWD/${taskDir}/plan.json" --work-dir "$PWD/${taskDir}"\`。prepare 会从计划中的 HTTPS 地址下载唯一的整片配乐；如下载或校验失败，停止任务，不得改用其他曲目。
2. prepare 完成后，主会话必须逐张查看并验收返回的 \`frame-NN.png\`；核对原素材场景、游客视角、构图和风格连续性。素材仅按标签匹配，不能据此认定为本店实拍；若成片要作为本店真实现场展示，须人工核验归属。不通过则停止，不得直接 render。
3. 首帧验收通过后执行：\`uv run python scripts/cli.py featured-vlog render --plan-file "$PWD/${taskDir}/plan.json" --work-dir "$PWD/${taskDir}" --output "$PWD/assets/${input.account.accountParam}/video-note-${input.noteTask.id}.mp4" --size 1080x1440\`。
4. 执行器会静音生成并拼接各片段，再将计划中的同一首配乐循环或裁切至整片长度并做短淡入淡出；成片不得包含旁白，且必须只有一条 AAC 音轨。
5. 单个镜头失败时可执行 \`uv run python scripts/cli.py featured-vlog reset --plan-file "$PWD/${taskDir}/plan.json" --work-dir "$PWD/${taskDir}" --shots NN\` 后重试。不得改用其他未授权音乐，不得发布视频。`;
  return `# 精选vlog视频制作任务

请在 \`xiaohongshu_auto_op\` Skill workspace 执行。只制作视频，不发布或填写小红书表单。

- 账号：${input.account.name} / ${input.account.accountParam}
- 笔记：${input.noteTask.topicTitle}（${input.noteTask.id}）
- 模板：${input.template.name}
- 总时长：约 ${shots.length * 5} 秒；${shots.length} 段，每段 5 秒
- 配乐：${input.music.name}（${input.music.tags.join("、")}）
- 配乐下载地址：${input.music.audioUrl}
- 任务目录：\`$PWD/${taskDir}\`

## 计划文件

将下方 JSON 原样保存到 \`$PWD/${taskDir}/plan.json\`。计划类型为 \`featured_vlog\`，包含唯一的整片配乐、不含旁白 TTS；\`styleReference\` 存在时，首个已选素材图只作为 AI 补图的风格参考。

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`

## 执行要求

若任一镜头提及“活动尚未核实”或类似限制，其含义是不得宣称存在具体的真实活动，而不是暂停该镜头。允许从“登山、玩水、徒步”中选择一种，制作不指向具体地点、路线或民宿服务的通用游客体验画面；不得添加未经核实的活动名称、位置、距离、开放状态等事实，也不得称 AI 画面为真实活动记录。仍须完成计划中的全部镜头。

${executionSteps}

整片方向：${input.overallDirection || "按脚本形成真实、连贯的民宿体验 Vlog。"}
`;
}
