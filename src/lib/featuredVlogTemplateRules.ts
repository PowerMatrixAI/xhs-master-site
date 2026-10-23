import type { FeaturedVlogTemplate } from "./featuredVlog";

export const VLOG_REFERENCE_STYLE_RULE = "参考视频默认只借鉴摄影质感、色彩处理、明暗层次及材质表现；不复制人物、建筑、景观、物件、动作或情节，不照搬运镜、切镜及时间安排。场景参考图决定空间事实、时间和主要光线，具体摄影与转场依据本片脚本和实际图片设计。";

// Older backend records retain retired fields; do not reactivate them in planning.
export function featuredVlogTemplateForPlanning(template: FeaturedVlogTemplate) {
  return {
    name: template.name, outline: template.outline,
    beats: template.beats.map(b => ({ name: b.name, mainContent: b.shotDuty, required: b.required })),
    perspectiveGuidance: template.perspectiveGuidance,
    visualGuidance: template.visualGuidance,
    musicTags: template.musicTags,
    referenceVideo: template.referenceVideo ? { id: template.referenceVideo.id, name: template.referenceVideo.name, purpose: "style_and_texture" } : null
  };
}
