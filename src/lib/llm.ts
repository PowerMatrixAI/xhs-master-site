import type { Account, AccountStrategy, AccountTypeTemplate, Asset, NoteTask, WeeklyPlan } from "@/types/domain";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import type { StrategyBundle } from "@/lib/strategy";
import { fallbackReferenceSummary } from "@/lib/referenceResearch";
import { fallbackInteractionSummary } from "@/lib/interactionPrompts";
import { summarizeImageStyleStudyFallback } from "@/lib/imageStyleStudy";
import type { RecentWeeklyTopicGroup } from "@/lib/weeklyTopicHistory";
import { normalizeWeeklyTaskMedia } from "@/lib/weeklyPlan";
import { formatWeeklyPlanningObjectiveRules, type SelectedWeeklyPlanningObjective } from "@/lib/weeklyPlanningObjectives";
import { extractWritingStyleReferences, findWritingStyleReference } from "@/lib/writingStyles";
import { buildWeeklyTopicAngleRequirements, validateWeeklyTopicAnglePlan } from "@/lib/weeklyTopicAngles";

type LlmResult<T> =
  | { usedLlm: true; data: T; model: string }
  | { usedLlm: false; data: T; error?: string };

type NoteTaskSeed = {
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
  knowledgeSourceKeys: string[];
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

function appendAgentAccountIdentity(text: string, account: Pick<Account, "name" | "accountParam">) {
  const accountParam = account.accountParam?.trim() || "未设置";
  const marker = `Agent 账号 ID（accountParam）：\`${accountParam}\``;
  if (text.includes(marker)) return text;

  return `${text.trim()}\n\n## Agent 账号标识\n- 业务账号名称：${account.name}\n- ${marker}\n- 所有需要切换小红书账号的 CLI 命令必须使用：\`--account ${accountParam}\`。账号名称和本系统数据库编号均不可替代该参数。\n`;
}

/** Remove legacy fixed planning sections if an LLM still emits them. */
function stripStrategyFixedPlanningSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1];
      skipping = /正文(?:结构|结构模板)|行文结构(?:模板)?|30\s*天(?:冷启动|启动)?计划|一周内容(?:模板|比例)|内容比例|发布频率比例/i.test(title);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trim();
}

export function getLlmStatus() {
  return {
    enabled: true,
    model: process.env.AI_MODEL || "gpt-5.5",
    baseUrl: `${getBackendApiBaseUrl()}/ai/v1/complete`
  };
}

