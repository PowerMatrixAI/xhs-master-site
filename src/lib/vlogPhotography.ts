import type { FeaturedVlogScript } from "./featuredVlog";

export const SUBJECT_ROLES = { action:"动作主体", scale:"环境尺度参照", life:"空间生活细节", foreground:"前景引导", pov:"主观体验", environment:"纯环境" };
export const CAMERA_LABELS = { fixed:"固定观察", pan:"原地摇摄", track:"摄影机平移", push:"推进", pull:"拉远", follow:"跟随" };
export const VLOG_PHOTOGRAPHY_RULES = `摄影设计版本 photographyVersion=1。先规划主题与镜头职责，再判断人物是否出现及作用，统筹全片摄影分布，最后展开动作与时间线。
direction增加subjectRole（action人物动作主体、scale人物作环境尺度参照、life人物作为空间生活细节、foreground人物作为前景引导、pov主观体验、environment无人环境及器物）、subjectPresentation（人物大小/位置/可见范围，无人写无人）、focusTarget（主要清晰呈现对象）。camera增加startFrame起幅、endFrame终幅、visualChange可观察构图变化、reason拍法目的。direction各短句不超过15字，timing.action仍不超过20字；保留其他字段，用具体对象与变化表达，避免空泛形容。
人物身份一致不要求居中、露脸、全身或始终清晰。人物朝向与摄影机位置分开设计；背面不等于贴背跟拍。人物可小比例、偏侧、局部、合理遮挡或虚化前景。subjectPresence=environment时subjectRole只能为environment，包括无人茶桌、杯子、座位和水流；life并非泛指静物生活感，而是可见人物在空间中的作用。subjectRole=pov时subjectPresence也必须pov，可无人或仅有手部；action/scale/life/foreground必须有本镜实际可见的人物状态，不能为凑作用而加人。
多样示例（仅摄影关系，不照搬场地）：scale远处小人物点景，环境为焦点；life隔实际门框观察偏侧坐姿；foreground肩背虚化位于边缘，焦点在远景；pov从游客视点观察水纹；environment无人局部自然运动。动作主体只是选项之一，不把所有人物镜头写成中景完整人像。
区分状态与动作过程：“安顿、休息、坐定、继续相处”是内容状态，不等于必须表演站立到坐下；默认从已处于该状态开始，mainAction可写观察、聆听或自然保持，不强加坐下。只有主要内容明确需要姿态转换过程时才设计该动作。相邻环节不能仅换地点重复坐下；输出前比较mainAction和起止姿态，将非必要的重复转换改为结果状态，保留地点与体验内容，不增加新设施活动。合理重复须说明新信息。人物静止时摄影机仍可移动。最后一镜按主题设计收束，不自动fixed。
pan指摄影机原地转动，track指摄影机平移，follow指跟随主体。移动镜头必须写出起幅到终幅的可辨识变化，如前景退出、人物比例改变、空间展开；低速不等于小幅。fixed的visualChange说明主体或环境自然变化或有目的静观，不编造摄影机位移。
输出前在本次请求内检查全片：避免连续三个相似人物比例/位置/作用，避免无理由连续三个fixed，避免重复主要动作。不是机械配额，细节静观可固定；合理重复应在camera.reason说明内容上的必要性。具体机位与运镜仍待全部实际场景图读完后确认，不虚构可用遮挡或路径。`;

/** Conservative editorial hints, never a semantic pass/fail gate. */
export function photographyHints(script: FeaturedVlogScript): string[] {
  const hints: string[] = [];
  const shots = script.shots;
  const normalized = (v?: string) => (v || "").replace(/[\s，。；、：,.!！?？]/g, "");
  for (let i=2;i<shots.length;i++) {
    const group = shots.slice(i-2,i+1);
    if (group.every(s=>s.direction?.camera.type === "fixed") && (i===2 || shots[i-3].direction?.camera.type !== "fixed")) hints.push(`镜头${i-1}–${i+1}连续固定观察，请核对静观目的和节奏；合理固定可保留。`);
    const role=group[0].direction?.subjectRole;
    if (role && !["environment","pov"].includes(role) && group.every(s=>s.direction?.subjectRole===role && normalized(s.direction?.subjectPresentation)===normalized(group[0].direction?.subjectPresentation))) hints.push(`镜头${i-1}–${i+1}人物作用及呈现文字相同，请检查比例、位置与观察关系是否重复。`);
  }
  const actions = new Map<string,number[]>();
  shots.forEach(s=> { const key=normalized(s.mainAction); if (key) actions.set(key,[...(actions.get(key)||[]),s.order]); });
  for (const orders of actions.values()) if(orders.length>1) hints.push(`镜头${orders.join("、")}主要动作文字相同，请检查是否提供了新信息。`);
  const sitting = shots.filter(s => /坐下|坐到|坐在|坐定|落座/.test(s.mainAction || "") && s.startState?.characters.some(c=>/站|立/.test(c.pose)) && s.endState?.characters.some(c=>/坐/.test(c.pose))).map(s=>s.order);
  if (sitting.length>1) hints.push(`镜头${sitting.join("、")}均描述从站立到坐姿，请检查是否重复表现安顿过程；此提示只依据动作和姿态文字。`);
  return hints;
}
