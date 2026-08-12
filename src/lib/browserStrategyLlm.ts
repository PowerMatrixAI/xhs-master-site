import { accountTypeTemplates, getTemplateByKey } from "@/data/accountTypeTemplates";
import { completeWithBackendAi } from "@/lib/backendAiClient";
import type { RecentWeeklyTopicGroup } from "@/lib/weeklyTopicHistory";
import { normalizeWeeklyTaskMedia } from "@/lib/weeklyPlan";
import { formatWeeklyPlanningObjectiveRules, type SelectedWeeklyPlanningObjective } from "@/lib/weeklyPlanningObjectives";
import { extractWritingStyleReferences, findWritingStyleReference } from "@/lib/writingStyles";

type ClientAccountInput = {
  id?: number;
  name: string;
  accountParam: string;
  accountType: string;
  stage: string;
  personaBase: string;
  city: string;
  targetUsers: string;
  painPoints: string;
  contentDirections: string;
  businessGoals: string;
  monetization: string;
  referenceAccounts: string;
  materialCondition: string;
  taboos: string;
  profilePath: string;
  assetsPath: string;
};

type StrategyResponse = {
  positioning: string;
  strategyJson: string;
  markdown: string;
  agentsMdContent: string;
  execGuide: string;
};

type WeeklyTaskSeed = {
  accountId: number;
  weeklyPlanId: number;
  publishAt: string;
  contentType: string;
  contentGoal: string;
  topicTitle: string;
  targetUser: string;
  painPoint: string;
  coreView: string;
  type: "image_text" | "video_text";
  requiredMaterials: string;
  recommendedAssets: string;
  coverCopyDirection: string;
  commentHook: string;
  expectedGoal: string;
  writingStyleName: string;
  writingStyleReference: string;
  status: string;
};

type WeeklyPlanInput = {
  theme: string;
  goal: string;
  frequency: number;
  videoCount?: number;
  ratio: string;
  testHypothesis: string;
  commercializationMove: string;
  interactionGoal: string;
  availableAssets: string;
  taboos: string;
  weeklyFocus?: string;
  recentTopicGroups?: RecentWeeklyTopicGroup[];
  selectedObjectives?: SelectedWeeklyPlanningObjective[];
};

function appendOpenClawAccountIdentity(text: string, account: Pick<ClientAccountInput, "name" | "accountParam">) {
  const accountParam = account.accountParam?.trim() || "未设置";
  const marker = `OpenClaw 账号 ID（accountParam）：\`${accountParam}\``;
  if (text.includes(marker)) return text;

  return `${text.trim()}\n\n## OpenClaw 账号标识\n- 业务账号名称：${account.name}\n- ${marker}\n- 所有需要切换小红书账号的 CLI 命令必须使用：\`--account ${accountParam}\`。账号名称和本系统数据库编号均不可替代该参数。\n`;
}

function stripStrategyResearchAndCommandSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1];
      skipping = /研究.*命令|命令.*建议|研究建议|给.*(?:OpenClaw|xiaohongshu_auto_op).*执行说明/i.test(title);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trim();
}

function stripStrategyFixedPlanningSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      skipping = /正文(?:结构|结构模板)|行文结构(?:模板)?|30\s*天(?:冷启动|启动)?计划|一周内容(?:模板|比例)|内容比例|发布频率比例/i.test(heading[1]);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trim();
}

