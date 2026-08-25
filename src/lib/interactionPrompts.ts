import type { Account, AccountStrategy, NoteTask } from "@/types/domain";
import { accountVisualMode } from "@/lib/imagePrompts";

type CommandSuggestion = {
  category: string;
  command: string;
  description: string;
  safetyNote: string;
};

type InteractionNoteTask = NoteTask & {
  bodyDraft?: string;
};

function q(value: string) {
  return JSON.stringify(value);
}

function firstPieces(value: string, max = 4) {
  return value
    .split(/[，,、；;\n/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function compactText(value: string, fallback: string, max = 90) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactList(value: string, fallback: string, maxItems = 3, itemMax = 34) {
  const items = firstPieces(value, maxItems);
  return items.length ? items.map((item) => compactText(item, item, itemMax)).join("；") : fallback;
}

function noteBodyDraft(noteTask?: InteractionNoteTask | null) {
  const rawDraft = noteTask?.bodyDraft?.trim();
  if (!rawDraft) return "尚未保存正文草稿，请以选题、观点和可用事实为准。";

  try {
    const parsed = JSON.parse(rawDraft) as Record<string, unknown>;
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    const finalTitle = typeof parsed.finalTitle === "string" ? parsed.finalTitle.trim() : "";
    const commentGuide = typeof parsed.commentGuide === "string" ? parsed.commentGuide.trim() : "";
    const pieces = [
      finalTitle ? `最终标题：${finalTitle}` : "",
      body ? `正文：\n${body}` : "",
      commentGuide ? `评论区引导：${commentGuide}` : ""
    ].filter(Boolean);
    return pieces.length ? pieces.join("\n\n") : compactText(rawDraft, "尚未保存正文草稿", 1800);
  } catch {
    return compactText(rawDraft, "尚未保存正文草稿", 1800);
  }
}

function buildAccountSummary(account: Account, strategy?: AccountStrategy | null) {
  const positioning = compactText(strategy?.positioning || "", "", 110);
  return [
    `账号：${account.name} / ${account.accountParam}`,
    `定位：${positioning || compactList(account.contentDirections, account.accountType, 2)}`,
    `目标用户：${compactList(account.targetUsers, "待根据搜索结果判断", 2)}`,
    `语气：${compactText(account.personaBase, "真诚、克制、有帮助", 64)}`,
    `禁区：${compactList(account.taboos, "不硬广；不诱导私信；不伪造体验；不承诺效果", 3, 36)}`
  ].join("\n- ");
}

function buildNoteSummary(noteTask?: InteractionNoteTask | null) {
  if (!noteTask) return "未绑定具体笔记，以账号整体目标用户为准。";
  return [
    `标题：${noteTask.topicTitle}`,
    `目标用户：${compactText(noteTask.targetUser, "未设置", 70)}`,
    `痛点：${compactText(noteTask.painPoint, "未设置", 90)}`,
    `观点：${compactText(noteTask.coreView, "未设置", 100)}`,
    `核心观点：${compactText(noteTask.coreView, "未设置", 300)}`,
    `评论钩子：${compactText(noteTask.commentHook, "未设置", 80)}`,
    `正文草稿：\n${noteBodyDraft(noteTask)}`
  ].join("\n- ");
}

function accountTypeSeeds(accountType: string) {
  const presets: Record<string, string[]> = {
    culture_tourism: ["周末去哪", "景区攻略", "文旅活动", "古镇街区", "亲子出游", "交通票务", "拍照机位", "避坑"],
    heritage: ["非遗体验", "民俗活动", "传统手作", "亲子研学", "传承人", "节庆活动", "体验预约", "文化旅游"],
    stay: ["民宿推荐", "周边游", "亲子酒店", "露营地", "宠物友好", "房型价格", "周末度假", "预订咨询"],
    food: ["探店", "求推荐餐厅", "不知道吃什么", "聚餐餐厅", "约会餐厅", "团购套餐", "包间预约"],
    outdoor: ["徒步路线", "周末徒步", "新手徒步", "路线攻略", "轨迹", "装备清单", "避坑"],
    museum: ["博物馆", "展览推荐", "亲子研学", "观展攻略", "预约票务", "展品故事", "周末看展"],
    product: ["特产推荐", "伴手礼", "文创礼物", "地域产品", "送礼", "产地故事", "规格价格", "怎么买"],
    service: ["本地服务", "门店推荐", "价格咨询", "预约", "服务流程", "案例", "避坑", "资质"]
  };
  return presets[accountVisualMode(accountType)] || presets.culture_tourism;
}

export function buildInteractionKeywords(account: Account, noteTask?: InteractionNoteTask | null) {
  const pieces = [
    ...accountTypeSeeds(account.accountType),
    account.city,
    ...firstPieces(account.targetUsers, 3),
    ...firstPieces(account.painPoints, 4),
    ...firstPieces(account.contentDirections, 3),
    noteTask?.topicTitle || "",
    noteTask?.painPoint || "",
    noteTask?.targetUser || ""
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(pieces)).slice(0, 10).join(" / ");
}

export function buildInteractionCommands(
  account: Account,
  noteTask?: InteractionNoteTask | null,
  _options?: { publishedNoteUrl?: string; interactionGoal?: string }
): CommandSuggestion[] {
  const base = `uv run python scripts/cli.py --account ${q(account.accountParam)}`;

  return [
    {
      category: "搜索候选笔记",
      command: `${base} search-feeds --keyword ${q("替换为 Agent 生成的关键词")} --sort-by ${q("最新")} --publish-time ${q("一周内")} --search-scope ${q("未看过")}`,
      description: "使用 xhs-explore 搜索近期候选笔记。",
      safetyNote: "搜索结果必须继续读取详情并过滤营销账号，不能直接评论。"
    },
    {
      category: "读取候选笔记详情",
      command: `${base} get-feed-detail --feed-id ${q("FEED_ID")} --xsec-token ${q("XSEC_TOKEN")}`,
      description: "读取帖子正文、互动数据和详情页提供的作者字段，判断相关性以及是否适合互动。",
      safetyNote: "feed_id 与 xsec_token 必须来自同一条搜索结果；不需要读取作者主页。"
    },
    {
      category: "发送针对性评论",
      command: `${base} post-comment --feed-id ${q("FEED_ID")} --xsec-token ${q("XSEC_TOKEN")} --content ${q("为该候选笔记生成的针对性评论")}`,
      description: "使用 xhs-interact 直接发送针对当前帖子生成的评论。",
      safetyNote: "累计收到 10 次成功结果才算完成；登录失效、验证码或风控出现时立即停止。"
    }
  ];
}

export function buildInteractionDiscoveryPrompt(input: {
  account: Account;
  strategy?: AccountStrategy | null;
  noteTask?: InteractionNoteTask | null;
  publishedNoteUrl?: string;
  interactionGoal?: string;
}) {
  const { account, strategy, noteTask, publishedNoteUrl, interactionGoal } = input;
  const accountParam = account.accountParam?.trim() || "请填写账号参数";
  return `# Agent 小红书发布后互动执行任务

请使用 **xiaohongshu_auto_op** 的 **xhs-explore** 和 **xhs-interact** skill 完成本任务。所有搜索、帖子详情读取和评论操作，只能在该 skill 根目录中通过 \`uv run python scripts/cli.py\` 执行，不得改用其他小红书工具。本任务不读取作者主页，不执行 \`user-profile\`。

## 任务目标
- 根据基准笔记内容和互动目标生成搜索关键词，寻找内容相关、适合自然交流的普通用户笔记。
- 为每篇候选笔记生成有针对性的评论，整体倾向为“具体赞美 + 轻微种草”。
- 评论生成后直接执行，不需要用户确认，直到累计成功评论 **10 篇** 不同作者的笔记。
- 建立固定 **20 篇**候选池；不可见、没有评论权限、已删除或评论失败的笔记不计入成功数量，记录原因后继续处理候选池中的下一篇。
- 达到 10 篇成功、候选池全部处理完毕或触发风控时结束，不在候选池之外继续补充笔记。

## 执行账号
- 业务账号：${account.name}
- CLI 账号参数：\`--account ${accountParam}\`

## 基准笔记
- 已发布笔记 URL：${publishedNoteUrl?.trim() || "未填写，以系统中的笔记内容为准"}
- 笔记内容：
- ${buildNoteSummary(noteTask)}

## 互动目标
${interactionGoal?.trim() || "根据这篇已发布笔记，找到可能对该内容和账号感兴趣的用户，进行自然、有帮助、不打扰的评论互动。"}

## 账号上下文
- ${buildAccountSummary(account, strategy)}
- AGENTS.md：${account.profilePath}

## 会话分工要求
1. Agent 主会话必须亲自完成“第一步：生成搜索关键词”，先产出最终的 3 个主题实词和 3 个通用型关键词。
2. 只有关键词生成完成后，主会话才能把已经确定的 6 个关键词、账号参数、笔记上下文、互动目标和第二步至第五步的执行要求一起交给后台子会话。
3. 后台子会话只负责搜索建池、读取详情、过滤、生成评论、执行评论和汇总结果。
4. 禁止主会话在尚未生成关键词时把整个任务原样交给后台子会话，也禁止让后台子会话重新决定或改写关键词。

## 第一步：生成搜索关键词
根据笔记主题、正文、目标用户、痛点和互动目标，严格生成以下两组共 **6 个**关键词：

1. **主题实词 3 个**：选择与本篇笔记内容直接相关、能够指向具体主题的名词或地点词，例如“徒步”“户外”“杭州”。优先从标题、正文主题、内容场景和明确地点中提取，不使用“好看”“不错”“值得”等空泛形容词；只有笔记确实涉及具体城市时才使用城市名。
2. **通用型关键词 3 个**：选择普通用户常用的需求、决策或阶段表达，例如“求推荐”“攻略”“新手”“怎么选”“避坑”。必须与本篇主题的搜索意图相符，不使用“加盟、招商、代理、团购”等营销词。
3. 两组内部及两组之间不得重复或近义堆叠，每个词应能带来不同搜索切面。最终先明确输出“主题实词”和“通用型关键词”两个分组，再逐个用于搜索。

## 第二步：搜索并建立候选池
后台子会话必须在同一批搜索任务中使用第一步生成的全部 6 个关键词：对每个关键词分别执行一次 xhs-explore 搜索，再把全部搜索结果统一汇总、按 feed_id 去重，优先保留不同作者且与笔记主题相关的内容。不得只选择其中部分关键词，也不要把 6 个关键词拼接成一个 \`--keyword\` 参数。命令格式：

\`\`\`bash
uv run python scripts/cli.py --account ${q(accountParam)} search-feeds \\
  --keyword "实际关键词" \\
  --sort-by "最新" \\
  --publish-time "一周内" \\
  --search-scope "未看过"
\`\`\`

从全部关键词的搜索结果中建立固定 **20 篇**候选池，并记录候选顺序。必须先完成 20 篇候选的汇总去重，再进入后续处理；如果全部搜索结果去重后确实不足 20 篇，记录实际候选数量并处理现有候选，不自行生成新的关键词。

## 第三步：只读取帖子详情并过滤
每篇候选只读取帖子详情，不读取作者主页。普通用户判断仅使用搜索结果和帖子详情中可见的标题、正文、昵称、互动数据及内容表达：

\`\`\`bash
uv run python scripts/cli.py --account ${q(accountParam)} get-feed-detail \\
  --feed-id "FEED_ID" \\
  --xsec-token "XSEC_TOKEN"
\`\`\`

优先选择：
- 第一人称真实体验、真实提问、求推荐、求避坑或表达明确需求的内容。
- 正文表达自然、具体，与本篇笔记目标用户和互动目标相符，具有真实体验、问题或决策语境。

必须排除：
- 当前运营账号自己发布的笔记，以及同一作者的重复笔记。
- 昵称或帖子详情明显包含“官方、品牌、门店、招商、加盟、商务合作、团购、代理”等商业身份或营销表达的内容。
- 高频发布价格促销、联系方式、统一营销模板的营销号、搬运号或内容农场。
- 争议、隐私、未成年人、医疗、法律、悲伤事件等不适合营销互动的内容。
- 无法确认内容语境，或无法自然写出具体评论的笔记。

普通用户识别只能作为启发式判断，不得为了判断身份额外读取作者主页；仅凭帖子详情无法确定时宁可跳过，不要强行互动。

## 第四步：生成评论并直接执行
1. 严格按照候选池顺序逐篇处理，不并发评论。每篇先完成详情读取和过滤，通过后再生成一条针对性评论，不得复用同一句模板。
2. 评论必须提到该笔记里的具体细节，先真诚赞美，再自然补充一个与主题相关的轻微种草点；必要时可增加一个自然问题。
3. 不硬广、不引导私信、不宣传当前账号、不虚构亲身经历，不编造价格、效果或服务承诺。
4. 评论生成后不请求用户确认，直接对当前候选执行 \`post-comment\`；每条评论必须先完成帖子详情读取和筛选，不能只根据搜索标题生成。
5. 如果当前笔记不可见、已删除、没有评论权限或评论失败，记录原因并跳过，继续处理候选池中的下一篇。
6. 成功评论累计达到 10 篇时立即完成；如果不足 10 篇，则依次处理到候选池最后一篇后结束，不在候选池外补充笔记。

## 第五步：执行评论
对已经通过详情筛选并生成评论的候选直接执行：

\`\`\`bash
uv run python scripts/cli.py --account ${q(accountParam)} post-comment \\
  --feed-id "FEED_ID" \\
  --xsec-token "XSEC_TOKEN" \\
  --content "为该候选笔记生成的针对性评论"
\`\`\`

执行规则：
- 解析每次 CLI 返回的 JSON，只有明确返回成功才计入成功数量。
- 每篇笔记、每位作者最多成功评论一次。
- 每次评论操作之间随机等待 15-30 秒，不得连续快速评论。
- 不可见、没有评论权限、已删除或普通执行失败时记录原因并换候选池中的下一篇，不计入成功数量，也不重试绕过权限。
- 出现登录失效、验证码、频率限制或任何风控提示时立即停止，不得重试绕过。
- 本任务只允许发表评论，不得顺带点赞、收藏、关注、回复评论或发送私信。

## 完成标准与结果报告
满足以下任一条件后结束：
1. 已累计成功评论 10 篇不同作者的笔记。
2. 候选池中的 20 篇笔记均已依次处理完毕，仍不足 10 篇成功评论。
3. 出现登录、验证码或风控问题。

结束时输出：搜索关键词、成功评论数量、每篇成功笔记的标题/作者/链接/评论内容，以及所有跳过或失败项及原因。不能把“已尝试”写成“已成功”。`;
}

export function buildInteractionCommentPrompt(input: {
  account: Account;
  noteTask?: InteractionNoteTask | null;
  discoveryPrompt: string;
}) {
  return input.discoveryPrompt;
}

export function fallbackInteractionSummary(rawResults: string) {
  const excerpt = rawResults.slice(0, 2600);
  return {
    targetUsersMarkdown: `# 目标用户搜索结果待整理

已保存 xiaohongshu_auto_op 返回内容，但当前未完成大模型总结。

## 原始结果摘录
${excerpt || "暂无原始结果。"}

## 人工整理建议
- 标记评论里有明确问题的人。
- 优先筛选近期活跃、需求具体、和账号定位匹配的用户。
- 排除营销号、争议话题、隐私敏感和需要强承诺的问题。`,
    commentDraftsMarkdown: `# 评论互动草稿待生成

请补充可用的大模型 API 后重新生成，或按以下框架人工撰写：

1. 先回应对方的具体问题。
2. 给一个可验证的小建议。
3. 轻量提问，引导对方补充城市、预算、阶段或需求。
4. 不硬广、不诱导私信、不复制刷屏。`
  };
}
