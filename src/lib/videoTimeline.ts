export type VideoTransition = {
  type: "cut" | "dissolve";
  duration: number;
  reason: string;
  outgoingState: string;
  incomingState: string;
};

export type TimedVideoShot = {
  order?: number;
  duration?: number;
  transitionToNext?: VideoTransition | null;
  narrationText?: string;
};

// Enable only after the Beijing provider probes and compatible executor rollout.
export function videoTimelineV2Enabled() {
  return process.env.VIDEO_TIMELINE_V2_ENABLED === "true";
}

export const VIDEO_TIMELINE_PROMPT = `时间线规则：顶层 timingVersion 必须为 2。输出 3-6 镜头，整片以 20-40 秒为创作目标，不为凑时长添加空动作。
每镜增加 duration：2-10 秒数字，0.5 秒步进，优先 2-8 秒，按动作复杂度和情绪分配。
每镜增加 transitionToNext：末镜必须为 null；其他镜头为 {"type":"cut 或 dissolve","duration":0,"reason":"衔接理由","outgoingState":"本镜结束的主体位置、动作、运动方向与构图","incomingState":"下镜开头如何承接"}。
cut 的 duration=0，以动作、构图或运动方向匹配自然切换；dissolve 的 duration 只能是 0.25、0.5、0.75，且不得超过相邻较短镜头 duration 的四分之一。时间、地点或情绪变化才使用短叠化，不要求每镜叠化。
成片总长为所有 duration 之和减去所有叠化 duration 之和。叠化由后期剪辑完成，不要求画面变形成下一场景。`;

export function validateVideoTimeline(version: unknown, shots: readonly TimedVideoShot[], narration = false): void {
  if (version === undefined || version === 1) return;
  if (version !== 2 || shots.length < 3 || shots.length > 6) throw new Error("视频时间线版本或镜头数量无效。");
  shots.forEach((shot, i) => {
    if (!shot || typeof shot !== "object" || shot.order !== i + 1) throw new Error("视频镜头顺序无效。");
    const d = shot.duration;
    if (typeof d !== "number" || !Number.isFinite(d) || d < 2 || d > 10 || !Number.isInteger(d * 2)) {
      throw new Error(`镜头 ${i + 1} 时长必须为 2–10 秒，按 0.5 秒递增。`);
    }
    const t = shot.transitionToNext;
    if (i === shots.length - 1) {
      if (t !== null) throw new Error("末镜必须明确设置 transitionToNext=null。");
    } else {
      if (!t || !["cut", "dissolve"].includes(t.type) || ![t.reason, t.outgoingState, t.incomingState].every(v => typeof v === "string" && v.trim())) {
        throw new Error(`镜头 ${i + 1} 缺少有效的转场与衔接设计。`);
      }
      if (t.type === "cut" ? t.duration !== 0 : ![0.25, 0.5, 0.75].includes(t.duration) || t.duration > Math.min(d, shots[i + 1].duration ?? 0) / 4) {
        throw new Error(`镜头 ${i + 1} 转场时长无效。`);
      }
    }
    if (narration && (typeof shot.narrationText !== "string" || !shot.narrationText.trim() || Array.from(shot.narrationText).length > 30)) {
      throw new Error(`镜头 ${i + 1} 必须包含不超过 30 字的已确认旁白。`);
    }
  });
}

export function videoTimelineDuration(shots: readonly TimedVideoShot[], version?: number) {
  return version === 2 ? shots.reduce((sum, s) => sum + (s.duration || 0) - (s.transitionToNext?.duration || 0), 0) : shots.length * 5;
}

export function timedMotionPrompt(shot: TimedVideoShot, main: string, ending: string, incomingState = "自然开始") {
  return `关键动作在前 ${shot.duration} 秒内完整完成，额外生成时间自然保持。本镜开始状态：${incomingState}。主体动态：${main}；自然收束：${ending}。本镜结束状态：${shot.transitionToNext?.outgoingState || "自然收束"}；邻镜承接状态：${shot.transitionToNext?.incomingState || "整片结束"}。不在本镜内部切镜或变形成下一场景；叠化由剪辑器执行。`;
}
