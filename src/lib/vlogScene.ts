export type VlogCharacter = { id: string; appearance: string; props: string[] };
export type VlogSceneState = {
  location: string;
  characters: Array<{ id: string; position: string; pose: string; view: "full" | "front" | "back" | "profile" | "hands" }>;
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
同一条视频的主体住客使用同一个稳定id，不能每换场景新设计一位游客。模板及用户未指定时，主角倾向为20-30岁成年女性；appearance明确性别、年龄范围、可辨识五官、发型和固定服装。已有明确人物设定优先，多人各自保持身份，不把所有人改成同一人。全片保持同一脸型、五官、发型、服装、体态和随身物品；改变朝向或表情不改变身份。
正面、侧面、背面按叙事与动作选择，没有正脸数量要求。自然情境允许时可清晰正面出镜，但正脸不等于直视摄影机或端正摆拍，不为凑正脸镜头改变动作；纯POV、手部或无人风景不强行加人，明确指定的特殊视角优先。
每镜增加 startState、mainAction、endState、characterChanges、continuityNote。startState/endState格式为 {"location":"地点","characters":[{"id":"人物id","position":"位置","pose":"姿态","view":"full|front|back|profile|hands"}],"props":["道具及位置"]}。每个人物id在同一状态中只出现一次。front表示正面/正脸，profile表示侧面，back表示背面，full表示全身景别。人物可以自然正面出镜并表达情绪，不统一回避正脸或只拍背影；按叙事动作选择正面、侧面、背面及细节视角。
startState是镜头开始的唯一静态瞬间，endState是动作结束后的另一个时间状态，不得同屏叠加；mainAction只描述一个可执行主要动作。人物由一个位置移动到另一个位置时是同一人移动，不是新增人物。
characterChanges为明确的入场/离场数组，项格式 {"id":"人物id","type":"enter|exit","reason":"剧情依据"}；起止人物相同时为[]，只写起止人数变化，不把移动或手部特写当成新增人物。
startState.characters和endState.characters只记录本镜画面实际可见的人物；摄影机代表住客视点不等于住客出镜，纯POV或无人空间快照可以为[]，可见手部仍记同一人物id。
characterChanges只比较本镜startState与endState，不与上一镜比较。“进入其中”可以是剪辑切换到室内或住客视点，不强制表现人物走入画面。上一镜无人、下一镜首帧已有A，仅在continuityNote说明视角变化，下一镜起止都有A则characterChanges=[]。
正确示例：起始[A]结束[A]，A由门口走到窗边或从背影变手部特写，characterChanges=[]；起始[]结束[A]且A在本镜内走入画面，填A enter并说明依据；起始[A]结束[]且A在本镜内走出画面，填A exit。不得因为换地点、坐下、转身或上一镜未出镜而给本镜添加enter。
continuityNote说明与上一镜的人物、道具、时间和空间承接，首镜写起点；有意跳时或换地点须说明原因。外观、服装和道具统一，不能上一镜放在椅上、下一镜无解释转到桌上。
模板的shotDuty是叙事目的，visualGuidance是实现指导，不要求将全部环节同时画进一张首帧；重要环节可以拆镜，必需剧情仍保留，总镜头数量仍为3-6。复杂动作简化或拆分。`;

const nonempty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);

export class VlogCharacterChangeError extends Error {
  constructor(public shotIndex: number, public expectedChanges: Array<{ id: string; type: string }>, detail: string) {
    super(detail);
    this.name = "VlogCharacterChangeError";
  }
}

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
        if (!c || !ids.has(c.id) || seen.has(c.id) || !nonempty(c.position) || !nonempty(c.pose) || !["full", "front", "back", "profile", "hands"].includes(c.view)) throw new Error(`镜头 ${index+1} 有未知或重复人物，或人物状态不完整。`);
        seen.add(c.id);
      }
      return seen;
    });
    const expected = new Map<string, string>();
    for (const id of states[0]) if (!states[1].has(id)) expected.set(id, "exit");
    for (const id of states[1]) if (!states[0].has(id)) expected.set(id, "enter");
    const seen = new Set<string>();
    const failChanges = () => {
      const expectedChanges = [...expected].map(([id, type]) => ({ id, type }));
      const observed = shot.characterChanges!.map(c => c ? `${c.id}:${c.type}${nonempty(c.reason) ? "" : "（缺少原因）"}` : "无效项").join("、") || "无";
      throw new VlogCharacterChangeError(index, expectedChanges, `镜头 ${index+1} 人物变化不一致：本镜起始[${[...states[0]].join("、") || "无人"}]，结束[${[...states[1]].join("、") || "无人"}]；应记录${expectedChanges.map(c => `${c.id}:${c.type}`).join("、") || "无入场/离场（[]）"}，实际记录${observed}。人物凭空变化、重复记录或缺少原因均不允许；跨镜头换场景不属于本镜入场。`);
    };
    for (const change of shot.characterChanges) {
      if (!change || seen.has(change.id) || expected.get(change.id) !== change.type || !nonempty(change.reason)) failChanges();
      seen.add(change.id);
    }
    if (seen.size !== expected.size) failChanges();
  });
}

function stateText(state?: VlogSceneState) {
  if (!state) return "按已确认脚本";
  return `${state.location}；${state.characters.map(c => `${c.id}@${c.position}/${c.pose}/${c.view}`).join("；") || "无人出镜"}；道具：${state.props.join("、") || "无"}`;
}

export function vlogFrameContext(shot: VlogShotScene, characters: VlogCharacter[]) {
  if (!shot.startState) return "首帧仅呈现动作开始的一个瞬间，不同时画出同一人的起始与结束位置。";
  return `首帧：${stateText(shot.startState)}。本首帧仅出镜 ${shot.startState.characters.length} 位人物；${characters.filter(c => shot.startState!.characters.some(p => p.id === c.id)).map(c => `${c.id}:${c.appearance}`).join("；")}。同id全片同一五官、发型、服装；front清晰正脸，不能自动改侧脸。不复制、不提前画结束位置。素材已有目标人物则复用或调整现有人物；按设计处理其他人，标签不能证明无人。`;
}

export function vlogMotionPrompt(shot: VlogShotScene, main: string, ending: string, duration: number, characters: VlogCharacter[] = []) {
  const entering = new Set(shot.characterChanges?.filter(c => c.type === "enter").map(c => c.id));
  return `前${duration}秒完成动作，额外时间自然保持。沿用首帧同一脸型、五官、发型、服装，不复制或换人；front按脚本保持可见正脸。起始：${stateText(shot.startState)}。主动作：${shot.mainAction}。结束：${stateText(shot.endState)}。入场/离场：${JSON.stringify(shot.characterChanges)}；${characters.filter(c => entering.has(c.id)).map(c => `${c.id}:${c.appearance}`).join("；")}。运动细化：${main}。收束：${ending}。仅本镜事件，叠化后期完成。`;
}
