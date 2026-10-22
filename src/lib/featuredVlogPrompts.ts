import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import { videoAssetReferences, shortlistVideoAssets, assetMetadata, ASSET_SELECTION_RULES, type VideoAssetReference } from "@/lib/videoAssetSelection";
import { omniEnabled, styleVideoForTemplate, LINCHUAN, OMNI_SCRIPT_RULES, validateOmniScript, buildOmniTask, type ShotDirection } from "@/lib/featuredVlogOmni";
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
import { videoDeliveryRequirements } from "@/lib/videoDelivery";
import { VIDEO_SCRIPT_BUDGET, VIDEO_FRAME_BUDGET, VIDEO_MOTION_BUDGET } from "@/lib/videoPromptBudget";
import { VIDEO_SHOT_DESIGN, VIDEO_FRAME_PHOTOGRAPHY, VIDEO_MOTION_PHOTOGRAPHY } from "@/lib/videoPhotography";
import { VIDEO_TIMELINE_PROMPT, videoTimelineV2Enabled, validateVideoTimeline, videoTimelineDuration, timedMotionPrompt, type VideoTransition } from "@/lib/videoTimeline";
import { VLOG_SCENE_RULES, VlogCharacterChangeError, validateVlogScenes, vlogFrameContext, vlogMotionPrompt, type VlogCharacter, type VlogShotScene } from "@/lib/vlogScene";

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

