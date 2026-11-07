import type { FeaturedVlogScript, FeaturedVlogFramePlan, FeaturedVlogTemplate, MusicCandidate, FeaturedVlogResolution } from "./featuredVlog";
import { validateVideoTimeline, videoTimelineDuration } from "./videoTimeline";
import { validateVlogScenes } from "./vlogScene";
import type { VlogSceneState } from "./vlogScene";
import { VLOG_REFERENCE_STYLE_RULE } from "./featuredVlogTemplateRules";

export const LINCHUAN = {
  id: "324641305202280", bindName: "林川-山林周末Vlog", type: "image", characterId: "A", version: 2,
  appearance: "28岁东亚男性，黑短发，无胡须眼镜；沙米卷袖衬衫、灰绿长裤、米灰鞋、深棕帆布包左肩左髋"
} as const;
/** Provisional photography intent; actual scene-image review determines the final camera. */
export type ShotDirection = {
  focus: string;
  photography: { scale: string; height: string; angle: string; composition: string; depth: string };
  camera: { type: "fixed" | "pan" | "track" | "push" | "pull" | "follow"; direction: string; speed: string; extent: string };
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
export const OMNI_SCRIPT_RULES = `本脚本使用productionVersion:3、timingVersion:2、sceneVersion:1。人物仅允许A，固定为${LINCHUAN.appearance}。不另造身份或改变服装；环境镜头可无人，不强制所有镜头出人，不因提供主体就加人。characters为空或只含A，按实际剧情决定。模板、用户要求若需要不兼容的固定人物，不擅自替换为林川，应明确指出不支持。
每镜增加direction，结构为 {"focus":"观看重点","photography":{"scale":"景别","height":"机位高度","angle":"观察角度","composition":"主体位置/构图","depth":"前中远景意图"},"camera":{"type":"fixed|pan|track|push|pull|follow","direction":"运动方向或固定朝向","speed":"速度","extent":"运动范围"},"action":"人物动作或纯环境变化","timing":[{"start":0,"end":2,"action":"开始到完成的动作"}],"ending":"结束画面"}。
timing用秒，连续覆盖0到本镜duration，最多3段；每项action不超过20字。其余direction短句每项最多25字。人物动作与摄影机运动分开，fixed不得同时跟随位移。每镜一个可完成的主要动作，避免统一走停转头。
先按模板主要内容判断出镜需要：风景、地点建立、远景/航拍类环境展示默认environment无人；仅在体验动作、情绪或模板明确要求体现人物尺度时安排A，不设人物镜头比例。environment起止characters与characterChanges均为[]；人物中途进入不能标environment；POV不代表人物可见，仅可见手部等局部时记A。
运镜服务观看重点：空间充分时主动设计中等幅度推进、拉远、横移或跟随，camera.extent与ending写明起幅到终幅的可辨识构图变化，不默认小幅微动。细节、阅读、静观可fixed，不设运镜配额；不编造米数、绕行角度、隐藏空间或航拍路线。
direction是未读图的暂定拍法，不是用户确认后的摄影硬约束。内容、核心动作及时间线先确定；具体景别、机位、构图和运镜读图后可采用、部分采用或替换，不捏造通道、障碍或光源。不要在description、suggestedMaterial、起止状态及mainAction中重复这些摄影指令。按主题变化景别、主体位置和节奏，不强制航拍。相邻切点说明主题承接，摄影方向与构图可适配实际图；时间光线变化需有理由。结束状态不能包含下一镜场景或剪辑效果；cut/dissolve仅由transitionToNext定义。`;

export function validateOmniScript(script: FeaturedVlogScript) {
  if (script.productionVersion !== 3) throw new Error("缺少 Omni 脚本版本。");
  validateVideoTimeline(2, script.shots);
  validateVlogScenes(script);
  // Identity is bound by the preset Element in buildOmniTask, not AI wording.
  if (script.timingVersion !== 2 || script.sceneVersion !== 1 || !Array.isArray(script.characters) || script.characters.some(c => c.id !== LINCHUAN.characterId)) throw new Error("Omni 当前仅支持预设人物主体A，请重新生成脚本。");
  script.shots.forEach((s, i) => {
    if (!["environment", "traveler", "pov"].includes(s.subjectPresence)) throw new Error(`镜头 ${i+1} 出镜类型无效。`);
    if (s.subjectPresence === "environment" && (s.startState!.characters.length || s.endState!.characters.length || s.characterChanges!.length)) throw new Error(`镜头 ${i+1} 为纯环境镜头，不得有人物或入场离场，请重新生成脚本。`);
    const d = s.direction;
    const validText = (v: unknown) => typeof v === "string" && !!v.trim();
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
  return { focus: d.focus,
    photography: { scale: d.photography.scale, height: d.photography.height, angle: d.photography.angle, composition: d.photography.composition, depth: d.photography.depth },
    camera: { type: d.camera.type, direction: d.camera.direction, speed: d.camera.speed, extent: d.camera.extent },
    action: d.action, timing: d.timing.map(p => ({ start: p.start, end: p.end, action: p.action })), ending: d.ending };
}

export function buildOmniTask(input: {
  noteTask: { id: number };
  resolution?: FeaturedVlogResolution;
  script: FeaturedVlogScript; framePlan: FeaturedVlogFramePlan; music: MusicCandidate;
  template: Pick<FeaturedVlogTemplate, "id" | "name" | "version" | "referenceVideoId" | "referenceVideo">; overallDirection: string;
}) {
  validateOmniScript(input.script);
  const resolution = vlogResolution(input.resolution);
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
  const plan = { version: 3, kind: "featured_vlog",
    template: { id: input.template.id, name: input.template.name, version: input.template.version, referenceVideoId: styleVideo.id },
    generation: { provider: "kling_cli", tool: "omni_ref_video", model: "kling-video-v3_0_omni", resolution, aspect_ratio: "9:16", imageCount: "1", prefer_multi_shots: "false", enable_audio: "false", keepOriginalSound: "false" },
    output: { width: 1080, height: 1920, fps: 24 },
    ...(hasPeople ? { character: LINCHUAN } : {}), styleVideo,
    sceneStyleReference: anchor ? { imageUrl: anchor.assetUrl } : undefined,
    script: { title: input.script.title, summary: input.script.summary, perspective: input.script.perspective },
    music: { id: input.music.id, name: input.music.name, tags: input.music.tags, durationSeconds: input.music.durationSeconds, audioUrl: input.music.audioUrl }, shots };
  const dir = `.tasks/xhs-featured-vlog-${input.noteTask.id}`;
  return `# 精选Vlog Omni全能参考制作任务
任务：${input.noteTask.id} · ${input.script.title}
${shots.length}镜，预计${videoTimelineDuration(input.script.shots, 2)}秒，9:16，${resolution}生成；输出1080×1920/24fps${resolution === "720p" ? "（非原生1080p）" : "（原生1080p生成，不得以720p放大替代）"}，仅整片配乐。
参考：「${styleVideo.name}」，地址见plan.styleVideo.url；--video使用prepare返回路径。
在xiaohongshu_auto_op工作区执行，任务目录 $PWD/${dir}。只制作，不发布。

## 原始计划
保存为任务目录plan.json，不改写。需支持version=3的featured-vlog执行器；旧版不可执行此计划。
\`\`\`json
${JSON.stringify(plan)}
\`\`\`

## 准备与读图细化
environment无人，不传elements或主体引用；原图有人先处理或报告。其余镜头仅可见人物/手部或入场时绑定。空间支持时运镜用中等幅度，写起幅、方向、速度、范围、终幅和理由；不默认微动/慢推，细节可固定，不编造米数/隐藏空间；验收位移与终幅。
plan.shots[].direction仅为暂定拍法，其他文本中的摄影描述也仅供参考，不能直接当最终生成提示词；原始plan.json及sourceHash不改写，适配只记录在resolved-plan.json的refinement。
1. 执行 uv run python scripts/cli.py featured-vlog prepare --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}"。下载模板参考视频及场景/配乐，参考视频3–10秒直接使用，超过10秒截前10秒，不足3秒报错；不回退静态视频，不生成首帧或调用Turbo。
2. generate先用generate-image制作9:16无人场景图到scenePath；sceneStyleReference可经edit-image统一AI背景质感，不复制建筑人物。asset不先加人或重绘场地；纯环境原图有人时仅去人保场地或停止报告，处理后重新读图。
3. 逐张读图核对人员、通道、障碍、光向、画幅；细化落点/尺度/透视/承重接触/遮挡、光比/色温/反光/投影、景深/运动模糊，不带棚拍光背景。玻璃才查反射，hands不要求露脸，不复制人物。
4. 读图确定景别/机位/构图/运镜，可替换暂定拍法；平视图可保留平视，不为俯拍/航拍/环绕补造屋顶、背面或通道。信息不足可固定；拍法不适配应调整拍法，不换图或生成替代场景。核心动作无法完成才停止报告；保留主题、事件、顺序、时长、身份、人数、转场。
5. 分写动作、时间、结束状态。imageObservations记录视角空间；cameraMovement记录最终拍法及理由；constraints记录空间/透视边界；prompt只含适配拍法，不拼冲突指令；兼顾相邻衔接。

## Kling CLI生成与记录
执行 kling --version（>=0.2.3）、kling who_am_i、kling account、kling omni_ref_video --help${hasPeople ? `、kling element_get ${LINCHUAN.id}` : ""}，核对账号${hasPeople ? "/image主体" : ""}/能力。只用官方kling，缺失或失败报告，不改通道。参数映射按实时帮助，不靠默认值。
每镜 kling omni_ref_video --model kling-video-v3_0_omni；--image传scenePath、--video传styleVideoPath，本地自动上传。${hasPeople ? `A参与（含入场/手部）时--elements传JSON字符串且prompt用<<<${LINCHUAN.id}>>>，无人省略。主体约束身份服装；` : "全片无人，不绑定人物主体。"}${VLOG_REFERENCE_STYLE_RULE} 显式传resolution=${resolution}、9:16、单条、关闭音频/原声/智能分镜；清晰度不支持则停止，不降级。时长max(3,ceil(duration))<=10，动作在目标时长内完成。实际内部切镜不通过。
--poll 0单次提交，保存CLI回执；ok=true后立即记录body.generationId及creditsConsumed，再用 kling query_tasks 实际ID查询，从成功works取视频地址。失败/超时续查原ID，不重投、不改模型；报价以当前入口为准。
按Skill写resolved-plan.json并保留sourceHash；refinement记录读图/动作/最终拍法/时间/光学/prompt。request.arguments.prompt必须等于refinement.prompt，不直接执行或拼接plan.direction。request记录model、arguments/inputs、argv、原始submitResponse；elements为数组，输入为实际CLI路径，argv从kling、omni_ref_video开始，不记凭据。
下载片段到骨架clipPath；分别计算实际scenePath和clipPath文件的SHA256填入sceneSha256、clipSha256，防止改图/换片后误用旧验收。查看并填visualReview={passed:true,notes:"身份/光学/动作/无内部切镜检查结果"}。只通过技术检查不能标记视觉通过。每镜抽取实际起始画面，经飞书发送给请求用户，标明任务/镜号及“视频起始画面预览”，不是预先制作的首帧。

## 后期与交付
全部镜头验收后执行 uv run python scripts/cli.py featured-vlog render --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}" --output "$PWD/${dir}/final.mp4" --size 1080x1920。
执行器只接收外部片段，裁切、结构化转场、统一帧率并适配计划中的唯一配乐；无TTS，不替换配乐。重置前确认原生成请求已失败，执行 uv run python scripts/cli.py featured-vlog reset --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}" --shots NN（替换为两位镜号），保留原始视频供审计。
连续观看最终片检查主题推进、动作与转场、身份道具和场景连续性。通过后将实际MP4通过飞书发给请求用户；失败明确报告，不能只发本机路径声称已交付。
整片方向：${input.overallDirection}`;
}