export async function generateStrategyWithLlm(
  account: Account,
  template: AccountTypeTemplate,
  fallback: StrategyBundle
): Promise<LlmResult<StrategyBundle>> {
  const status = getLlmStatus();
  if (!status.enabled) return { usedLlm: false, data: fallback, error: "AI 未启用，已使用内置模板生成。" };

  const prompt = `请为一个小红书账号生成完整运营策划案和 AGENTS.md。

要求：
- 当前产品模式是 Prompt + Command only，不允许真实发布、评论、点赞、收藏、私信。
- 如果 account.referenceAccounts 中包含参考账号研究洞察，必须优先用于人设、差异化定位、栏目、标题、封面和商业化策略。
- 必须保留 xiaohongshu_auto_op 的执行边界：真实账号操作只输出命令建议，人工确认。
- 不得输出正文结构、正文结构模板、行文结构模板或固定段落顺序；具体每篇帖子的结构留到周计划/单篇任务阶段，根据主题事实和所选爆款文风生成。
- 不得输出 30 天冷启动计划、一周内容模板、一周内容比例或发布频率比例。
- 策划案 Markdown 和 AGENTS.md 都必须包含“Agent 账号标识”章节，写明业务账号名称、Agent 账号 ID（accountParam）以及唯一可用的 \`--account <accountParam>\` 参数。
- 允许使用创作性第一人称、生活场景、情绪和感官体验，让账号内容自然、有画面、有传播力；不要为了形式上的真实性把策划和文案收束成理性说明。
- 以中文输出。
- 只返回 JSON，不要 Markdown 代码块。

账号信息：
${JSON.stringify(
  {
    account,
    accountTypeTemplate: template,
    requiredSections: [
      "账号一句话定位",
      "账号类型判断",
      "人设设定",
      "用户画像",
      "用户痛点",
      "差异化定位",
      "内容主线",
      "内容栏目",
      "选题方向",
      "图片与素材策略",
      "标题策略",
      "封面策略",
      "互动策略",
      "增长策略",
      "商业化路径",
      "风险与禁区",
      "AGENTS.md 内容",
      "给 xiaohongshu_auto_op 的执行说明"
    ],
    fallback
  },
  null,
  2
)}

JSON 字段：
{
  "positioning": "账号一句话定位",
  "strategy": { "可结构化保存的账号策略对象": true },
  "markdown": "# 完整策划方案 Markdown",
  "agentsMdContent": "# AGENTS.md Markdown",
  "execGuide": "给 xiaohongshu_auto_op 的执行说明"
}`;

  const response = await createTextResponse({
    instructions: "你是资深小红书内容运营策略师和自动化工作流编排专家。输出必须安全、具体、可执行，并严格遵守 Prompt + Command only 模式。",
    input: prompt
  });

  if (!response.ok) return { usedLlm: false, data: fallback, error: response.error };

  const parsed = extractJson(response.text);
  if (!parsed || typeof parsed !== "object") {
    return { usedLlm: false, data: fallback, error: "大模型返回内容不是可解析 JSON，已使用内置模板。" };
  }

  const positioning = readString(parsed, "positioning") || fallback.positioning;
  const markdown = appendAgentAccountIdentity(stripStrategyFixedPlanningSections(readString(parsed, "markdown") || fallback.markdown), account);
  const agentsMdContent = appendAgentAccountIdentity(stripStrategyFixedPlanningSections(readString(parsed, "agentsMdContent") || fallback.agentsMdContent), account);
  const execGuide = readString(parsed, "execGuide") || fallback.execGuide;
  const strategyJson = JSON.stringify(readObject(parsed, "strategy") || safeJson(fallback.strategyJson), null, 2);

  return {
    usedLlm: true,
    model: status.model,
    data: {
      positioning,
      strategyJson,
      markdown,
      agentsMdContent,
      execGuide
    }
  };
}

