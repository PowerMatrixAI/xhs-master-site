import type { FeaturedVlogTemplate } from "./featuredVlog";

export const VLOG_REFERENCE_STYLE_RULE = "参考视频默认只借鉴摄影质感、色彩处理、明暗层次及材质表现；不复制人物、建筑、景观、物件、动作或情节，不照搬运镜、切镜及时间安排。场景参考图决定空间事实、时间和主要光线，具体摄影与转场依据本片脚本和实际图片设计。";

export type VlogCameraReference = {
  scale?: string;
  viewpoint?: string;
  movement?: string;
  sourceNote?: string;
  /** Preserve partial, duplicated or otherwise unstructured reference text. */
  raw: string;
};

export function parseVlogBeatContent(shotDuty: string): { mainContent: string; cameraReference?: VlogCameraReference } {
  const markers = [...shotDuty.matchAll(/【(景别|机位|运镜)】|原片对照[：:]/gu)];
  if (!markers.length) return { mainContent: shotDuty };
  const first = markers[0].index!;
  const reference: VlogCameraReference = { raw: shotDuty.slice(first) };
  const keys = { 景别: "scale", 机位: "viewpoint", 运镜: "movement" } as const;
  markers.forEach((marker, index) => {
    const key = marker[1] ? keys[marker[1] as keyof typeof keys] : "sourceNote";
    const value = shotDuty.slice(marker.index! + marker[0].length, markers[index + 1]?.index).trim();
    if (value) reference[key] = reference[key] ? `${reference[key]}\n${value}` : value;
  });
  // A camera-only legacy record must remain readable, not become an empty beat.
  return { mainContent: shotDuty.slice(0, first).trim() || shotDuty, cameraReference: reference };
}

export const VLOG_CAMERA_REFERENCE_RULE = "先确定内容目标、观看重点、核心动作和时间线，再提供未读图的暂定摄影设计。cameraReference及文字中的景别、机位、构图、运镜均为可选参考，required只约束核心内容；不因勾选必须保留而强制采用参考拍法。description、role、suggestedMaterial、startState/endState和mainAction只写内容、人物与场景，不重复嵌入摄影指令；摄影意图集中写在direction中，读图后可采用、部分采用或替换。旧模板或不完整标记保留了原文，其中的摄影描述仍按暂定意图处理，不能升级为内容硬约束。";

// Older backend records retain retired fields; do not reactivate them in planning.
export function featuredVlogTemplateForPlanning(template: FeaturedVlogTemplate) {
  return {
    name: template.name, outline: template.outline,
    beats: template.beats.map(b => ({ name: b.name, ...parseVlogBeatContent(b.shotDuty), required: b.required })),
    perspectiveGuidance: template.perspectiveGuidance,
    visualGuidance: template.visualGuidance,
    musicTags: template.musicTags,
    referenceVideo: template.referenceVideo ? { id: template.referenceVideo.id, name: template.referenceVideo.name, purpose: "style_and_texture" } : null
  };
}