function requireScriptFields(parsed: Record<string, unknown> | null) {
  if (!parsed) throw new Error("后端 AI 未返回可解析的脚本 JSON 对象。");
  const issues: string[] = [];
  for (const key of ["title", "summary", "perspective"]) {
    if (!text(parsed[key])) issues.push(`缺少 ${key}`);
  }
  const note = parsed.noteTask && typeof parsed.noteTask === "object" ? parsed.noteTask as Record<string, unknown> : {};
  for (const key of ["topicTitle", "contentGoal", "writingStyleName"]) {
    if (!text(note[key])) issues.push(`缺少 noteTask.${key}`);
  }
  if (!Array.isArray(parsed.shots) || parsed.shots.length < 3 || parsed.shots.length > 6) {
    issues.push("shots 必须为 3–6 个镜头的数组");
  } else {
    parsed.shots.forEach((raw, index) => {
      const shot = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      if (Number(shot.order) !== index + 1) issues.push(`镜头 ${index+1} 的 order 应为 ${index+1}`);
      for (const key of ["beat", "role", "description", "suggestedMaterial"]) {
        if (!text(shot[key])) issues.push(`镜头 ${index+1} 缺少 ${key}`);
      }
      if (!["pov", "traveler", "environment"].includes(text(shot.subjectPresence).toLowerCase())) {
        issues.push(`镜头 ${index+1} 的 subjectPresence 无效（仅允许 pov / traveler / environment）`);
      }
    });
  }
  if (issues.length) throw new Error(`后端 AI 脚本字段校验失败：${issues.join("；")}。请重试生成。`);
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
  const omni = omniEnabled();
  if (omni) styleVideoForTemplate(input.template);
  const timed = omni || videoTimelineV2Enabled();
  const response = await completeWithBackendAi({
    instructions: "你是住宿与目的地旅行纪录片、Vlog 编导。围绕所选模板主题，将民宿体验与目的地环境编排为3-6镜头脚本，室内外比重服务主题，不默认写成客房展示。只返回合法JSON。",
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys,
    input: `请为当前民宿账号生成一份待用户确认的精选vlog视频脚本。

要求：
${omni ? VLOG_SCENE_RULES.replace("模板及用户未指定时，主角倾向为20-30岁成年女性", "人物使用本轮固定林川主体") : VLOG_SCENE_RULES}
${omni ? OMNI_SCRIPT_RULES : ""}
${VIDEO_SCRIPT_BUDGET}
${VIDEO_SHOT_DESIGN}
- 必须根据模板的整体主线和环节编排创作，保留所有标记为必须的体验环节；${timed ? VIDEO_TIMELINE_PROMPT : "最终镜头为 3-6 个，每个后续生成约 5 秒视频。"}
- 先在内部规划整片场景分布，再展开镜头：民宿室内、民宿外部和目的地环境均可承担叙事，不固定室内外比例。保留模板必需内容；在资料支持且不违背主题时，安排有独立叙事职责的室外景观镜头，不能全部默认在客房、窗边、桌面完成。
- 室内承担入住、使用、休息或空间特色；室外可承担地点建立、环境发现、体验推进及情绪收束。每次换场景须推动同一主题并在continuityNote说明承接，不为凑比例插无关风景。室内窗边看景不等同于独立的室外景观镜头。
- 山水、村落、街道、绿荫与季节景观可以单独呈现，不必以登山、玩水、徒步等活动为前提，也不必每镜安排人物。避免多个客房、窗边、桌面镜头反复表达同一信息；建筑/布局主题可由室内主导，选址/景观主题可由室外主导，尊重模板差异。
- 将账号及知识库真实资料用于确定地点、房型、设施、服务、目的地景观与已有体验。没有明确室外事实时可安排不指向具体地点的通用环境氛围，不强行编造景点、距民宿距离、路线、季节状态或活动项目；不声称虚构游客是实际顾客，不生成真实顾客评价。
- suggestedMaterial 只描述镜头需要的画面类型（如入口、客房、林间步道），不要把“素材必须能证明属于本民宿或拍摄当日现场”写成选图前提。画面素材可以承接氛围和体验叙事，但不能据此宣称未核实的房型、设施或服务是本店事实。
- 如模板需要户外活动但账号资料没有已核实的具体活动，可从“登山、玩水、徒步”中选择一种作为游客视角的通用体验画面；不要称其为民宿提供的项目、已举办的活动或附近真实可达的路线/水域，不添加地点、距离、价格或开放信息。
- 遵循模板的叙事视角与视觉方向。允许采用主观镜头，或按照模板安排虚构游客角色；人物入镜时保持场景描述连贯。正面、侧面、背面均可按动作与情绪需要使用，没有统一禁止正脸的限制，不将所有人物镜头默认设计为背影。
- 模板如关联参考视频，可采用其参考说明中的节奏、构图或叙事方向；视频链接仅供人工查看，未实际读取视频画面时不得声称已观看或编造其内容。参考视频中的场景与人物不能作为当前账号的业务事实，也不能直接作为本片成片素材。
- 每镜描述需可视化，给出体验阶段、镜头职责、事件动作和适合使用的素材，不写生成图片或视频的技术操作步骤。
- 输出整片情绪标签和配乐氛围标签，供后续从平台曲库匹配；不得指定、编造曲名或 URL。
- noteTask 是现有周计划笔记字段，主题应描述这条视频的体验内容；writingStyleName 必须从可选文风中选一个精确名称。
- JSON完整性优先于篇幅目标：不能为满足字数省略字段、镜头或返回半截JSON。title、summary、perspective及noteTask.topicTitle/contentGoal/writingStyleName必须为非空字符串。
- 每镜order必须为连续数字1至N；beat、role、description、suggestedMaterial必须分别返回非空字符串，不能只返回mainAction或起止状态来替代这些字段。
- subjectPresence仅允许三个英文值：pov（第一人称，包含主观手部特写）、traveler（第三人称人物入镜，包含人物局部）、environment（纯环境）。不得返回hands、front、profile或中文视角；这些人物朝向/局部信息只填在状态characters[].view中。
- 回复前自检3-6镜头、必填字段和枚举，以及人物/时间线结构；只输出一个完整JSON对象，不省略为“同上”、省略号或Markdown说明。

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

返回以下业务字段结构，必须同时增加上述 sceneVersion、characters 和每镜 startState、mainAction、endState、characterChanges、continuityNote${timed ? "，并必须在顶层增加 timingVersion:2，在每镜增加 duration 和 transitionToNext，不能省略时间线字段" : ""}：
${JSON.stringify({
  sceneVersion: 1, ...(timed ? { timingVersion: 2 } : {}),
  ...(omni ? { productionVersion: 3 } : {}),
  characters: [{ id: "A", appearance: omni ? LINCHUAN.appearance : "默认20-30岁成年女性，五官、发型、服装固定；明确模版人物设定优先", props: ["按剧情安排的随身道具"] }],
  title: "视频脚本标题", summary: "脚本概要", perspective: "叙事视角", moodTags: ["整片情绪标签"], musicTags: ["配乐标签"],
  noteTask: { topicTitle: "本周笔记主题", contentType: "精选Vlog视频", contentGoal: "用具体画面表达模版的体验主题", targetUser: "目标观众", painPoint: "观众需求", coreView: "视频核心表达", requiredMaterials: "所需场景", recommendedAssets: "素材类型", coverCopyDirection: "封面方向", commentHook: "交流切入点", expectedGoal: "预期感受", writingStyleName: "精确文风名称" },
  shots: [{ order: 1, beat: "体验环节", role: "镜头职责", description: "具体事件摘要", suggestedMaterial: "可用素材建议", subjectPresence: "traveler",
    startState: { location: "客房", characters: [{ id: "A", position: "门口", pose: "刚入室，目光观察环境", view: "front" }], props: ["背包在游客身上"] },
    mainAction: "同一游客从门口走到窗边停步",
    endState: { location: "客房", characters: [{ id: "A", position: "窗边", pose: "自然停留观察环境，未看摄影机", view: "front" }], props: ["背包仍在游客身上"] },
    characterChanges: [], continuityNote: "首镜建立场景；后续镜头说明与上一镜的状态关系",
    ...(timed ? { duration: 4, transitionToNext: { type: "cut", duration: 0, reason: "按剧情安排相邻镜头衔接", outgoingState: "窗边停步", incomingState: "下一镜的起始状态" } } : {})
  }]
}, null, 2)}
以上为字段示例，必须根据实际模版和账号生成3-6镜头，不能直接照抄示例的房间、道具、动作或人数。`
  });
  if (!response.ok) throw new Error(`后端 AI 未能生成精选vlog脚本：${response.error}`);
  const parsed = extractJson(response.text);
  requireScriptFields(parsed);
  const rawTask = parsed?.noteTask && typeof parsed.noteTask === "object" ? parsed.noteTask as Record<string, unknown> : {};
  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : [];
  if (parsed?.sceneVersion !== 1) throw new Error("Vlog 脚本缺少人物与镜头状态，请重新生成。");
  let aiCalls = 1;
  const validateScenes = () => validateVlogScenes({ sceneVersion: 1, characters: parsed.characters as VlogCharacter[], shots: rawShots });
  try {
    validateScenes();
  } catch (error) {
    if (!(error instanceof VlogCharacterChangeError)) throw error;
    // Repair only a completed-but-inconsistent result, never retry a failed POST.
    aiCalls += 1;
    const repair = await completeWithBackendAi({
      instructions: "你是视频脚本结构校对员。只修正指定镜头的 characterChanges 和 continuityNote，不改变人物、起止画面、动作、时间线或其他镜头。只返回JSON。",
      input: `${VLOG_SCENE_RULES}\n校验反馈：${error.message}\n按起止身份集合必须使用以下变化项（补充合理reason，不得增删id或type）：${JSON.stringify(error.expectedChanges)}\n上一镜承接参考：${JSON.stringify(rawShots[error.shotIndex - 1] || null)}\n当前镜头：${JSON.stringify(rawShots[error.shotIndex])}\n只返回 {"characterChanges":[],"continuityNote":"解释本镜与上一镜的剪辑承接，不能虚构新动作"}`
    });
    if (!repair.ok) throw new Error(`${error.message} 自动校对失败：${repair.error}`);
    const patch = extractJson(repair.text);
    if (!Array.isArray(patch?.characterChanges)) throw new Error(`${error.message} 自动校对未返回有效变化记录。`);
    const original = rawShots[error.shotIndex];
    rawShots[error.shotIndex] = { ...original, characterChanges: patch.characterChanges, continuityNote: text(patch.continuityNote) || original.continuityNote };
    validateScenes(); // One repair maximum; retain strict duplicate/unknown identity checks.
  }
  if (timed) {
    if (parsed?.timingVersion !== 2) throw new Error("脚本缺少新版时间线，请重新生成。");
    validateVideoTimeline(2, rawShots);
  }
  const shots = rawShots.map((raw, index) => {
    const shot = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const order = Number(shot.order);
    const beat = text(shot.beat);
    const role = text(shot.role);
    const description = text(shot.description);
    const suggestedMaterial = text(shot.suggestedMaterial);
    const subjectPresence = text(shot.subjectPresence).toLowerCase();
    if (order !== index + 1 || !beat || !role || !description || !suggestedMaterial || !["pov", "traveler", "environment"].includes(String(subjectPresence))) return null;
    return { order, beat, role, description, suggestedMaterial, subjectPresence: subjectPresence as "pov" | "traveler" | "environment",
      startState: shot.startState as VlogShotScene["startState"], mainAction: text(shot.mainAction), endState: shot.endState as VlogShotScene["endState"], characterChanges: shot.characterChanges as VlogShotScene["characterChanges"], continuityNote: text(shot.continuityNote),
      ...(omni ? { direction: shot.direction as ShotDirection } : {}),
      ...(timed ? { duration: shot.duration as number, transitionToNext: shot.transitionToNext as VideoTransition | null } : {}) };
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
    ...(omni ? { productionVersion: 3 as const } : {}),
    sceneVersion: 1,
    characters: parsed.characters as VlogCharacter[],
    ...(timed ? { timingVersion: 2 as const } : {}),
    title,
    summary,
    perspective,
    moodTags: stringArray(parsed?.moodTags),
    musicTags: stringArray(parsed?.musicTags),
    noteTask,
    shots: shots as FeaturedVlogScript["shots"]
  };
  if (omni) {
    if (parsed.productionVersion !== 3) throw new Error("后端AI遗漏Omni脚本版本，请重试。");
    validateOmniScript(script);
  }
  return { script, model: response.model, calls: aiCalls };
}

export async function planFeaturedVlogFrames(input: {
  script: FeaturedVlogScript;
  template: FeaturedVlogTemplate;
  assets: VideoSourceAsset[];
  credentials: BackendAiCredentials;
}) {
  validateVlogScenes(input.script);
  const selection = await shortlistVideoAssets(videoAssetReferences(input.assets), input.script.shots, 14000, input.credentials);
  const candidates = selection.assets;
  if (input.script.productionVersion === 3) return planOmniScenes(input, candidates, selection.calls);
  const skeleton = input.script.shots.map((shot) => ({
    order: shot.order,
    role: shot.role,
    description: input.script.sceneVersion === 1 ? JSON.stringify(shot.startState) : shot.description,
    frameSource: "generate",
    assetKey: "",
    framePrompt: ""
  }));
  const response = await completeWithBackendAi({
    credentials: input.credentials,
    instructions: "你是民宿旅行 Vlog 的首帧与素材规划师。依据脚本和图片文字元数据，为每个镜头规划真实素材或 AI 首帧。只返回 JSON。",
    input: `规划精选vlog每个镜头的首帧来源。

规则：
${VIDEO_FRAME_BUDGET}
${VIDEO_FRAME_PHOTOGRAPHY}
${ASSET_SELECTION_RULES}
- 首帧只画起始状态的一个静态瞬间；结束状态和主要动作属于后续视频，不可同屏叠加。人物表是身份清单，不要求所有人物同时出镜；以本镜 startState.characters 为准。图片分析可提供原图人数线索但不能替代读图；已有目标人物需复用，其他人物按设计调整，生成后必须读图核验，不能机械叠加游客。
- 模板画面指导只作为场景与风格参考；若它描述了整个过程，以已确认 startState 的位置、人数和姿态作为唯一首帧，不把后续状态提前画入。
- 严格按脚本镜头数量和顺序输出，不能增删镜头。
- 脚本如包含 transitionToNext，本镜首帧应使用前一镜 transitionToNext.incomingState，并参考前一镜 outgoingState 的主体位置、构图、运动方向；真实素材仍须保留场地事实。
- 优先从当前账号素材库选图：图片分析为主要依据，文件名、标签和适用类型补充，只要素材描述的主要场景或主体能承接镜头画面，就选择 asset。无需标签写明民宿名称、拍摄地点或日期，也无需原图已经包含游客手部、行李和完整动作；这些视角和动作可在后续精修中补充。不得声称已经看过图片或核实其拍摄地点。
- 按已确认startState.location、镜头职责与suggestedMaterial匹配场景：室内镜头选室内素材，目的地景观镜头优先匹配山水、村落、街道、绿荫等环境素材，不能默认退回客房或窗边图。室内窗景不能代替脚本要求的独立室外画面；不要为多选风景而把已确认的室内动作改到室外。
- 室外选图沿用宽松语义匹配，不要求标签证明是本店实拍；选中风景只代表画面适用，不证明具体景点、路线或民宿提供项目。可用环境镜头保持无人画面，不必强行添加游客。
- 每个素材最多使用一次，只返回候选 assetKey，不返回 URL。
- 仅在候选素材没有能承接镜头主要场景或主体的图片时选择 generate；不要因为脚本提及“真实现场”“已核验”，或素材标签只是通用场景描述，就拒绝画面匹配的素材。也不得勉强使用场景不相关的图片。
- 输出骨架中的 generate 只是待填写的默认值；有画面匹配素材时须改为 asset 并填写对应 assetKey。选用素材只代表画面匹配，不等于确认它是该民宿实拍；不得在 framePrompt 中据此补造本店招牌、房型、设施或具体地点。
- 若素材标签无法证明场地归属，在 overallDirection 中提示发布前人工核验素材与民宿的关系；不要把通用素材描述成已核验的本店现场。
- 脚本涉及尚未核实的活动时，允许从“登山、玩水、徒步”中选一种拍成不指向具体地点或民宿服务的通用体验画面；不要因缺少已核实活动而留空、暂停镜头，也不得把 AI 画面表述为真实活动记录。
- asset 的 framePrompt 保留原图空间，只补充本镜起始瞬间的游客姿态；generate 同样只描述一个起始瞬间的主体、构图、光线和摄影质感。完整动作不能写成同屏多个状态。
- 按已确认的摄影视角安排人物朝向，正面、侧面、背面均可；第三人称画面可以自然呈现虚构游客正脸与表情。POV保持第一人称视点，不为展示脸而凭空新增人物；人物数量与身份始终遵循脚本。
- 使用全片人物表中的固定外观，同id不能在不同首帧换脸、换性别或年龄。startState.view=front时应能清晰看到正脸和五官，不因空间场景默认改为侧影。人物与场地构图兼顾，不以增加室内镜头来凑正脸。

脚本：
${JSON.stringify(input.script.sceneVersion === 1 ? { title: input.script.title, perspective: input.script.perspective, characters: input.script.characters, shots: input.script.shots.map(s => ({ order: s.order, role: s.role, startState: s.startState, suggestedMaterial: s.suggestedMaterial })) } : input.script, null, 2)}

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
      return { order: index + 1, role: expected.role, description: expected.description, frameSource, assetUrl: asset.fileUrl, framePrompt: vlogFrameContext(expected, input.script.characters || []) + framePrompt };
    }
    if (assetKey) return null;
    return { order: index + 1, role: expected.role, description: expected.description, frameSource, assetUrl: "", framePrompt: vlogFrameContext(expected, input.script.characters || []) + framePrompt };
  });
  if (framePlan.some((shot) => !shot)) throw new Error("精选vlog首帧规划包含无效素材映射，请重试。");
  return { overallDirection: text(parsed?.overallDirection) || "按脚本形成真实、连贯的民宿体验 Vlog。", framePlan: framePlan as FeaturedVlogFramePlan, model: response.model, calls: selection.calls + 1 };
}

async function planOmniScenes(input: { script: FeaturedVlogScript; template: FeaturedVlogTemplate; credentials: BackendAiCredentials }, candidates: VideoAssetReference[], calls: number) {
  validateOmniScript(input.script);
  const response = await completeWithBackendAi({ credentials: input.credentials,
    instructions: "你是精选Vlog场景参考选图师。只读取文字分析，不声称看过实际图片。只输出JSON。",
    input: `${ASSET_SELECTION_RULES}\n图片是场景参考，不是首帧，不需要已含主角。每图最多选一次，仅返回候选assetKey，禁止虚构URL。只在没有匹配场景时generate。保留已确认镜头职责、人数、时长、转场；脚本摄影意图不能作为拒绝可用场景的苛刻条件。场景图不先加入林川，人物由Omni主体加入。generate只写无人环境生成要求。asset只写保留空间事实的参考要求，不虚构可行走区域、光向或设施；实际图由智能体查看细化。\n每镜selectionReason最多60字、sceneDescription最多180字，保留图片分析快照由程序完成，不重复输出。\n脚本：${JSON.stringify(input.script)}\n素材：${JSON.stringify(candidates.map(assetMetadata))}\n返回 {"overallDirection":"整片方向","shots":[{"order":1,"source":"asset或generate","assetKey":"选中标识或空串","selectionReason":"匹配依据","sceneDescription":"场景参考要求"}]}`
  });
  if (!response.ok) throw new Error(`场景参考选图失败：${response.error}`);
  const parsed = extractJson(response.text);
  if (!Array.isArray(parsed?.shots) || parsed.shots.length !== input.script.shots.length) throw new Error("场景参考数量与脚本不一致。");
  const used = new Set<string>();
  const frames: FeaturedVlogFramePlan = parsed.shots.map((raw, i) => {
    const s = raw as Record<string, unknown>;
    const asset = candidates.find(a => a.assetKey === s.assetKey);
    if (s.order !== i+1 || !text(s.selectionReason) || !text(s.sceneDescription) || !["asset", "generate"].includes(String(s.source)) || (s.source === "asset" ? !asset || used.has(asset.assetKey) : !!text(s.assetKey))) throw new Error(`镜头${i+1}场景参考映射无效。`);
    if (asset) used.add(asset.assetKey);
    return { order: i+1, role: input.script.shots[i].role, description: input.script.shots[i].description,
      frameSource: s.source as "asset" | "generate", assetUrl: asset?.fileUrl || "", framePrompt: text(s.sceneDescription), aiAnalysis: asset?.aiAnalysis || "", selectionReason: text(s.selectionReason) };
  });
  return { framePlan: frames, overallDirection: text(parsed.overallDirection), model: response.model, calls: calls + 1 };
}

export async function planFeaturedVlogMotion(input: {
  script: FeaturedVlogScript;
  framePlan: FeaturedVlogFramePlan;
  expertRules?: string;
  credentials: BackendAiCredentials;
}) {
  validateVlogScenes(input.script);
  if (input.framePlan.length !== input.script.shots.length) throw new Error("精选vlog首帧计划与脚本镜头数量不匹配。");
  if (input.script.productionVersion === 3) {
    validateOmniScript(input.script);
    return { motionPlan: [], model: "confirmed-script", calls: 0 };
  }
  const response = await completeWithBackendAi({
    credentials: input.credentials,
    instructions: "你是民宿体验 Vlog 导演。为每个已锁定首帧设计自然的主体动态、镜头运动及镜头间转场。只返回 JSON，不写旁白。",
    input: `根据已确认脚本和首帧规划视频动态。

硬性要求：
${VIDEO_MOTION_BUDGET}
${VIDEO_MOTION_PHOTOGRAPHY}
- 每镜只执行本镜 startState→mainAction→endState，移动首帧中已有的同一人物。入场/离场仅按 characterChanges；手部与背影沿用同一身份。mainVideoPrompt与endingTransitionPrompt不得含下一镜的事件或人物位置，不把结束状态添加为第二个人物，不在单镜内切场景。
- 与首帧规划镜头数量、顺序完全一致，不得更换场景和镜头职责。
${input.script.sceneVersion === 1 ? "- 按本镜 duration（旧时间线为5秒）完成唯一主要动作，结尾只呈现本镜 endState。相邻镜头的衔接和叠化由后期处理，本请求不生成后续镜头的事件。" : input.script.timingVersion === 2 ? "- 严格沿用脚本 duration。关键动作在目标时长内完成，结尾自然收束，不变形成下一场景。" : "- 每个片段总长 5 秒；主体动态约前 4 秒，最后约 1 秒自然收束。"}
- 动作应真实可拍，突出入住体验和环境氛围，不添加未提供事实、招牌文字或可识别的真实顾客。
- 对未核实的活动镜头，只表现脚本所选“登山、玩水、徒步”中的通用动作，不暗示民宿实际提供、组织该活动或保证附近存在相应路线/水域。
- 不生成旁白、字幕、配乐或新增镜头。

脚本：
${JSON.stringify(input.script.sceneVersion === 1 ? { title: input.script.title, characters: input.script.characters, shots: input.script.shots.map(s => ({ order: s.order, duration: s.duration, startState: s.startState, mainAction: s.mainAction, endState: s.endState, characterChanges: s.characterChanges })) } : input.script, null, 2)}

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
  return { motionPlan: motionPlan as FeaturedVlogMotionPlan, model: response.model, calls: 1 };
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
  if (input.script.productionVersion === 3) return buildOmniTask(input);
  validateVlogScenes(input.script);
  validateVideoTimeline(input.script.timingVersion, input.script.shots);
  const timed = input.script.timingVersion === 2;
  if (timed && !videoTimelineV2Enabled()) throw new Error("新版视频时间线尚未启用，请先完成执行器与 Kling 接口验收。");
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
    videoPrompt: input.script.sceneVersion === 1 ? vlogMotionPrompt(input.script.shots[index], input.motionPlan[index].mainVideoPrompt, input.motionPlan[index].endingTransitionPrompt, timed ? input.script.shots[index].duration! : 5, input.script.characters || []) : timed ? timedMotionPrompt(input.script.shots[index], input.motionPlan[index].mainVideoPrompt, input.motionPlan[index].endingTransitionPrompt, input.script.shots[index - 1]?.transitionToNext?.incomingState) : `总时长严格为 5 秒。前约 4 秒主体动态：${input.motionPlan[index].mainVideoPrompt}；最后约 1 秒转场：${input.motionPlan[index].endingTransitionPrompt}`,
    duration: timed ? input.script.shots[index].duration! : 5,
    ...(timed ? { transitionToNext: input.script.shots[index].transitionToNext } : {})
  }));
  const taskDir = `.tasks/xhs-featured-vlog-${input.noteTask.id}`;
  const plan = {
    version: timed ? 2 : 1,
    kind: "featured_vlog",
    ...(input.script.sceneVersion === 1 ? { sceneVersion: 1, characters: input.script.characters } : {}),
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
      duration: shot.duration,
      ...(input.script.sceneVersion === 1 ? { startState: input.script.shots[shot.order - 1].startState, mainAction: input.script.shots[shot.order - 1].mainAction, endState: input.script.shots[shot.order - 1].endState, characterChanges: input.script.shots[shot.order - 1].characterChanges, continuityNote: input.script.shots[shot.order - 1].continuityNote } : {}),
      ...(timed ? { transitionToNext: shot.transitionToNext } : {})
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
- 总时长：约 ${videoTimelineDuration(input.script.shots, input.script.timingVersion)} 秒；${shots.length} 段，${timed ? "按脚本时长裁切并执行结构化转场；需要支持 version=2 的执行器。必须查看成片动作完整性与转场观感，不能仅检查时长。resolved-plan.json 记录实际时间线。" : "每段 5 秒"}
- 配乐：${input.music.name}（${input.music.tags.join("、")}）
- 配乐下载地址：${input.music.audioUrl}
- 任务目录：\`$PWD/${taskDir}\`

## 计划文件

将下方 JSON 原样保存到 \`$PWD/${taskDir}/plan.json\`。计划类型为 \`featured_vlog\`，包含唯一的整片配乐、不含旁白 TTS；\`styleReference\` 存在时，首个已选素材图只作为 AI 补图的风格参考。

\`\`\`json
${JSON.stringify(plan)}
\`\`\`

## 执行要求

若任一镜头提及“活动尚未核实”或类似限制，其含义是不得宣称存在具体的真实活动，而不是暂停该镜头。允许从“登山、玩水、徒步”中选择一种，制作不指向具体地点、路线或民宿服务的通用游客体验画面；不得添加未经核实的活动名称、位置、距离、开放状态等事实，也不得称 AI 画面为真实活动记录。仍须完成计划中的全部镜头。

${executionSteps}

${videoDeliveryRequirements(input.noteTask.id)}

跨镜头人物锁定：同id保持同一五官、发型、服装。已有清晰正脸首帧时用作参考；无正脸则说明参考局限，不为凑参考改变视角或加人。后续人物不一致时用 edit-image，输入“当前首帧＋人物参考首帧”，前者约束场地、人数和姿态，后者只约束外观。更新对应 frame-NN.png，验收后render并通过飞书发最终首帧；不复制人物。

视觉验收：核对起止人数、身份、道具与动作完整性；人数不符先修首帧，视频复制则重试动态。查看原图及首帧，不能仅凭标签认定。检查观看重点、前后景及合理阴影，避免全片居中摆拍、重复走停转头、过度磨皮或假抖动；正脸不要求看镜头。检查切点与衔接，不只验时长。

整片方向：${input.overallDirection || "按脚本形成真实、连贯的民宿体验 Vlog。"}
`;
}
