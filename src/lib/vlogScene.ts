export type VlogCharacter = { id: string; appearance: string; props: string[] };
export type VlogSceneState = {
  location: string;
  characters: Array<{ id: string; position: string; pose: string; view: "full" | "back" | "profile" | "hands" }>;
  props: string[];
};
export type VlogShotScene = {
  startState?: VlogSceneState;
  mainAction?: string;
  endState?: VlogSceneState;
  characterChanges?: Array<{ id: string; type: "enter" | "exit"; reason: string }>;
  continuityNote?: string;
};

export const VLOG_SCENE_RULES = `人物与镜头状态规则：顶层 sceneVersion=1，characters为整片人物表，每人一个稳定id，含appearance（外观、服装）、props（随身道具数组）；纯环境视频可用空数组，不能把人数固定为一人。情侣、家庭等按剧情确定人数，同一人的手部或背影沿用同一id。
每镜增加 startState、mainAction、endState、characterChanges、continuityNote。startState/endState格式为 {"location":"地点","characters":[{"id":"人物id","position":"位置","pose":"姿态","view":"full|back|profile|hands"}],"props":["道具及位置"]}。每个人物id在同一状态中只出现一次。
startState是镜头开始的唯一静态瞬间，endState是动作结束后的另一个时间状态，不得同屏叠加；mainAction只描述一个可执行主要动作。人物由一个位置移动到另一个位置时是同一人移动，不是新增人物。
characterChanges为明确的入场/离场数组，项格式 {"id":"人物id","type":"enter|exit","reason":"剧情依据"}；起止人物相同时为[]，只写起止人数变化，不把移动或手部特写当成新增人物。
continuityNote说明与上一镜的人物、道具、时间和空间承接，首镜写起点；有意跳时或换地点须说明原因。外观、服装和道具统一，不能上一镜放在椅上、下一镜无解释转到桌上。
模板的shotDuty是叙事目的，visualGuidance是实现指导，不要求将全部环节同时画进一张首帧；重要环节可以拆镜，必需剧情仍保留，总镜头数量仍为3-6。复杂动作简化或拆分。`;

const nonempty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);

export function validateVlogScenes(script: { sceneVersion?: number; characters?: VlogCharacter[]; shots: VlogShotScene[] }) {
  if (script.sceneVersion === undefined) return; // Old scripts remain readable, never fabricate states.
  if (script.sceneVersion !== 1 || !Array.isArray(script.characters)) throw new Error("Vlog 人物与场景结构无效。");
  const ids = new Set<string>();
  for (const c of script.characters) {
    if (!c || !nonempty(c.id) || ids.has(c.id) || !nonempty(c.appearance) || !strings(c.props)) throw new Error("Vlog 人物标识重复或外观、道具不完整。");
    ids.add(c.id);
  }
  script.shots.forEach((shot, index) => {
    if (!shot || !nonempty(shot.mainAction) || !nonempty(shot.continuityNote) || !Array.isArray(shot.characterChanges)) throw new Error(`镜头 ${index+1} 缺少主要动作或连续性设计。`);
    const states = [shot.startState, shot.endState].map(state => {
      if (!state || !nonempty(state.location) || !Array.isArray(state.characters) || !strings(state.props)) throw new Error(`镜头 ${index+1} 起止状态不完整。`);
      const seen = new Set<string>();
      for (const c of state.characters) {
        if (!c || !ids.has(c.id) || seen.has(c.id) || !nonempty(c.position) || !nonempty(c.pose) || !["full", "back", "profile", "hands"].includes(c.view)) throw new Error(`镜头 ${index+1} 有未知或重复人物，或人物状态不完整。`);
        seen.add(c.id);
      }
      return seen;
    });
    const expected = new Map<string, string>();
    for (const id of states[0]) if (!states[1].has(id)) expected.set(id, "exit");
    for (const id of states[1]) if (!states[0].has(id)) expected.set(id, "enter");
    const seen = new Set<string>();
    for (const change of shot.characterChanges) {
      if (!change || seen.has(change.id) || expected.get(change.id) !== change.type || !nonempty(change.reason)) throw new Error(`镜头 ${index+1} 人物数量变化与入场/离场设计不一致。`);
      seen.add(change.id);
    }
    if (seen.size !== expected.size) throw new Error(`镜头 ${index+1} 人物凭空出现或消失，缺少剧情依据。`);
  });
}

export function vlogFrameContext(shot: VlogShotScene, characters: VlogCharacter[]) {
  if (!shot.startState) return "首帧仅呈现动作开始的一个瞬间，不同时画出同一人的起始与结束位置。";
  return `首帧唯一状态（不得提前绘制结束状态）：${JSON.stringify(shot.startState)}。本首帧仅出镜 ${shot.startState.characters.length} 位人物，身份外观：${JSON.stringify(characters.filter(c => shot.startState!.characters.some(p => p.id === c.id)))}。手部、背影与全身使用同一身份，不复制人物。输入素材若已有目标人物则复用或调整现有人物，不能重复添加；其他人物需按本首帧出镜设计处理，不得未经读图就假定原素材无人。`;
}

export function vlogMotionPrompt(shot: VlogShotScene, main: string, ending: string, duration: number, characters: VlogCharacter[] = []) {
  const ids = new Set([...(shot.startState?.characters || []), ...(shot.endState?.characters || [])].map(c => c.id));
  return `关键动作在前 ${duration} 秒内完成，额外生成时间自然保持。首帧中已出镜人物沿用原身份，同一人由起始位置移动到结束位置；新人物入场仅按明确的入场设计。人物身份：${JSON.stringify(characters.filter(c => ids.has(c.id)))}。起始状态：${JSON.stringify(shot.startState)}；唯一主要动作：${shot.mainAction}；结束状态：${JSON.stringify(shot.endState)}；明确入场/离场：${JSON.stringify(shot.characterChanges)}。运动细化：${main}；本镜自然收束：${ending}。仅呈现本镜事件，叠化由剪辑器完成。`;
}