export async function regenerateStrategyFromReferenceResearchWithLlm(input: {
  account: Account;
  template: AccountTypeTemplate;
  referenceSummary: {
    summaryMarkdown: string;
    contentFeatures: string;
    personaInsights: string;
    strategyInsights: string;
    writingStyleInsights: string;
    selectedAccounts: string;
  };
  fallback: StrategyBundle;
}): Promise<LlmResult<StrategyBundle>> {
  const status = getLlmStatus();
  if (!status.enabled) {
      return { usedLlm: false, data: input.fallback, error: "AI 未启用，暂时无法基于参考账号研究重生成策划案与 AGENTS.md。" };
  }

  const prompt = `请严格基于“参考账号研究结果”重生成小红书账号策划案和 AGENTS.md。

这是一个必须借助 AI 重生成的步骤。请不要只复述模板；要把参考账号研究中的作者定位、栏目、标题、正文、图片风格、互动引导、用户痛点和差异化机会转化为我方账号的人设和运营策略。

硬性要求：
- 当前产品模式是 Prompt + Command only，不允许真实发布、评论、点赞、收藏、关注或私信。
- 参考账号只用于学习表达手法和内容灵感，不复制原文、标题、人物经历、具体数据或独特案例；我方内容可以进行合理的创作性演绎。
- 必须写出“借鉴什么”和“如何避免同质化”。
- 最终策划案不得包含“正文结构”“正文结构模板”“行文结构模板”“段落顺序”等通用写作模板；具体每篇帖子的结构留到周计划/单篇任务阶段，根据主题事实和所选爆款文风生成。
- 最终策划案不得包含“30 天启动计划”“一周内容模板”“一周内容比例”或“发布频率比例”等固定排期章节。
- 必须在完整策划案 Markdown 中增加“爆款正文文风库”章节，严格保留 5 种文风，每种 2-4 个案例；案例的标题、作者、URL 与“原文全文”应优先保留，不能仅保留链接、短摘录或改写为概括性标签。整体策划案和 AGENTS.md 单份均控制在 15,000 个中文字符以内，超限时先压缩重复说明和案例数量至每种 2 篇，再适度压缩案例正文。
- 策划案和 AGENTS.md 不要写入本地绝对路径、$PWD、任务目录路径、文件系统调试信息或命令日志。
- 必须在 AGENTS.md 中保留精简版文风库及选择规则：每篇按内容类型、目标用户和内容目标选择一种主文风，必要时最多使用一种辅助文风；学习表达规律，不复制案例原句、个人经历或具体数据；商家账号不得伪装成普通消费者亲历。
- 策划案 Markdown 和 AGENTS.md 都必须包含“Agent 账号标识”章节，写明业务账号名称、Agent 账号 ID（accountParam）以及唯一可用的 \`--account <accountParam>\` 参数。
- 必须生成完整策划案 Markdown 和可直接保存为 profiles/<账号名>/AGENTS.md 的内容。
- 只返回 JSON，不要 Markdown 代码块。

我方账号：
${JSON.stringify(input.account, null, 2)}

账号类型模板：
${JSON.stringify(input.template, null, 2)}

参考账号研究总结：
${JSON.stringify(input.referenceSummary, null, 2)}

内置模板兜底稿，仅供结构参考，不可机械照抄：
${JSON.stringify(input.fallback, null, 2)}

JSON 字段：
{
  "positioning": "基于参考账号研究后的账号一句话定位",
  "strategy": {
    "referenceAccountsUsed": ["参考账号/账号类型/内容特色"],
    "borrowedPatterns": ["可借鉴的栏目、标题、封面、互动模式"],
    "differentiationRules": ["避免同质化的具体规则"],
    "persona": {},
    "contentColumns": [],
    "titleRules": [],
    "coverRules": [],
    "growthRules": [],
    "commercializationRules": [],
    "xhsAutoOpRules": []
  },
  "markdown": "# 完整策划方案 Markdown",
  "agentsMdContent": "# AGENTS.md Markdown",
  "execGuide": "给 xiaohongshu_auto_op 的执行说明"
}`;

  const response = await createTextResponse({
    instructions: "你是资深小红书竞品研究、账号定位和内容运营策略专家。你必须把参考账号研究转化为差异化人设、栏目、标题、封面、互动和商业化策略，并严格遵守 Prompt + Command only 安全边界。",
    input: prompt
  });

  if (!response.ok) return { usedLlm: false, data: input.fallback, error: response.error };

  let parsed = extractJson(response.text);
  if (!parsed) {
    const repaired = await completeWithBackendAi({
      instructions: "你是 JSON 格式修复器。只修复用户提供的策划案结果的 JSON 结构，不新增、删改或概括其中的策划内容。只返回一个合法 JSON 对象，不要输出 Markdown、代码围栏或解释。",
      input: `将以下内容修复为合法 JSON 对象。根对象必须保留 positioning、strategy、markdown、agentsMdContent、execGuide 字段。\n\n待修复内容：\n${response.text.slice(0, 120_000)}`
    });
    if (repaired.ok) parsed = extractJson(repaired.text);
  }
  if (!parsed || typeof parsed !== "object") {
    return { usedLlm: false, data: input.fallback, error: "AI 返回内容不是可解析 JSON，未重生成策划案。" };
  }

  return {
    usedLlm: true,
    model: status.model,
    data: {
      positioning: readString(parsed, "positioning") || input.fallback.positioning,
      strategyJson: JSON.stringify(readObject(parsed, "strategy") || safeJson(input.fallback.strategyJson), null, 2),
      markdown: appendAgentAccountIdentity(stripStrategyFixedPlanningSections(readString(parsed, "markdown") || input.fallback.markdown), input.account),
      agentsMdContent: appendAgentAccountIdentity(stripStrategyFixedPlanningSections(readString(parsed, "agentsMdContent") || input.fallback.agentsMdContent), input.account),
      execGuide: readString(parsed, "execGuide") || input.fallback.execGuide
    }
  };
}

