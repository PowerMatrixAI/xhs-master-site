import type { FeaturedVlogScript } from "./featuredVlog";
import { parseVlogBeatContent } from "./featuredVlogTemplateRules";

export const VLOG_ASSET_SELECTION_RULES = "按镜头内容目标、场景、主体和必要动作选图，先判断图片能否承接内容。景别、机位、构图、运镜不是选图条件；不能仅因不符合参考拍法拒绝图片，也不能为了俯拍、航拍或环绕而改为generate。只有缺少内容匹配素材才生成，不能勉强使用内容不相关的图片。保留必要人物数量、设施与通行空间条件，但无需原图已含主角或动作；最终拍法由制作阶段查看实际图后确定，不凭文字分析声称已看图。";

/** Remove explicit photography annotations in cached prose, retaining the subjects. */
export function vlogSelectionContent(value: string | undefined): string {
  if (!value) return "";
  const content = parseVlogBeatContent(value).mainContent;
  return content
    .replace(/【(?:景别|机位|运镜)】[^。；;\n]*/gu, "")
    .replace(/(?:景别|机位|运镜|摄影设计|摄影角度|观察角度|构图|镜头运动)\s*[：:][^。；;\n]*/gu, "")
    .replace(/(?:摄影机|摄像机|镜头)[^，,。；;\n]*?(?:跟随|跟拍)(?=人物|游客|住客|主角|[A-Z])/gu, "")
    .replace(/(?:摄影机|摄像机|镜头)(?:从|由|向|沿|在|以|固定|缓慢|快速|轻微|小幅|高位|低位|平视|俯拍|仰拍|推进|拉远|横摇|移动|跟随|环绕)[^，,。；;\n]*/gu, "")
    // A person's gaze is content, unlike a camera's viewing angle.
    .replace(/((?:人物|游客|住客|主角|[A-Z])(?:正在|抬头|低头)?)(?:俯视|仰视|平视)/gu, "$1观看")
    .replace(/(?:不要求|不要|禁止|避免|必须|需要|建议|可选|可以|能够|可|应当|应|高位|低位|高空|垂直|正面|侧面|轻微|略微|小幅|缓慢|快速)*\s*(?:斜俯拍|斜仰拍|俯拍|仰拍|高角度|低角度|斜俯|略俯|微仰|俯视|仰视|平视|平拍|鸟瞰|俯瞰|航拍|大远景|大全景|远景|全景|中景|近景|特写|广角|长焦|微距|固定机位|固定镜头|推镜|拉镜|摇镜|移镜|跟拍|环绕|横摇|俯摇|仰摇|上摇|下摇)(?:视角|角度|机位|镜头)?的?/gu, "")
    .replace(/\s+/gu, " ").replace(/^[\s，,；;。]+|[\s，,；;]+$/gu, "").trim();
}

function contentState(state: FeaturedVlogScript["shots"][number]["startState"]) {
  if (!state) return undefined;
  return {
    location: vlogSelectionContent(state.location),
    // view is a framing/face-direction intention, not a source-image requirement.
    characters: state.characters.map(c => ({ id: c.id, position: vlogSelectionContent(c.position), pose: vlogSelectionContent(c.pose) })),
    props: state.props.map(vlogSelectionContent).filter(Boolean)
  };
}

/** Whitelist content only; never forward direction, camera references or transitions. */
export function featuredVlogForAssetSelection(script: FeaturedVlogScript) {
  return {
    title: vlogSelectionContent(script.title),
    shots: script.shots.map(s => ({
      order: s.order,
      beat: vlogSelectionContent(s.beat),
      role: vlogSelectionContent(s.role),
      description: vlogSelectionContent(s.description),
      suggestedMaterial: vlogSelectionContent(s.suggestedMaterial),
      subjectPresence: s.subjectPresence,
      mainAction: vlogSelectionContent(s.mainAction),
      startState: contentState(s.startState),
      endState: contentState(s.endState)
    }))
  };
}