function getBrowserLlmStatus() {
  return {
    enabled: true,
    model: process.env.AI_MODEL || "gpt-5.5",
    baseUrl: "ai/v1/complete"
  };
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function readString(obj: unknown, key: string) {
  if (!obj || typeof obj !== "object") return "";
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readObject(obj: unknown, key: string) {
  if (!obj || typeof obj !== "object") return null;
  const value = (obj as Record<string, unknown>)[key];
  return value && typeof value === "object" ? value : null;
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function extractText(json: unknown) {
  if (!json || typeof json !== "object") return "";
  const record = json as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as Record<string, unknown>;
      return typeof item.text === "string" ? item.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractChatCompletionText(json: unknown) {
  if (!json || typeof json !== "object") return "";
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return "";
  return choices
    .map((choice) => {
      if (!choice || typeof choice !== "object") return "";
      const message = (choice as Record<string, unknown>).message;
      if (!message || typeof message !== "object") return "";
      const content = (message as Record<string, unknown>).content;
      return typeof content === "string" ? content : "";
    })
    .filter(Boolean)
    .join("\n");
}

function looksLikeUnsupportedResponses(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("404") ||
    lower.includes("unsupported") ||
    lower.includes("unknown") ||
    lower.includes("invalid url") ||
    lower.includes("no route") ||
    lower.includes("route")
  );
}

async function createTextResponse(input: { instructions: string; input: string }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("AI request timeout"), 11 * 60 * 1000);

  try {
    const response = await completeWithBackendAi({
      instructions: input.instructions,
      input: input.input,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateStrategyWithBrowserLlm(account: ClientAccountInput): Promise<{
  usedLlm: boolean;
  error?: string;
  data: StrategyResponse;
}> {
  const templateSeed = getTemplateByKey(account.accountType) ?? accountTypeTemplates[0];
  const accountRecord = {
    ...account,
    id: account.id || 0,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  };
  const status = getBrowserLlmStatus();
  if (!status.enabled) {
    throw new Error("AI 未启用，无法生成账号策划案。");
  }

  const strategySections = [
    "账号基础判断：账号类型判断、账号阶段、所在城市/区域、账号定位、人设设定、目标用户、用户顾虑、当前目标",
    "账号核心策略：核心价值、差异化定位、内容主线、内容栏目、选题方向、内容优先级、暂不建议涉及的方向、商业化方向概览",
    "阶段执行计划：当前阶段目标、数据观察指标、复盘与调整策略",
    "事实与执行边界：客户信息、创作空间、账号运营边界、素材使用说明、OpenClaw 账号标识"
  ];
  const safetyRules = [
    "只生成策划、Prompt 和命令建议，不执行真实发布、评论、点赞、收藏、关注或私信。",
    "允许根据账号定位创作第一人称体验、情绪、场景和感官细节，让策划具有生活感和传播力。",
    "参考账号只用于学习表达风格和内容灵感，不复制原文、标题、人物经历或独特案例。",
    "账号和 OpenClaw 的真实发布、互动、素材路径及权限仍按系统安全边界执行。"
  ];
  const prompt = `请为一个小红书账号生成一份针对客户实际情况的账号策划案和 AGENTS.md。

要求：
- 只能按照“策划结构”组织输出，不要套用行业固定栏目、标题公式、封面套路、商业化路径或固定 30 天计划。
- 每个条目的具体内容应根据客户填写的信息和账号定位推导；允许补充合理的创作性体验、场景和情绪，不要把策划写成资料缺口清单。
- 最终策划案不得包含正文结构、正文结构模板、行文结构模板、段落顺序等固定写作模板；每篇帖子的结构留到周计划/单篇任务阶段，再结合主题事实和所选爆款文风生成。
- 最终策划案不得包含 30 天冷启动计划、一周内容模板、一周内容比例或发布频率比例。
- 本阶段只生成账号定位、核心策略、简化执行计划和内容创作边界，不生成统一正文结构模板；标题、封面、正文表达和爆款文风留给后续研究及单篇任务阶段。
- 策划案 Markdown 不得包含研究任务、研究建议、命令建议、CLI 命令或 OpenClaw 执行说明章节。
- 必须包含 OpenClaw 账号标识，写明业务账号名称、OpenClaw 账号 ID（accountParam）以及唯一可用的 \`--account <accountParam>\` 参数。
- ${safetyRules.join("\n- ")}
- 以中文输出。
- 只返回 JSON，不要 Markdown 代码块。

账号信息：
${JSON.stringify(
    {
      account: accountRecord,
      accountType: { typeKey: templateSeed.typeKey, name: templateSeed.name },
      strategySections
    },
    null,
    2
  )}

JSON 字段：
{
  "positioning": "账号一句话定位",
  "strategy": {
    "basicAssessment": {},
    "coreStrategy": {},
    "executionPlan": {},
    "boundaries": {}
  },
  "markdown": "# 完整策划方案 Markdown",
  "agentsMdContent": "# AGENTS.md Markdown",
  "execGuide": "给 xiaohongshu_auto_op 的执行说明"
}`;

  try {
    const text = await createTextResponse({
      instructions: "你是资深小红书内容运营策略师和自动化工作流编排专家。输出必须安全、具体、可执行，并严格遵守 Prompt + Command only 模式。",
      input: prompt
    });

    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("大模型返回内容不是可解析 JSON，未生成账号策划案。");
    }

    const positioning = readString(parsed, "positioning");
    const strategy = readObject(parsed, "strategy");
    const markdown = readString(parsed, "markdown");
    const agentsMdContent = readString(parsed, "agentsMdContent");
    const execGuide = readString(parsed, "execGuide");
    if (!positioning || !strategy || !markdown || !agentsMdContent || !execGuide) {
      throw new Error("大模型返回的策划案缺少必要条目，未生成账号策划案。");
    }

    return {
      usedLlm: true,
      data: {
        positioning,
        strategyJson: JSON.stringify(strategy, null, 2),
        markdown: appendOpenClawAccountIdentity(stripStrategyFixedPlanningSections(stripStrategyResearchAndCommandSections(markdown)), accountRecord),
        agentsMdContent: appendOpenClawAccountIdentity(stripStrategyFixedPlanningSections(agentsMdContent), accountRecord),
        execGuide
      }
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "浏览器端 AI 调用失败。");
  }
}

export async function generateWeeklyTasksWithBrowserLlm(input: {
  account: ClientAccountInput & { strategy?: unknown | null };
  strategy: unknown | null;
  weeklyPlan: { id: number };
  weeklyInput: WeeklyPlanInput;
  taskCount: number;
}): Promise<{
  usedLlm: boolean;
  error?: string;
  data: WeeklyTaskSeed[];
}> {
  const status = getBrowserLlmStatus();
  if (!status.enabled) {
    throw new Error("AI 未启用，无法生成本周内容计划。");
  }

  const recentTopicGroups = input.weeklyInput.recentTopicGroups || [];
  const availableWritingStyles = extractWritingStyleReferences(input.account.referenceAccounts);
  if (!availableWritingStyles.length) {
    throw new Error("当前账号缺少可用的爆款正文文风库。请先完成爆款研究后再生成周计划。");
  }
  const weeklyInputContext = {
    theme: input.weeklyInput.theme,
    goal: input.weeklyInput.goal,
    frequency: input.weeklyInput.frequency,
    videoCount: input.weeklyInput.videoCount,
    ratio: input.weeklyInput.ratio,
    testHypothesis: input.weeklyInput.testHypothesis,
    commercializationMove: input.weeklyInput.commercializationMove,
    interactionGoal: input.weeklyInput.interactionGoal,
    taboos: input.weeklyInput.taboos,
    weeklyFocus: input.weeklyInput.weeklyFocus,
    selectedObjectives: input.weeklyInput.selectedObjectives?.map(({ id, name }) => ({ id, name }))
  };
  const objectiveRules = formatWeeklyPlanningObjectiveRules(input.weeklyInput.selectedObjectives || []);
  const dedupRequirements = recentTopicGroups.length
    ? `
- “最近两周历史主题”只用于排除重复，不是选题示例；不要复用或改写这些标题。
- 新任务的 topicTitle 不得与历史主题完全相同，也不得只是同一具体主题的近义改写、语序调整或标题包装。
- 内容栏目和内容类型可以重复，但具体对象、问题、场景或切入角度必须明显不同；同一大方向需要改用进阶、对比、细分场景或不同用户问题。`
    : "";
  const accountContext = {
    id: input.account.id,
    name: input.account.name,
    accountParam: input.account.accountParam,
    accountType: input.account.accountType,
    stage: input.account.stage,
    personaBase: input.account.personaBase,
    city: input.account.city,
    targetUsers: input.account.targetUsers,
    painPoints: input.account.painPoints,
    contentDirections: input.account.contentDirections,
    businessGoals: input.account.businessGoals,
    monetization: input.account.monetization,
    referenceAccounts: input.account.referenceAccounts,
    materialCondition: input.account.materialCondition,
    taboos: input.account.taboos,
    profilePath: input.account.profilePath,
    assetsPath: input.account.assetsPath
  };
  const prompt = `请根据账号策略、本周目标和素材情况，生成一周小红书 note_tasks。

要求：
- 生成 ${input.taskCount} 篇。
- 其中必须有 ${Math.max(0, Math.min(input.weeklyInput.videoCount || 0, input.taskCount))} 篇 type 为 video_text，其余为 image_text；视频任务应优先选择适合动态演示、空间动线、过程或氛围表达的选题。
- 必须优先阅读并遵循输入中的完整 strategy；账号定位、人设、目标用户、内容栏目、标题封面策略、商业化路径和风险边界都应以 strategy 为主要依据，不能只依据账号类型套用通用模板。
- 必须阅读 account.referenceAccounts 和 strategy 中的“爆款正文文风库”。为每篇任务在内部选择一种最贴合主题、目标用户和可写事实的主文风，并让该文风的表达偏好影响选题角度、标题方向、内容目标和核心观点；不要输出正文结构、段落顺序或行文步骤。
- 每篇任务必须从输入的 availableWritingStyles 中选择且只能选择一种文风，并在 writingStyleName 返回该文风的精确名称。不得自创、改写或混用文风名称；该选择会被保存，并作为后续草稿阶段唯一可用的文风参考。
- 优先把每篇任务设计为围绕一个具体且可写的产品、菜品、服务、活动、体验或在地场景展开；有真实素材或可核验信息时，应在 topicTitle、contentGoal 和 coreView 中点出具体对象、可感知细节和用户能获得的体验，不要只给“菜单、预算、价格透明、避免踩雷、降低顾虑”等抽象理性设定。
- 除非用户本周重点明确要求价格、预约、交通等决策信息，否则不得把它们单独设为一篇帖子的主轴；这类信息只能作为具体产品、服务、活动或体验内容的辅助事实。
- contentGoal 和 coreView 应描述本篇要呈现的具体内容、关键词、真实细节与用户感受，不得写成点单教程、风险提示、运营分析或“先/再/最后”的行文规则。
- 如果 weeklyInput.weeklyFocus 非空，它代表用户主动指定的本周重点，应作为本周选题的最高优先级；围绕该重点拆分具体且不重复的任务，但不得违反下方“已选本周运营目标的专项限制”。只有用户明确要求某项内容时，才可突破该目标中的对应默认限制。
- 如果 weeklyInput.weeklyFocus 为空，则以完整 strategy 和本周运营目标为主要依据生成选题。
- 当前执行模式是只生成计划、Prompt 和命令建议，不允许真实发布或互动。
- 每篇任务必须具体到用户痛点、核心观点、可写事实与素材范围、图片或视频素材要求、评论区钩子。
- 不要输出正文结构、段落顺序、开场方式、文风、句式节奏或任何“先/再/最后”的行文指令。
- 信息不足时优先使用合理的创作性场景、情绪和感官表达补足内容，不要把资料缺口或核验说明写成帖子主内容。
- 推荐素材只能来自输入素材或明确写“素材缺口”，禁止伪造真实素材。
- 只返回 JSON，不要 Markdown 代码块。${dedupRequirements}

${objectiveRules}

输入：
${JSON.stringify(
    {
      account: accountContext,
      strategy: input.strategy,
      availableWritingStyles: availableWritingStyles.map((style) => style.name),
      weeklyPlan: input.weeklyPlan,
      weeklyInput: weeklyInputContext,
      recentTwoWeeksTopics: recentTopicGroups
    },
    null,
    2
  )}

JSON 字段：
{
  "tasks": [
    {
      "publishAt": "YYYY-MM-DD HH:mm",
      "contentType": "图文笔记/视频脚本/教程清单等",
      "contentGoal": "",
      "topicTitle": "",
      "targetUser": "",
      "painPoint": "",
      "coreView": "",
      "type": "image_text 或 video_text",
      "requiredMaterials": "",
      "recommendedAssets": "",
      "coverCopyDirection": "",
      "commentHook": "",
      "expectedGoal": "",
      "writingStyleName": "必须与 availableWritingStyles 中的一项完全一致",
      "status": "待生成Prompt"
    }
  ]
}`;

  try {
    const text = await createTextResponse({
      instructions: "你是小红书周运营计划专家，擅长把账号定位、素材条件和测试假设拆成可执行 note_tasks。",
      input: prompt
    });
    const parsed = extractJson(text);
    const rawTasks = parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).tasks)
      ? ((parsed as Record<string, unknown>).tasks as Array<Record<string, unknown>>)
      : [];

    if (rawTasks.length !== input.taskCount) throw new Error(`大模型返回任务数量异常：期望 ${input.taskCount} 篇，实际 ${rawTasks.length} 篇。`);

    const tasks = rawTasks.map((task, index) => {
      const required = (field: string) => {
        const value = String(task[field] ?? "").trim();
        if (!value) throw new Error(`第 ${index + 1} 篇任务缺少 ${field}。`);
        return value;
      };
      return {
        accountId: input.account.id || 0,
        weeklyPlanId: input.weeklyPlan.id,
        publishAt: required("publishAt"),
        contentType: required("contentType"),
        contentGoal: required("contentGoal"),
        topicTitle: required("topicTitle"),
        targetUser: required("targetUser"),
        painPoint: required("painPoint"),
        coreView: required("coreView"),
        type: task.type === "video_text" ? "video_text" as const : "image_text" as const,
        requiredMaterials: required("requiredMaterials"),
        recommendedAssets: required("recommendedAssets"),
        coverCopyDirection: required("coverCopyDirection"),
        commentHook: required("commentHook"),
        expectedGoal: required("expectedGoal"),
        writingStyleName: required("writingStyleName"),
        writingStyleReference: "",
        status: "待生成Prompt"
      } satisfies WeeklyTaskSeed;
    }).map((task, index) => {
      const style = findWritingStyleReference(input.account.referenceAccounts, task.writingStyleName);
      if (!style) {
        throw new Error(`第 ${index + 1} 篇任务返回了文风库中不存在的文风：${task.writingStyleName}。`);
      }
      return { ...task, writingStyleName: style.name, writingStyleReference: style.reference };
    });

    return { usedLlm: true, data: normalizeWeeklyTaskMedia(tasks, input.weeklyInput.videoCount || 0) };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "浏览器端一周计划生成失败。");
  }
}