export async function generateWeeklyTasksWithLlm(input: {
  account: Account;
  strategy: AccountStrategy | null;
  assets: Asset[];
  weeklyPlan: WeeklyPlan;
  weeklyInput: WeeklyPlanInput;
  taskCount: number;
  knowledgeSnapshotId?: string;
}): Promise<LlmResult<NoteTaskSeed[]>> {
  const status = getLlmStatus();
  if (!status.enabled) throw new Error("AI 未启用，无法生成本周内容计划。");

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
    availableAssets: input.weeklyInput.availableAssets,
    taboos: input.weeklyInput.taboos,
    weeklyFocus: input.weeklyInput.weeklyFocus,
    selectedObjectives: input.weeklyInput.selectedObjectives?.map(({ id, name }) => ({ id, name }))
  };
  const objectiveRules = formatWeeklyPlanningObjectiveRules(input.weeklyInput.selectedObjectives || []);
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
  const dedupRequirements = recentTopicGroups.length
    ? `
- “最近两次周计划主题”只用于排除重复，不是选题示例；不要复用或改写这些标题。
- 新任务的 topicTitle 不得与历史主题完全相同，也不得只是同一具体主题的近义改写、语序调整或标题包装。
- 内容栏目和内容类型可以重复，但具体对象、问题、场景或切入角度必须明显不同；同一大方向需要改用进阶、对比、细分场景或不同用户问题。`
    : "";
  const prompt = `请根据账号策略、本周目标和素材情况，生成一周小红书 note_tasks。

要求：
- 生成 ${input.taskCount} 篇。
- 其中必须有 ${Math.max(0, Math.min(input.weeklyInput.videoCount || 0, input.taskCount))} 篇 type 为 video_text，其余为 image_text。
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
- 如果服务端注入了“当前账号知识库检索结果”，每篇任务必须返回 knowledgeSourceKeys 字符串数组，只能选择其中标识为 K1-Kn 的来源 key；无相关资料时返回空数组。
${buildWeeklyTopicAngleRequirements(input.taskCount)}
- 只返回 JSON，不要 Markdown 代码块。${dedupRequirements}

${objectiveRules}

输入：
${JSON.stringify(
  {
    account: accountContext,
    strategy: input.strategy,
    availableWritingStyles: availableWritingStyles.map((style) => style.name),
    assets: input.assets.map((asset) => ({
      filePath: asset.filePath,
      fileType: asset.fileType,
      sourceType: asset.sourceType,
      tags: asset.tags,
      suitableTypes: asset.suitableTypes,
      coverReady: asset.coverReady,
      riskNotes: asset.riskNotes
    })),
    weeklyPlan: input.weeklyPlan,
    weeklyInput: weeklyInputContext,
    recentTwoGeneratedPlanTopics: recentTopicGroups
  },
  null,
  2
)}

JSON 字段：
{
  "weeklyAnglePlan": [
    { "id": "angle_1", "referenceBasis": "爆款研究中观察到的选题机制，或明确标注为账号策划与本周重点推导", "adaptedDirection": "该机制在当前账号、本周重点和可写事实中的具体落点" }
  ],
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
      "angleId": "必须唯一引用 weeklyAnglePlan 中的一项",
      "knowledgeSourceKeys": ["只能使用服务端知识上下文中的 K1-Kn；无相关资料时为空数组"],
      "status": "待生成Prompt"
    }
  ]
}`;

  const response = await createTextResponse({
    instructions: "你是小红书周运营计划专家，擅长把账号定位、素材条件和测试假设拆成可执行 note_tasks。",
    input: prompt,
    knowledgeSnapshotId: input.knowledgeSnapshotId
  });

  if (!response.ok) throw new Error(response.error || "AI 未能生成本周内容计划。");

  const parsed = extractJson(response.text);
  const rawTasks = parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).tasks)
    ? ((parsed as Record<string, unknown>).tasks as Array<Record<string, unknown>>)
    : [];

  if (rawTasks.length !== input.taskCount) throw new Error(`大模型返回任务数量异常：期望 ${input.taskCount} 篇，实际 ${rawTasks.length} 篇。`);
  validateWeeklyTopicAnglePlan(parsed, rawTasks, input.taskCount);

  const tasks = rawTasks.map((task, index) => {
    const required = (field: string) => {
      const value = String(task[field] ?? "").trim();
      if (!value) throw new Error(`第 ${index + 1} 篇任务缺少 ${field}。`);
      return value;
    };
    return {
      accountId: input.account.id,
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
      knowledgeSourceKeys: input.knowledgeSnapshotId && Array.isArray(task.knowledgeSourceKeys)
        ? task.knowledgeSourceKeys.map((value) => String(value).trim()).filter(Boolean)
        : [],
      status: "待生成Prompt"
    } satisfies NoteTaskSeed;
  }).map((task, index) => {
    const style = findWritingStyleReference(input.account.referenceAccounts, task.writingStyleName);
    if (!style) {
      throw new Error(`第 ${index + 1} 篇任务返回了文风库中不存在的文风：${task.writingStyleName}。`);
    }
    return { ...task, writingStyleName: style.name, writingStyleReference: style.reference };
  });

  return { usedLlm: true, model: status.model, data: normalizeWeeklyTaskMedia(tasks, input.weeklyInput.videoCount || 0) };
}

