import { completeWithBackendAi } from "@/lib/backendAiClient";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";
import { buildTaskPrompt } from "@/lib/prompt";
import {
  formatWeeklyPlanningObjectiveRules,
  selectedWeeklyPlanningObjectivesFromTheme
} from "@/lib/weeklyPlanningObjectives";

export type DraftVariantId = "playful" | "lively" | "balanced";

export type DraftVariant = {
  id: DraftVariantId;
  label: string;
  title: string;
  body: string;
};

const variantDefinitions: Array<{ id: DraftVariantId; label: string; requirement: string }> = [
  {
    id: "playful",
    label: "版本1",
    requirement: "最大化贴近参考文风。允许夸张、失真、虚构情节、脑内小剧场、强第一人称、密集 Emoji、连续感叹号和省略号；主题仍须保持一致。"
  },
  {
    id: "lively",
    label: "版本2",
    requirement: "强口语、情绪起伏、第一人称倾向、具体生活细节、短句和感叹，但不刻意夸张或失真。"
  },
  {
    id: "balanced",
    label: "版本3",
    requirement: "保留明显分享欲和画面感，信息相对完整，Emoji 和情绪表达适度。"
  },
];

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/iu);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function xhsTitleUnits(title: string) {
  return Array.from(title.replace(/\s+/g, "")).reduce((total, character) => {
    // 小红书标题额度：中文、中文标点和全角字符各计 1，半角英文和数字约两个计 1。
    return total + (/^[\u0000-\u007f]$/u.test(character) ? 0.5 : 1);
  }, 0);
}

export async function generateDraftVariants(input: {
  account: Parameters<typeof buildTaskPrompt>[0]["account"];
  strategy: Parameters<typeof buildTaskPrompt>[0]["strategy"];
  weeklyPlan: Parameters<typeof buildTaskPrompt>[0]["weeklyPlan"];
  noteTask: Parameters<typeof buildTaskPrompt>[0]["noteTask"];
  expertRules?: unknown[];
}) {
  const context = buildTaskPrompt({
    account: input.account,
    strategy: input.strategy,
    weeklyPlan: input.weeklyPlan,
    noteTask: input.noteTask,
    expertRules: formatExpertRulesForPrompt((input.expertRules || []) as never, ["title", "body", "interaction", "risk"])
  });
  const selectedObjectives = selectedWeeklyPlanningObjectivesFromTheme(input.account.accountType, input.weeklyPlan.theme);
  const objectiveRules = selectedObjectives.length
    ? formatWeeklyPlanningObjectiveRules(selectedObjectives)
    : "";

  const response = await completeWithBackendAi({
    instructions: "你是擅长模仿小红书爆款表达的中文文案作者。严格输出合法 JSON，不输出解释、Markdown 代码块或版本生成过程。",
    input: `基于以下单篇笔记上下文，直接生成 3 个可发布到小红书草稿箱的标题和正文版本。\n\n${context}${objectiveRules ? `\n\n${objectiveRules}\n- 上述专项限制的优先级高于品类通用规则、contentGoal 和 coreView 中可能出现的相反暗示；不得自行补写被限制的内容。` : ""}\n\n## 三档表达强度\n${variantDefinitions.map((variant) => `- ${variant.id}（${variant.label}）：${variant.requirement}`).join("\n")}\n\n## 强制要求\n1. 固定输出上述 3 个版本，各出现一次，顺序必须为 playful、lively、balanced。\n2. 三个版本围绕同一主题和同一组图片，不得偏离本篇选题；语气梯度必须明显，不能只替换少量形容词。\n3. 优先模仿“本篇唯一爆款文风参考”中的语气、Emoji、标点、口语、情绪密度、生活细节和句式节奏；不得复制参考标题、原句、独特比喻或具体数据。\n4. 每个 body 必须是完整成品正文，使用简体中文、自然分段，最后一行写 5-6 个话题标签。不要出现版本名称、创作说明、运营术语、AI、Prompt、素材或生成过程。\n5. title 必须是单行成品标题，建议充分使用标题额度，长度优先为 14-20 个小红书标题字符，最多不得超过 20。计数规则：中文汉字、中文标点和全角符号各计 1；英文、数字等半角字符约每 2 个计 1。不要附带话题标签。\n\nJSON 格式：\n{\n  "variants": [\n    { "id": "playful", "label": "版本1", "title": "", "body": "" },\n    { "id": "lively", "label": "版本2", "title": "", "body": "" },\n    { "id": "balanced", "label": "版本3", "title": "", "body": "" }\n  ]\n}`
  });

  if (!response.ok) throw new Error(response.error || "后端 AI 未能生成文案版本。");
  const parsed = extractJson(response.text);
  const rawVariants = parsed && typeof parsed === "object" && Array.isArray((parsed as { variants?: unknown }).variants)
    ? (parsed as { variants: unknown[] }).variants
    : [];

  const variants = variantDefinitions.map((definition, index) => {
    const raw = rawVariants[index];
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const id = readString(item.id);
    const title = readString(item.title);
    const body = readString(item.body);
    if (id !== definition.id || !title || !body) {
      throw new Error(`后端 AI 返回的第 ${index + 1} 个文案版本不完整，请重新生成。`);
    }
    if (xhsTitleUnits(title) > 20) {
      throw new Error(`后端 AI 返回的第 ${index + 1} 个标题超过小红书 20 字符上限，请重新生成。`);
    }
    return { id: definition.id, label: definition.label, title, body } satisfies DraftVariant;
  });

  return { variants, model: response.model };
}
