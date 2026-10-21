import type { FeaturedVlogScript, FeaturedVlogFramePlan, MusicCandidate } from "./featuredVlog";
import { validateVideoTimeline, videoTimelineDuration } from "./videoTimeline";
import { validateVlogScenes } from "./vlogScene";

export const LINCHUAN = {
  id: "324475410205532", bindName: "林川", type: "image", characterId: "A", version: 1,
  appearance: "28岁东亚男性，黑短发，无胡须眼镜；沙米卷袖衬衫、灰绿长裤、米灰鞋、深棕帆布包左肩左髋"
} as const;
export type ShotDirection = {
  focus: string;
  photography: { scale: string; height: string; angle: string; composition: string; depth: string };
  camera: { type: "fixed" | "pan" | "track" | "push" | "pull" | "follow"; direction: string; speed: string; extent: string };
  action: string;
  timing: Array<{ start: number; end: number; action: string }>;
  ending: string;
};
export function omniEnabled() { return process.env.FEATURED_VLOG_OMNI_ENABLED === "true"; }
export function styleVideoUrl() {
  const url = new URL(process.env.VIDEO_REFERENCE_PUBLIC_ORIGIN || "http://localhost");
  if (url.protocol !== "https:" || /^(localhost|127\.|0\.|\[?::1)/i.test(url.hostname) || url.username || url.password) throw new Error("请配置可公开访问的 VIDEO_REFERENCE_PUBLIC_ORIGIN（HTTPS），部署参考视频并完成执行器验证后再启用 Omni。");
  return new URL("/video-references/jinsanjiao-first-10s-v1.mp4", url.origin).href;
}
export const OMNI_SCRIPT_RULES = `本脚本使用productionVersion:3、timingVersion:2、sceneVersion:1。人物仅允许A，固定为${LINCHUAN.appearance}。不另造身份或改变服装；环境镜头可无人，不强制所有镜头出人，不因提供主体就加人。characters为空或只含A，按实际剧情决定。模板、用户要求若需要不兼容的固定人物，不擅自替换为林川，应明确指出不支持。
每镜增加direction，结构为 {"focus":"观看重点","photography":{"scale":"景别","height":"机位高度","angle":"观察角度","composition":"主体位置/构图","depth":"前中远景意图"},"camera":{"type":"fixed|pan|track|push|pull|follow","direction":"运动方向或固定朝向","speed":"速度","extent":"运动范围"},"action":"人物动作或纯环境变化","timing":[{"start":0,"end":2,"action":"开始到完成的动作"}],"ending":"结束画面"}。
timing用秒，连续覆盖0到本镜duration，最多3段；每项action不超过20字。其余direction短句每项最多25字。人物动作与摄影机运动分开，fixed不得同时跟随位移。每镜一个可完成的主要动作，避免统一走停转头。
摄影设计是意图，尚未看实际图，不捏造通道、障碍或光源。按主题变化景别、机位、主体位置和节奏，不强制航拍。相邻切点说明视线/方向/构图/主题承接，时间光线变化需有理由。结束状态不能包含下一镜场景或剪辑效果；cut/dissolve仅由transitionToNext定义。`;

export function validateOmniScript(script: FeaturedVlogScript) {
  if (script.productionVersion !== 3) throw new Error("缺少 Omni 脚本版本。");
  validateVideoTimeline(2, script.shots);
  validateVlogScenes(script);
  if (script.timingVersion !== 2 || script.sceneVersion !== 1 || !Array.isArray(script.characters) || script.characters.some(c => c.id !== "A" || c.appearance !== LINCHUAN.appearance)) throw new Error("Omni 当前仅支持固定林川主体A，请重新生成脚本。");
  script.shots.forEach((s, i) => {
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

export function buildOmniTask(input: {
  account: { name: string; accountParam: string }; noteTask: { id: number; topicTitle: string };
  script: FeaturedVlogScript; framePlan: FeaturedVlogFramePlan; music: MusicCandidate;
  template: { id: string; name: string }; overallDirection: string;
}) {
  validateOmniScript(input.script);
  if (!omniEnabled()) throw new Error("Omni v3 尚未启用，请先完成参考资源与执行器验证。");
  if (input.framePlan.length !== input.script.shots.length || !input.music.audioUrl.startsWith("https://")) throw new Error("Omni 场景参考或配乐缺失。");
  const shots = input.script.shots.map((shot, i) => {
    const frame = input.framePlan[i];
    if (frame.order !== shot.order || !frame.framePrompt || !frame.selectionReason || !["asset", "generate"].includes(frame.frameSource) || (frame.frameSource === "asset" ? !frame.assetUrl.startsWith("https://") : !!frame.assetUrl)) throw new Error(`镜头 ${i+1} 场景参考无效。`);
    return { order: shot.order, role: shot.role, description: shot.description, duration: shot.duration,
      sceneReference: { source: frame.frameSource, imageUrl: frame.assetUrl || undefined, description: frame.framePrompt, analysis: frame.aiAnalysis || "", selectionReason: frame.selectionReason },
      direction: shot.direction, startState: shot.startState, mainAction: shot.mainAction, endState: shot.endState,
      characterChanges: shot.characterChanges, continuityNote: shot.continuityNote, transitionToNext: shot.transitionToNext };
  });
  const anchor = input.framePlan.find(f => f.frameSource === "asset");
  const plan = { version: 3, kind: "featured_vlog", account: input.account, noteTask: input.noteTask, template: input.template,
    generation: { provider: "kling_mcp", tool: "omni_ref_video", model: "kling-video-v3_0_omni", resolution: "720p", aspect_ratio: "9:16", imageCount: "1", prefer_multi_shots: "false", enable_audio: "false", keepOriginalSound: "false" },
    output: { width: 1080, height: 1920, fps: 24 },
    character: LINCHUAN, styleVideo: { version: 1, url: styleVideoUrl(), duration: 10 },
    sceneStyleReference: anchor ? { imageUrl: anchor.assetUrl } : undefined,
    script: { title: input.script.title, summary: input.script.summary, perspective: input.script.perspective },
    music: input.music, shots };
  const dir = `.tasks/xhs-featured-vlog-${input.noteTask.id}`;
  return `# 精选Vlog Omni全能参考制作任务
账号：${input.account.name} / ${input.account.accountParam}；任务：${input.noteTask.id} ${input.noteTask.topicTitle}
${shots.length}镜，预计${videoTimelineDuration(input.script.shots, 2)}秒，9:16，720p生成；输出1080×1920/24fps（非原生1080p），仅整片配乐。
在xiaohongshu_auto_op工作区执行，任务目录 $PWD/${dir}。只制作，不发布。

## 原始计划
保存为任务目录plan.json，不改写。需支持version=3的featured-vlog执行器；旧版不可执行此计划。
\`\`\`json
${JSON.stringify(plan)}
\`\`\`

## 准备与读图细化
1. 执行 uv run python scripts/cli.py featured-vlog prepare --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}"。只下载场景、参考视频和配乐，不生成首帧或调用Turbo。
2. generate镜头先用generate-image制作无主角场景参考图（9:16），保存到骨架scenePath；有sceneStyleReference时可用edit-image以背景和返回的sceneStylePath锚点统一摄影质感，不复制建筑或人物。asset镜头保留原图，不先加人或重绘。
3. 主会话必须逐张查看实际场景图，核对已有人员、可行走区域、障碍、光向、画幅；图片分析只是文字线索。按原图细化人物落点/尺度/透视、鞋底接触与承重、遮挡、主光方向/光比/色温/环境反光/投影、景深与运动模糊；不带入主体的棚拍背景/光线。涉及玻璃时才检查反射，无人不加人物约束，hands不要求露脸，front/back/profile只按本镜设计。已有人员不得机械叠加为第二个林川。
4. 分别写人物动作、摄影机运动、时间安排、结束状态、适用约束和单镜prompt；检查相邻景别、方向、时间光线与切点。不改变主题、职责、顺序、时长、身份或转场；图片无法支持动作则停止对应镜头并报告。不得擅自换图、换主体或改剧情。

## Kling MCP生成与记录
调用who_am_i确认能力及账号，element_get验证${LINCHUAN.id}为image主体；不可访问则停止。镜头有A参与（包括入场、手部）才在elements传该主体，在prompt用<<<${LINCHUAN.id}>>>引用；无人镜头不传elements。
每镜image_1为scene-NN.png，video_1为已下载的10秒参考视频，必要时通过MCP上传。图片约束场景，主体约束身份服装，视频只参考摄影质感/运动节奏/色彩，不复制场景人物字幕音乐或切镜。明确单一连续镜头、无内部剪辑；后期负责cut/dissolve。按generation参数逐项显式传入，生成长度为max(3,ceil(duration))、最多10秒；关键动作在目标时长内完成，额外时间自然保持。引用视频可能影响服务端自动分镜，实际存在内部切镜则验收失败。
先核对当前入口额度/报价，不按历史价格推算。提交后立即保存generationId，超时查询原任务，不重复提交；失败保留成功片段。
prepare返回resolved-plan.json骨架（sourceHash为每镜原始内容摘要）；在原条目补充refinement={imageObservations,personAction,cameraMovement,timing,endingState,integration,constraints,prompt}，timing沿用分段秒数，integration/constraints为字符串数组；记录实际观察，不伪称已看图。填写generationId和request（model、arguments对象、inputs对象；inputs.image_1/video_1为实际MCP URL，arguments含prompt/duration及固定参数，elements为数组）。prompt必须等于refinement.prompt。
下载片段到骨架clipPath；分别计算实际scenePath和clipPath文件的SHA256填入sceneSha256、clipSha256，防止改图/换片后误用旧验收。查看并填visualReview={passed:true,notes:"身份/光学/动作/无内部切镜检查结果"}。只通过技术检查不能标记视觉通过。每镜抽取实际起始画面，经飞书发送给请求用户，标明任务/镜号及“视频起始画面预览”，不是预先制作的首帧。

## 后期与交付
全部镜头验收后执行 uv run python scripts/cli.py featured-vlog render --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}" --output "$PWD/${dir}/final.mp4" --size 1080x1920。
执行器只接收外部片段，裁切、结构化转场、统一帧率并适配计划中的唯一配乐；无TTS，不替换配乐。重置前确认原生成请求已失败，执行 uv run python scripts/cli.py featured-vlog reset --plan-file "$PWD/${dir}/plan.json" --work-dir "$PWD/${dir}" --shots NN（替换为两位镜号），保留原始视频供审计。
连续观看最终片检查主题推进、动作与转场、身份道具和场景连续性。通过后将实际MP4通过飞书发给请求用户；失败明确报告，不能只发本机路径声称已交付。
整片方向：${input.overallDirection}`;
}