export async function summarizeReferenceResearchWithLlm(input: {
  account: Account;
  template: AccountTypeTemplate;
  rawResults: string;
  selectedAccounts: string;
}): Promise<LlmResult<{ summaryMarkdown: string; contentFeatures: string; personaInsights: string; strategyInsights: string; writingStyleInsights: string }>> {
  const fallback = fallbackReferenceSummary(input.rawResults);
  const status = getLlmStatus();
  if (!status.enabled) return { usedLlm: false, data: fallback, error: "AI 未启用，已保存原始结果并使用占位总结。" };

  const prompt = `请总结 xiaohongshu_auto_op 返回的同类型参考账号研究结果，并给出我方账号策划建议。

要求：
- 只分析，不执行任何真实账号操作。
- 参考账号内容用于研究表达手法和内容灵感；我方可基于这些启发进行创作性演绎，但不要逐字复制参考原文。
- 输出必须服务于生成我方账号的人设文件和策划案。
- 必须优先提炼全国同类型爆款/高互动样本的规律；账号所在城市或本地样本只作为落地差异补充，不能让整体风格和内容策略被本地样本局限。
- 必须保留研究报告中的爆款帖子来源署名、标题正文规律和图片风格分析；不得补造作者主页、关注数、粉丝数或作者定位。
- 必须额外输出 writingStyleInsights：直接可读的 Markdown 文本，严格归纳 5 种有明显差异的爆款正文文风；每种列出 2-4 个来自研究原文的真实案例，不得输出第 6 种文风。每个案例必须包含标题、作者、URL、\`原文全文\`和借鉴点。
- writingStyleInsights 中每种文风必须使用三级标题 \`### 文风：唯一名称\` 独立成块，并只写清适用内容类型和用户场景、叙述身份或读者感受、表达语气与视角、句子长短和口语程度、情绪浓度、词汇与细节偏好、建议/产品信息的表达特点，以及容易产生的 AI 味、硬广或同质化问题。
- writingStyleInsights 严禁写正文结构模板或行文顺序：不得出现“结构规律”“常见开场”“先……再……最后……”“段落顺序”“信息释放节奏”“固定结尾”“开场—主体—结尾”等规则，也不要规定某类帖子必须如何组织段落。它只能描述文风表达特征，具体单篇结构由后续笔记任务阶段根据主题和事实单独决定。
- \`原文全文\`必须优先直接保留研究报告中已有的正文，不得改写成概括，也不得根据标题或链接补造原文。若总输出可能超过 15,000 个中文字符，先压缩其他字段和每种文风的案例数量至 2 篇，再允许适度压缩案例正文；每种文风至少保留 2 篇案例。不得输出本地绝对路径、任务目录路径或命令日志。writingStyleInsights 应控制在约 9,000 个中文字符以内。
- 不得补造、推测或要求评论区结论；本次研究不使用评论数据。
- 只返回 JSON，不要 Markdown 代码块。

我方账号：
${JSON.stringify({ account: input.account, template: input.template }, null, 2)}

用户手动标记/补充的参考账号：
${input.selectedAccounts || "无"}

xiaohongshu_auto_op 返回结果：
${input.rawResults}

JSON 字段：
{
  "summaryMarkdown": "# 参考账号研究总结 Markdown（控制在约 5,000 个中文字符内；包含候选爆款帖子、标题正文规律、图片风格、互动引导、可借鉴点、差异化机会和风险；不要重复粘贴文风案例全文）",
  "contentFeatures": "爆款帖标题正文、图片风格和互动引导总结",
  "personaInsights": "对我方账号人设设定的建议",
  "strategyInsights": "对我方内容栏目、标题、封面、增长、商业化路径的建议",
  "writingStyleInsights": "# 爆款正文文风洞察 Markdown（严格 5 种文风，每种 2-4 个案例，约 9,000 字以内；包含表达特征、避免事项、标题/作者/URL/原文全文和借鉴点；不得包含正文结构或行文顺序规则）"
}`;

  const response = await createTextResponse({
    instructions: "你是小红书竞品研究与账号定位专家，擅长把参考账号研究转成差异化人设和内容策略。",
    input: prompt
  });

  if (!response.ok) return { usedLlm: false, data: fallback, error: response.error };
  const parsed = extractJson(response.text);
  if (!parsed) return { usedLlm: false, data: fallback, error: "大模型返回内容不是可解析 JSON，已使用占位总结。" };

  return {
    usedLlm: true,
    model: status.model,
    data: {
      summaryMarkdown: readString(parsed, "summaryMarkdown") || fallback.summaryMarkdown,
      contentFeatures: readString(parsed, "contentFeatures") || fallback.contentFeatures,
      personaInsights: readString(parsed, "personaInsights") || fallback.personaInsights,
      strategyInsights: readString(parsed, "strategyInsights") || fallback.strategyInsights,
      writingStyleInsights: readString(parsed, "writingStyleInsights") || fallback.writingStyleInsights
    }
  };
}

