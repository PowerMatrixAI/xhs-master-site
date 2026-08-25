import type { Account, AccountTypeTemplate } from "@/types/domain";
import { listBlock } from "@/lib/markdown";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type StrategyBundle = {
  positioning: string;
  strategyJson: string;
  markdown: string;
  agentsMdContent: string;
  execGuide: string;
};

export function buildAccountStrategy(account: Account, template: AccountTypeTemplate): StrategyBundle {
  const columns = parseJson<string[]>(template.defaultColumns, []);
  const ratio = parseJson<Record<string, number>>(template.weeklyRatio, {});
  const imageStrategy = parseJson<string[]>(template.imageStrategy, []);
  const titleStrategy = parseJson<string[]>(template.titleStrategy, []);
  const coverStrategy = parseJson<string[]>(template.coverStrategy, []);
  const interactionStrategy = parseJson<string[]>(template.interactionStrategy, []);
  const commercializationPath = parseJson<string[]>(template.commercializationPath, []);
  const riskRules = parseJson<string[]>(template.riskRules, []);
  const promptRules = parseJson<string[]>(template.promptRules, []);

  const positioning = `${account.name} 是一个面向「${account.targetUsers || "明确细分人群"}」的「${template.name}」，用「${account.personaBase || "稳定、真实、可复用的人设"}」持续解决「${account.painPoints || "用户高频痛点"}」。`;
  const contentMainline = account.contentDirections || columns.join(" / ");
  const businessGoal = account.businessGoals || "先建立信任与内容资产，再测试低风险商业化动作";
  const monetization = account.monetization || commercializationPath.join(" / ");

  const strategyObject = {
    positioning,
    accountParam: account.accountParam,
    accountType: template.name,
    stage: account.stage,
    persona: account.personaBase,
    city: account.city,
    targetUsers: account.targetUsers,
    painPoints: account.painPoints,
    referenceInsights: account.referenceAccounts || "尚未完成参考账号研究。",
    differentiation: `用「${account.materialCondition || "自有素材和可验证经验"}」形成可信素材壁垒，用固定栏目降低创作波动。`,
    contentMainline,
    columns,
    topicDirections: columns.map((column) => `${column}：围绕 ${account.targetUsers || "目标用户"} 的真实问题，输出可收藏、可执行、可评论的内容。`),
    imageStrategy,
    titleStrategy,
    coverStrategy,
    interactionStrategy,
    growthStrategy: [
      "每周至少沉淀 1 个可复用内容模板。",
      "每篇笔记保留一个明确评论钩子，用评论反推下一周选题。",
      "每周复盘标题、封面、选题三项变量，不同时测试过多变量。",
      "安全模式下只生成 Prompt 和命令，所有真实账号动作由人工确认。"
    ],
    commercializationPath,
    businessGoal,
    monetization,
    riskRules,
    promptRules,
    xhsAutoOpGuide: [
      "默认执行模式：Prompt + Command only。",
      "允许生成创作 Prompt、素材建议、命令建议和草稿解析。",
      "禁止自动执行发布、评论、点赞、收藏、私信。",
      "如需 xhs-publish，只输出参数建议，必须人工复制并确认。",
      `账号参数固定使用：--account ${account.accountParam}`
    ]
  };

  const markdown = `# ${account.name} 小红书账号策划方案

## 账号一句话定位
${positioning}

## 账号类型判断
- 内置类型：${template.name}
- 账号阶段：${account.stage}
- 所在城市：${account.city || "未设置"}

## Agent 账号标识
- 业务账号名称：${account.name}
- Agent 账号 ID（accountParam）：\`${account.accountParam || "未设置"}\`
- 所有需要切换小红书账号的 CLI 命令必须使用：\`--account ${account.accountParam || "请先填写账号 ID"}\`。账号名称和本系统数据库编号均不可替代该参数。

## 人设设定
${account.personaBase || "一个有明确经验边界、表达真诚、持续做可复用内容的人设。"}

## 用户画像
${account.targetUsers || "待细化目标用户。建议在创建首周用评论和搜索结果补全。"}

## 用户痛点
${account.painPoints || "待补充。优先从搜索关键词、竞品评论和私信问题中提取。"}

## 差异化定位
${strategyObject.differentiation}

## 参考账号研究洞察
${account.referenceAccounts || "尚未完成参考账号研究。建议先用 xiaohongshu_auto_op xhs-explore 搜索同类型账号，再基于研究结果重生成策划案。"}

## 内容主线
${contentMainline}

## 内容栏目
${listBlock(columns)}

## 选题方向
${listBlock(strategyObject.topicDirections)}

## 图片与素材策略
${listBlock(imageStrategy)}

## 标题策略
${listBlock(titleStrategy)}

## 封面策略
${listBlock(coverStrategy)}

## 互动策略
${listBlock(interactionStrategy)}

## 增长策略
${listBlock(strategyObject.growthStrategy)}

## 商业化路径
${listBlock(commercializationPath)}

## 风险与禁区
${listBlock([...(account.taboos ? [account.taboos] : []), ...riskRules])}

## AGENTS.md 内容
见 \`${account.profilePath}\`。

## 给 xiaohongshu_auto_op 的执行说明
${listBlock(strategyObject.xhsAutoOpGuide)}
`;

  const agentsMdContent = `# ${account.name} AGENTS.md

## 账号身份
${positioning}

## Agent 账号标识
- 业务账号名称：${account.name}
- Agent 账号 ID（accountParam）：\`${account.accountParam || "未设置"}\`
- 所有需要切换小红书账号的 CLI 命令必须使用：\`--account ${account.accountParam || "请先填写账号 ID"}\`。账号名称和本系统数据库编号均不可替代该参数。

## 人设设定
${account.personaBase || "保持真实、克制、有边界的经验型表达。"}

## 内容方向
${contentMainline}

## 用户画像
${account.targetUsers || "围绕细分用户持续补全画像。"}

## 参考账号研究洞察
${account.referenceAccounts || "尚未完成参考账号研究。生成内容前应先参考同类型账号的栏目、标题、封面、互动与评论痛点。"}

## 表达风格
- 真实、具体、可执行。
- 用自然、具体的表达回应用户关心的问题，不预设固定叙事顺序。
- 允许使用创作性体验、情绪和生活场景增强表达，避免写成干燥说明书。

## 标题风格
${listBlock(titleStrategy)}

## 封面风格
${listBlock(coverStrategy)}

## 互动语气
${listBlock(interactionStrategy)}

## 内容栏目
${listBlock(columns)}

## 禁区
${listBlock([...(account.taboos ? [account.taboos] : []), ...riskRules])}

## 商业化方向
${monetization}

## 素材使用规则
- 默认使用 \`${account.assetsPath}\` 中的自有、授权、可商用或 AI 生成素材。
- 网络参考素材只能用于灵感分析，不得伪装为自有素材发布。
- 未确认授权的用户素材不得用于封面或正式发布。
- AI 生成素材需要在 Prompt 或成片说明中保留标识与用途边界。

## 发布前检查清单
- 标题是否符合人设和栏目定位。
- 封面是否清晰传达主题，不误导。
- 正文是否有具体场景、感官细节和自然情绪。
- 素材来源和敏感信息是否符合账号运营要求。
- 评论区钩子是否自然。
- 是否仍处于安全模式，需要人工确认真实发布。

## xiaohongshu_auto_op 执行规则
${listBlock(strategyObject.xhsAutoOpGuide)}
`;

  const execGuide = `当前项目只生成 Prompt 和命令建议。调用 xiaohongshu_auto_op 时，请先检查登录状态，再使用本系统生成的结构化 Prompt 获取草稿。任何 xhs-publish、xhs-interact、私信、点赞、收藏、评论命令都只作为建议展示，需要人工确认。`;

  return {
    positioning,
    strategyJson: JSON.stringify(strategyObject, null, 2),
    markdown,
    agentsMdContent,
    execGuide
  };
}
