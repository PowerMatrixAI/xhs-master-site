import type { FeaturedVlogScript, FeaturedVlogFramePlan, FeaturedVlogTemplate, MusicCandidate, FeaturedVlogResolution } from "./featuredVlog";
import { validateVideoTimeline, videoTimelineDuration } from "./videoTimeline";
import { validateVlogScenes } from "./vlogScene";
import type { VlogSceneState } from "./vlogScene";
import { VLOG_REFERENCE_STYLE_RULE } from "./featuredVlogTemplateRules";
import { VLOG_CHARACTERS, vlogCharacterSelection, type VlogCharacterSelection } from "./vlogCharacters";

export const LINCHUAN = VLOG_CHARACTERS.linchuan;
/** Provisional photography intent; actual scene-image review determines the final camera. */
export type ShotDirection = {
  subjectRole?: "action" | "scale" | "life" | "foreground" | "pov" | "environment";
  subjectPresentation?: string;
  focusTarget?: string;
  focus: string;
  photography: { scale: string; height: string; angle: string; composition: string; depth: string };
  camera: { type: "fixed" | "pan" | "track" | "push" | "pull" | "follow"; direction: string; speed: string; extent: string; startFrame?: string; endFrame?: string; visualChange?: string; reason?: string };
  action: string;
  timing: Array<{ start: number; end: number; action: string }>;
  ending: string;
};
export function omniEnabled() { return process.env.FEATURED_VLOG_OMNI_ENABLED === "true"; }
export function vlogResolution(value: unknown): FeaturedVlogResolution {
  if (value === undefined) return "720p";
  if (value !== "720p" && value !== "1080p") throw new Error("精选Vlog生成清晰度仅支持720p或1080p。");
  return value;
}
export function styleVideoForTemplate(template: Pick<FeaturedVlogTemplate, "referenceVideoId" | "referenceVideo">) {
  if (!Number.isInteger(template.referenceVideoId) || !template.referenceVideoId || template.referenceVideoId < 1) throw new Error("当前精选Vlog模板未关联参考视频，请联系管理员在模板中选择参考视频。");
  const video = template.referenceVideo;
  if (!video || video.id !== template.referenceVideoId) throw new Error("模板关联的参考视频已失效或未返回详情，请刷新模板或由管理员重新关联。");
  if (!Number.isInteger(video.version) || video.version < 0) throw new Error("模板参考视频版本无效，请刷新模板后重试。");
  try {
    const url = new URL(video.videoUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch { throw new Error("模板参考视频地址无效，需提供可下载的HTTP/HTTPS视频地址。"); }
  return { source: "template" as const, id: video.id, name: video.name, version: video.version, url: video.videoUrl, purpose: "style_and_texture" as const, maxDuration: 10 };
}
export const OMNI_SCRIPT_RULES = `本脚本使用productionVersion:3、timingVersion:2、sceneVersion:1、characterSelection:unassigned。第一步只规划通用游客A是否出镜、动作与时间线，不绑定具体人物，不指定姓名、性别、年龄、五官、发型或服装。appearance写“游客A，具体外观在第二步选择”；props仅写真正服务动作的道具，不预设肩包。全篇使用游客A，不写具体人物身份。环境镜头可无人，characters为空或只含A，不强制每镜出人。第二步才按用户选择适配人物或无人模式。
每镜增加direction，结构为 {"focus":"观看重点","photography":{"scale":"景别","height":"机位高度","angle":"观察角度","composition":"主体位置/构图","depth":"前中远景意图"},"camera":{"type":"fixed|pan|track|push|pull|follow","direction":"运动方向或固定朝向","speed":"速度","extent":"运动范围"},"action":"人物动作或纯环境变化","timing":[{"start":0,"end":2,"action":"开始到完成的动作"}],"ending":"结束画面"}。
timing用秒，连续覆盖0到本镜duration，最多3段；每项action不超过20字。其余direction短句每项最多25字。人物动作与摄影机运动分开，fixed不得同时跟随位移。每镜一个可完成的主要动作，避免统一走停转头。
先按模板主要内容判断出镜需要：风景、地点建立、远景/航拍类环境展示默认environment无人；仅在体验动作、情绪或模板明确要求体现人物尺度时安排A，不设人物镜头比例。environment起止characters与characterChanges均为[]；人物中途进入不能标environment；POV不代表人物可见，仅可见手部等局部时记A。
运镜服务观看重点：空间充分时主动设计中等幅度推进、拉远、横移或跟随，camera.extent与ending写明起幅到终幅的可辨识构图变化，不默认小幅微动。细节、阅读、静观可fixed，不设运镜配额；不编造米数、绕行角度、隐藏空间或航拍路线。
direction是未读图的暂定拍法，不是用户确认后的摄影硬约束。内容、核心动作及时间线先确定；具体景别、机位、构图和运镜读图后可采用、部分采用或替换，不捏造通道、障碍或光源。不要在description、suggestedMaterial、起止状态及mainAction中重复这些摄影指令。按主题变化景别、主体位置和节奏，不强制航拍。相邻切点说明主题承接，摄影方向与构图可适配实际图；时间光线变化需有理由。结束状态不能包含下一镜场景或剪辑效果；cut/dissolve仅由transitionToNext定义。`;

/** A sole script character may have any AI-generated label; A is our wire identity. */
export function normalizeOmniCast(characters: unknown, shots: Array<Record<string, any>>) {
  if (!Array.isArray(characters)) throw new Error("脚本缺少游客出镜结构，请重新生成。");
  if (characters.length > 1) throw new Error(`脚本生成了${characters.length}位独立人物；当前精选Vlog仅支持一位贯穿游客或无人镜头，请调整模板中的多人要求。`);
  if (!characters.length) return;
  const id = characters[0]?.id;
  if (typeof id !== "string" || !id.trim()) throw new Error("脚本人物缺少有效标识。");
  characters[0].id = "A";
  for (const shot of shots) {
    for (const state of [shot.startState, shot.endState]) if (Array.isArray(state?.characters)) for (const person of state.characters) if (person?.id === id) person.id = "A";
    if (Array.isArray(shot.characterChanges)) for (const change of shot.characterChanges) if (change?.id === id) change.id = "A";
  }
}

export function validateOmniScript(script: FeaturedVlogScript) {
  if (script.photographyVersion !== undefined && script.photographyVersion !== 1) throw new Error("不支持的摄影设计版本。");
  if (script.productionVersion !== 3) throw new Error("缺少 Omni 脚本版本。");
  validateVideoTimeline(2, script.shots);
  validateVlogScenes(script);
  if (script.characterSelection === "none" && (script.characters?.length || script.shots.some(s => s.subjectPresence !== "environment" || s.startState!.characters.length || s.endState!.characters.length || s.characterChanges!.length))) throw new Error("不添加人物模式必须全部为无人环境镜头。");
  // Identity is bound by the preset Element in buildOmniTask, not AI wording.
  if (script.timingVersion !== 2 || script.sceneVersion !== 1) throw new Error("Omni脚本的时间线或场景版本无效，请重新生成脚本。");
  if (!Array.isArray(script.characters) || script.characters.some(c => c.id !== "A")) throw new Error("脚本人物标识须统一为游客A，实际人物在第二步选择。");
  script.shots.forEach((s, i) => {
    if (!["environment", "traveler", "pov"].includes(s.subjectPresence)) throw new Error(`镜头 ${i+1} 出镜类型无效。`);
    if (s.subjectPresence === "environment" && (s.startState!.characters.length || s.endState!.characters.length || s.characterChanges!.length)) throw new Error(`镜头 ${i+1} 为纯环境镜头，不得有人物或入场离场，请重新生成脚本。`);
    const d = s.direction;
    const validText = (v: unknown) => typeof v === "string" && !!v.trim();
    if (script.photographyVersion === 1) {
      if (!d || !["action", "scale", "life", "foreground", "pov", "environment"].includes(d.subjectRole || "")) throw new Error(`镜头 ${i+1} 缺少有效 subjectRole。`);
      for (const [key, value] of Object.entries({ subjectPresentation:d.subjectPresentation, focusTarget:d.focusTarget, startFrame:d.camera?.startFrame, endFrame:d.camera?.endFrame, visualChange:d.camera?.visualChange, reason:d.camera?.reason })) {
        if (!validText(value)) throw new Error(`镜头 ${i+1} 缺少摄影字段 ${key}。`);
      }
      const visible = !!(s.startState?.characters.length || s.endState?.characters.length || s.characterChanges?.length);
      if ((s.subjectPresence === "environment" && d.subjectRole !== "environment") || (d.subjectRole === "environment" && visible) || (d.subjectRole === "pov" && s.subjectPresence !== "pov") || (!visible && !["environment", "pov"].includes(d.subjectRole!))) throw new Error(`镜头 ${i+1} 人物摄影作用与出镜状态冲突：${s.subjectPresence} / ${d.subjectRole}，${visible ? "有人物状态" : "无人状态"}。无人器物应使用environment，主观体验需使用pov。`);
      if (script.characterSelection === "none" && d.camera.type === "follow") throw new Error(`镜头 ${i+1} 无人模式不能沿用人物跟随，请按环境设计推进、平移或摇摄。`);
    }
    if (!d || ![d.focus, d.action, d.ending, ...["scale", "height", "angle", "composition", "depth"].map(k => d.photography?.[k as keyof typeof d.photography]), ...["direction", "speed", "extent"].map(k => d.camera?.[k as keyof typeof d.camera])].every(validText)
      || !["fixed", "pan", "track", "push", "pull", "follow"].includes(d.camera?.type)
      || !Array.isArray(d.timing) || !d.timing.length || d.timing.length > 3) throw new Error(`镜头 ${i+1} 缺少完整摄影、动作或时间安排。`);
    let end = 0;
    for (const phase of d.timing) {
      if (!Number.isFinite(phase.start) || !Number.isFinite(phase.end) || phase.start !== end || phase.end <= phase.start || !validText(phase.action)) throw new Error(`镜头 ${i+1} 动作时间段必须连续且有效。`);
      end = phase.end;
    }
    if (end !== s.duration) throw new Error(`镜头 ${i+1} 动作时间段必须覆盖完整镜头时长。`);
  });
}

// TypeScript shapes do not remove runtime fields. Serialize only execution data,
// including nested structures received from AI/client state.
function executionState(state: VlogSceneState) {
  return { location: state.location, characters: state.characters.map(c => ({ id: c.id, position: c.position, pose: c.pose, view: c.view })), props: [...state.props] };
}

function executionDirection(d: ShotDirection) {
  return { focus: d.focus, subjectRole:d.subjectRole, subjectPresentation:d.subjectPresentation, focusTarget:d.focusTarget,
    photography: { scale: d.photography.scale, height: d.photography.height, angle: d.photography.angle, composition: d.photography.composition, depth: d.photography.depth },
    camera: { type: d.camera.type, direction: d.camera.direction, speed: d.camera.speed, extent: d.camera.extent, startFrame:d.camera.startFrame, endFrame:d.camera.endFrame, visualChange:d.camera.visualChange, reason:d.camera.reason },
    action: d.action, timing: d.timing.map(p => ({ start: p.start, end: p.end, action: p.action })), ending: d.ending };
}

export function buildOmniTask(input: {
  noteTask: { id: number };
  resolution?: FeaturedVlogResolution;
  characterSelection?: VlogCharacterSelection;
  script: FeaturedVlogScript; framePlan: FeaturedVlogFramePlan; music: MusicCandidate;
  template: Pick<FeaturedVlogTemplate, "id" | "name" | "version" | "referenceVideoId" | "referenceVideo">; overallDirection: string;
}) {
  validateOmniScript(input.script);
  const resolution = vlogResolution(input.resolution);
  const choice = vlogCharacterSelection(input.characterSelection);
  if (choice !== (input.script.characterSelection || "linchuan")) throw new Error("人物选择已变化，请先完成人物制作适配。");
  const character = choice === "none" ? null : VLOG_CHARACTERS[choice];
  const hasPeople = input.script.shots.some(s => s.startState!.characters.length || s.endState!.characters.length);
  if (!omniEnabled()) throw new Error("Omni v3 尚未启用，请先完成参考资源与执行器验证。");
  const styleVideo = styleVideoForTemplate(input.template);
  if (input.framePlan.length !== input.script.shots.length || !input.music.audioUrl.startsWith("https://")) throw new Error("Omni 场景参考或配乐缺失。");
  const shots = input.script.shots.map((shot, i) => {
    const frame = input.framePlan[i];
    if (frame.order !== shot.order || !frame.framePrompt || !frame.selectionReason || !["asset", "generate"].includes(frame.frameSource) || (frame.frameSource === "asset" ? !frame.assetUrl.startsWith("https://") : !!frame.assetUrl)) throw new Error(`镜头 ${i+1} 场景参考无效。`);
    return { order: shot.order, role: shot.role, description: shot.description, duration: shot.duration, subjectPresence: shot.subjectPresence,
      sceneReference: { source: frame.frameSource, imageUrl: frame.assetUrl || undefined, description: frame.framePrompt, analysis: frame.aiAnalysis || "" },
      direction: executionDirection(shot.direction!), startState: executionState(shot.startState!), mainAction: shot.mainAction, endState: executionState(shot.endState!),
      characterChanges: shot.characterChanges!.map(c => ({ id: c.id, type: c.type, reason: c.reason })), continuityNote: shot.continuityNote,
      transitionToNext: shot.transitionToNext ? { type: shot.transitionToNext.type, duration: shot.transitionToNext.duration, reason: shot.transitionToNext.reason, outgoingState: shot.transitionToNext.outgoingState, incomingState: shot.transitionToNext.incomingState } : null };
  });
  const anchor = input.framePlan.find(f => f.frameSource === "asset");
  const plan = { version: 3, kind: "featured_vlog", photographyVersion:input.script.photographyVersion,
    template: { id: input.template.id, name: input.template.name, version: input.template.version, referenceVideoId: styleVideo.id },
    generation: { provider: "kling_cli", tool: "omni_ref_video", model: "kling-video-v3_0_omni", resolution, aspect_ratio: "9:16", imageCount: "1", prefer_multi_shots: "false", enable_audio: "false", keepOriginalSound: "false" },
    output: { width: 1080, height: 1920, fps: 24 },
    characterSelection: choice,
    ...(hasPeople && character ? { character } : {}), styleVideo,
    sceneStyleReference: anchor ? { imageUrl: anchor.assetUrl } : undefined,
    script: { title: input.script.title, summary: input.script.summary, perspective: input.script.perspective },
    music: { id: input.music.id, name: input.music.name, tags: input.music.tags, durationSeconds: input.music.durationSeconds, audioUrl: input.music.audioUrl }, shots };
  const dir = `.tasks/xhs-featured-vlog-${input.noteTask.id}`;
  return `# 精选Vlog Omni全能参考制作任务
任务：${input.noteTask.id} · ${input.script.title}
${shots.length}镜，预计${videoTimelineDuration(input.script.shots, 2)}秒，9:16，${resolution}生成；输出1080×1920/24fps${resolution === "720p" ? "（非原生1080p）" : "（原生1080p生成，不得以720p放大替代）"}，仅整片配乐。
参考地址见plan.styleVideo.url；--video使用prepare返回路径。
在xiaohongshu_auto_op工作区执行，目录 $PWD/${dir}。只制作，不发布。

## 原始计划
保存为任务目录plan.json，不改写。需支持version=3的featured-vlog执行器；旧版不可执行此计划。
\`\`\`json
${JSON.stringify(plan)}
\`\`\`

## 准备与读图细化
environment无人，不传elements或主体引用；原图有人先处理或报告。其余镜头仅可见人物/手部或入场时绑定。主体只锁定身份外观，不要求居中、全身、露脸或始终清晰；按本镜观看重点允许小比例、偏侧、局部、合理遮挡及虚化前景。
plan.shots[].direction仅为暂定拍法；不改原始plan.json及sourceHash，最终设计记resolved-plan.json的refinement。
1. 执行 uv run python scripts/cli.py featured-vlog prepare --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}"。下载模板参考视频及场景/配乐，参考视频3–10秒直接使用，超过10秒截前10秒，不足3秒报错；不回退静态视频，不生成首帧或调用Turbo。
2. generate先用generate-image制作9:16无人场景图到scenePath；sceneStyleReference可经edit-image统一AI背景质感，不复制建筑人物。asset不先加人或重绘场地；纯环境原图有人时仅去人保场地或停止报告，处理后重新读图。
3. 准备全部场景图后逐张实际读图，核对人员、通道、障碍、光向和画幅。语义读图不可用时停止受影响镜头并报告，文件尺寸/亮度/哈希不能替代读图，不凭分析文字冒充已看图。
4. 看完本片全部实际图片后先统筹全片，再逐镜细化：检查人物作用、比例、位置、景别、焦点及运动节奏，避免连续相似人像或无理由固定。拍法可替换暂定设计；保留场地事实，不锁死原图裁切与机位，也不补造未知房间、建筑背面或路线。核心动作无法成立时停止报告，不擅自换图；保留主题、事件、顺序、时长、身份、人数、转场。
5. imageObservations记录实际空间；cameraMovement分别写起幅、运动方向/速度/范围、终幅、可观察变化与选择理由，调整暂定拍法须说明原因。pan为原地摇摄，track为平移；人物运动不能代替摄影机运动，慢不等于微动。空间支持时主动设计可辨识位移，固定说明静观目的，末镜不自动固定。细化透视/接触/遮挡/光向/反光/投影/景深，不带棚拍背景；constraints只写本镜适用边界。分写人物动作、时间和endingState；prompt使用最终设计，不直接拼plan.direction。

## Kling CLI生成与记录
执行 kling --version（>=0.2.3）、kling who_am_i、kling account、kling omni_ref_video --help${hasPeople && character ? `、kling element_get ${character.id}` : ""}，核对账号/主体/能力。只用官方kling，失败报告不改通道，参数按实时帮助。
每镜 kling omni_ref_video --model kling-video-v3_0_omni；--image传scenePath、--video传styleVideoPath，本地自动上传。${hasPeople && character ? `A参与（含入场/手部）时--elements传JSON字符串且prompt用<<<${character.id}>>>，无人省略。主体约束身份服装；` : "全片无人，不绑定人物，不生成其他人物或手部。"}${VLOG_REFERENCE_STYLE_RULE} 显式传resolution=${resolution}、9:16、单条、关闭音频/原声/智能分镜；不支持停止，不降级。时长max(3,ceil(duration))<=10，动作按时完成，内部切镜不通过。
--poll 0单次提交，保存CLI回执；ok=true后立即记录body.generationId及creditsConsumed，再用 kling query_tasks 实际ID查询，从成功works取视频地址。失败/超时续查原ID，不重投、不改模型；报价以当前入口为准。
request.arguments.prompt必须等于refinement.prompt，不直接执行或拼接plan.direction。按Skill记录model、arguments/inputs、argv、submitResponse；elements为数组，输入为实际CLI路径，argv从kling、omni_ref_video开始，不记凭据。
下载片段到骨架clipPath；实际scenePath和clipPath的SHA256写入sceneSha256、clipSha256。连续查看片段后填写visualReview；notes分别记录人物与环境关系、动作完成、摄影机运动、起终构图变化、场景稳定/身份/内部切镜。远景不要求辨清五官，局部不要求全身，虚化前景不要求脸部锐利。移动未实现须记录偏差，不能因人物动了就算运镜通过；用户接受偏差仍保留说明，不自动重复付费。仅技术检查不能标记视觉通过，passed按实际验收结果填写。每镜实际起始抽帧经飞书发送，标明任务/镜号及“视频起始画面预览”，不是预制首帧。

## 后期与交付
全部镜头验收后执行 uv run python scripts/cli.py featured-vlog render --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}" --output "$PWD/${dir}/final.mp4" --size 1080x1920。
执行器接收外部片段并裁切、转场、统一帧率、配乐，无TTS。重置前确认生成终态；视觉不合格可在用户批准后重做，不因查询超时重投。reset使用同一plan/work-dir及--shots两位镜号，保留原片审计。
连续观看成片核对主题、动作、转场、身份道具与连续性。通过后将实际MP4经飞书发送；失败报告，不能只发本机路径声称交付。
整片方向：${input.overallDirection}`;
}