export async function summarizeInteractionCandidatesWithLlm(input: {
  account: Account;
  strategy: AccountStrategy | null;
  noteTask: NoteTask | null;
  rawResults: string;
  discoveryPrompt: string;
  commentPrompt: string;
}): Promise<LlmResult<{ targetUsersMarkdown: string; commentDraftsMarkdown: string }>> {
  const fallback = fallbackInteractionSummary(input.rawResults);
  const status = getLlmStatus();
  if (!status.enabled) return { usedLlm: false, data: fallback, error: "AI 未启用，已保存原始结果并使用人工整理框架。" };

  const prompt = `请分析 xiaohongshu_auto_op 返回的目标用户搜索结果，并生成评论互动策略。

要求：
- 当前产品模式是 Prompt + Command only，只生成策略、草稿和命令建议。
- 不允许真实评论、回复、点赞、收藏、关注或私信。
- 核心目标是筛选可能对我方账号和当前笔记感兴趣的用户。
- 评论草稿必须基于候选用户/评论上下文，不得硬广、不得诱导私信、不得复制刷屏。
- 如果候选信息不足，必须标明需要人工补充，不要编造用户。
- 只返回 JSON，不要 Markdown 代码块。

我方账号：
${JSON.stringify(
  {
    account: input.account,
    strategy: input.strategy
      ? {
          positioning: input.strategy.positioning,
          execGuide: input.strategy.execGuide
        }
      : null,
    noteTask: input.noteTask
  },
  null,
  2
)}

找人 Prompt：
${input.discoveryPrompt}

评论策略 Prompt：
${input.commentPrompt}

xiaohongshu_auto_op 返回结果：
${input.rawResults}

JSON 字段：
{
  "targetUsersMarkdown": "# 目标用户搜索总结 Markdown，包含候选笔记、候选用户、兴趣信号、意向分层、排除对象、人工确认项",
  "commentDraftsMarkdown": "# 评论互动策略 Markdown，包含评论原则、分层策略、12-20 条评论草稿、审核清单、xhs-interact 参数建议"
}`;

  const response = await createTextResponse({
    instructions: "你是小红书社区互动策略专家，擅长从搜索结果和评论区里筛选潜在兴趣用户，并生成克制、真诚、有帮助的评论草稿。你必须严格遵守只生成 Prompt 和命令建议的安全模式。",
    input: prompt
  });

  if (!response.ok) return { usedLlm: false, data: fallback, error: response.error };
  const parsed = extractJson(response.text);
  if (!parsed) return { usedLlm: false, data: fallback, error: "大模型返回内容不是可解析 JSON，已使用人工整理框架。" };

  return {
    usedLlm: true,
    model: status.model,
    data: {
      targetUsersMarkdown: readString(parsed, "targetUsersMarkdown") || fallback.targetUsersMarkdown,
      commentDraftsMarkdown: readString(parsed, "commentDraftsMarkdown") || fallback.commentDraftsMarkdown
    }
  };
}

export async function summarizeImageStyleStudyWithLlm(input: {
  account: Account;
  rawResults: string;
  researchPrompt: string;
}): Promise<LlmResult<{ summaryMarkdown: string; styleBrief: string[] }>> {
  const fallback = summarizeImageStyleStudyFallback(input.account, input.rawResults);
  const status = getLlmStatus();
  if (!status.enabled) return { usedLlm: false, data: fallback, error: "AI 未启用，已使用整理规则生成图片风格摘要。" };

  const prompt = `请总结 xiaohongshu_auto_op 返回的小红书图片风格研究结果。

要求：
- 只分析图片风格，不要重写账号策划案，不要总结互动和商业化。
- 输出要服务于后续 image2 图片 Prompt。
- 不得建议伪造真实拍摄、真实经历、真实授权。
- 必须把长研究压缩为可复用的图片风格原则。
- 只返回 JSON，不要 Markdown 代码块。

我方账号：
${JSON.stringify(input.account, null, 2)}

原始图片研究 Prompt：
${input.researchPrompt}

xiaohongshu_auto_op 返回结果：
${input.rawResults}

JSON 字段：
{
  "summaryMarkdown": "# 图片风格研究摘要 Markdown，包含封面共性、4 张图默认结构、真实感来源、收藏点、风险边界、我方建议",
  "styleBrief": ["可放入单篇图片 Prompt 的短原则，4-6 条，每条不超过 40 字"]
}`;

  const response = await createTextResponse({
    instructions: "你是小红书图片风格研究专家，擅长把竞品图片观察压缩成可执行的 image2 提示词原则。输出必须克制、真实、安全。",
    input: prompt
  });

  if (!response.ok) return { usedLlm: false, data: fallback, error: response.error };
  const parsed = extractJson(response.text);
  if (!parsed) return { usedLlm: false, data: fallback, error: "大模型返回内容不是可解析 JSON，已使用本地规则整理图片风格摘要。" };
  const rawBrief = Array.isArray(parsed.styleBrief) ? parsed.styleBrief : [];
  const styleBrief = rawBrief
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim())
    .slice(0, 8);

  return {
    usedLlm: true,
    model: status.model,
    data: {
      summaryMarkdown: readString(parsed, "summaryMarkdown") || fallback.summaryMarkdown,
      styleBrief: styleBrief.length ? styleBrief : fallback.styleBrief
    }
  };
}

async function createTextResponse(input: { instructions: string; input: string; knowledgeSnapshotId?: string; knowledgeSourceKeys?: string[] }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const status = getLlmStatus();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("backend ai timeout"), 11 * 60 * 1000);

  try {
    const response = await completeWithBackendAi({
      model: status.model,
      instructions: input.instructions,
      input: input.input,
      knowledgeSnapshotId: input.knowledgeSnapshotId,
      knowledgeSourceKeys: input.knowledgeSourceKeys,
      signal: controller.signal
    });

    if (!response.ok) return { ok: false, error: response.error };
    return { ok: true, text: response.text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AI 调用失败。" };
  } finally {
    clearTimeout(timeout);
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const candidates = [
    text.trim(),
    ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1].trim())
  ];
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  for (const candidate of [...candidates, ...objects]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Continue attempting fenced blocks and balanced JSON objects.
    }
  }
  return null;
}

function readString(source: Record<string, unknown>, key: string) {
  return typeof source[key] === "string" ? source[key] : "";
}

function readObject(source: Record<string, unknown>, key: string) {
  return source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
    ? (source[key] as Record<string, unknown>)
    : null;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
