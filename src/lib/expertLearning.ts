import type { Account, AccountTypeTemplate, NoteTask } from "@prisma/client";

function q(value: string) {
  return JSON.stringify(value);
}

function compact(value: unknown) {
  return String(value || "").trim() || "未填写";
}

type ExpertRuleLike = {
  module: string;
  rule: string;
  source?: string | null;
  enabled?: unknown;
  updatedAt?: Date | string | null;
};

export function isExpertRuleEnabled(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function formatExpertRulesForPrompt(rules?: ExpertRuleLike[] | null, preferredModules: string[] = []) {
  const moduleRank = new Map(preferredModules.map((module, index) => [module, index]));
  const activeRules = (rules || [])
    .filter((rule) => isExpertRuleEnabled(rule.enabled) && rule.rule.trim())
    .sort((left, right) => {
      const rankDelta = (moduleRank.get(left.module) ?? preferredModules.length) - (moduleRank.get(right.module) ?? preferredModules.length);
      if (rankDelta) return rankDelta;
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    })
    .slice(0, 5);
  if (!activeRules.length) return "";
  return activeRules
    .map((rule, index) => `${index + 1}. [${rule.module} / ${rule.source || "manual"}] ${rule.rule}`)
    .join("\n");
}

export function buildPostReviewPrompt(input: {
  account: Account;
  noteTask?: (NoteTask & { type?: string; requiredMaterials?: string; plan?: string }) | null;
  postTitle?: string;
  postUrl?: string;
  publishedAt?: string;
  metrics?: string;
  comments?: string;
  actualContent?: string;
  expertFeedback?: string;
  editComparison?: string;
  subjective?: string;
  distillGoal?: string;
}) {
  const task = input.noteTask;
  const requiredMaterials = task?.requiredMaterials || task?.requiredImages;
  return `# 单篇小红书帖子专家复盘任务

请只复盘这一条帖子，并从这一条帖子的真实表现、评论反馈、专家改稿和用户修改中提炼可复用规则。只分析，不执行任何真实账号操作。

核心目标：每条帖子都形成一次“经验沉淀”。不要写成周报，不要泛泛总结账号整体；必须围绕这一条帖子判断：为什么有效、为什么无效、下次同类帖子应该怎么生成。

## 账号信息
- 账号名称：${input.account.name}
- 账号类型：${input.account.accountType}
- 所在城市：${input.account.city || "未填写"}
- 目标用户：${input.account.targetUsers || "未填写"}
- 用户痛点：${input.account.painPoints || "未填写"}
- 内容方向：${input.account.contentDirections || "未填写"}
- 创作偏好：允许使用有情绪、有画面感的体验化表达，重点避免文案收束为理性说明。

## 本次复盘帖子
- 选题/标题：${compact(input.postTitle || task?.topicTitle)}
- 发布链接：${compact(input.postUrl)}
- 发布时间：${compact(input.publishedAt || task?.publishAt)}
- 原计划内容类型：${compact(task?.contentType)}
- 笔记媒介类型：${task?.type === "video_text" ? "视频笔记" : "图文笔记"}
- 原计划内容目标：${compact(task?.contentGoal)}
- 原计划核心观点：${compact(task?.coreView)}
- 原计划素材要求：${compact(requiredMaterials)}
- 原计划方案：${compact(task?.plan)}
- 原计划评论钩子：${compact(task?.commentHook)}

## 实际发布内容
${compact(input.actualContent)}

## 发布表现数据
${compact(input.metrics)}

## 评论区 / 私信 / 用户反馈
${compact(input.comments)}

## 专家点评 / 用户修改意见
${compact(input.expertFeedback)}

## 修改前后对比
${compact(input.editComparison)}

## 主观观察
${compact(input.subjective)}

## 希望沉淀的能力
${input.distillGoal || "提炼这一篇对应的标题规则、封面规则、图片方案规则、正文规则、评论引导规则、风险规则和下次测试变量。"}

## 输出格式
只输出一个 JSON 对象，不要输出 Markdown 或额外解释。summary 要包含单帖结论、关键诊断、下次同类帖子改法和最多两个测试变量；evidenceAssessment 要区分有证据的判断和证据不足的判断：

\`\`\`json
{
  "summary": "完整复盘总结",
  "evidenceAssessment": "证据评估",
  "rules": [
  {
    "module": "title | cover | image_plan | video_plan | body | interaction | risk | positioning",
    "rule": "可复用的专家规则",
    "positiveExample": "好的例子",
    "negativeExample": "差的例子",
    "reason": "为什么这条规则成立",
    "source": "post_performance | comments | expert_feedback | user_edit | subjective_observation",
    "applicableWhen": "适用场景",
    "notApplicableWhen": "不适用场景",
    "nextTest": "下次如何验证"
  }
  ]
}
\`\`\`

要求：
- 不要把相关性说成确定因果。
- 视频分镜、动态、节奏和拼接经验使用 video_plan；图集经验使用 image_plan。
- 如果“专家点评 / 用户修改意见”中包含明确、可复用的修改要求，必须优先将其转化为对应模块的规则，并将 source 标记为 expert_feedback。即使同时存在标题、封面、互动等其他发现，这类规则也应优先保留在最多 5 条规则内。
- 例如专家指出“文风过于理性叙述，缺少真人分享感”时，应生成 body 规则，明确如何用创作性场景、具体观察、情绪和自然口语改善表达。
- 专家点评只包含一次性偏好或无法复用的主观判断时，不要强行写成规则；在 evidenceAssessment 中说明原因。
- 最多输出 5 条规则，只保留有本帖证据支撑的可复用规则。
- 规则用于后续生成 Prompt，不是直接对外发布文案。`;
}

export function buildIndustryLearningKeywords(account: Account, template?: AccountTypeTemplate | null, topic?: string) {
  const pieces = [
    "全国",
    "小红书运营",
    "爆款拆解",
    "内容方法论",
    template?.name || account.accountType,
    account.targetUsers,
    account.contentDirections,
    account.painPoints,
    topic || "标题 封面 图文 笔记 复盘"
  ]
    .join(" ")
    .replace(/[，。；、\n/]+/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(pieces)).slice(0, 18).join(" ");
}

export function buildIndustryLearningCommands(account: Account, template?: AccountTypeTemplate | null, topic?: string) {
  const base = "uv run xiaohongshu_auto_op";
  const accountFlag = `--account ${q(account.accountParam)}`;
  const keyword = buildIndustryLearningKeywords(account, template, topic);
  return [
    {
      category: "小红书站内行业学习",
      command: `${base} xhs-explore search --keyword ${q(keyword)} ${accountFlag} --limit 40 --include-notes --include-comments`,
      description: "只读搜索全国同类型高互动内容、运营方法论、爆款拆解和评论痛点，作为外部经验输入。",
      safetyNote: "只读研究命令，不发布、不关注、不私信、不互动。"
    },
    {
      category: "全网文章学习",
      command: `用浏览器或搜索引擎搜索：${q(`${keyword} 文章 案例 拆解 方法论`)}`,
      description: "补充小红书站外文章、案例拆解、课程笔记和运营专家观点，避免只从单个平台样本学习。",
      safetyNote: "只做阅读和摘录，不复制他人内容用于发布。"
    }
  ];
}

export function buildIndustryLearningPrompt(input: {
  account: Account;
  template?: AccountTypeTemplate | null;
  topic?: string;
  searchScope?: string;
}) {
  const topic = input.topic || "小红书图文爆款方法、标题封面、图片真实感、评论转化和复盘方法";
  const keywords = buildIndustryLearningKeywords(input.account, input.template, topic);
  return `# 小红书行业学习与专家技能蒸馏 Prompt

请基于广泛搜索到的相关文章、爆款拆解、运营专家观点、小红书站内高互动案例和评论反馈，为账号「${input.account.name}」提炼可复用运营规则。只做研究和总结，不执行任何真实账号操作。

## 研究边界
- 搜索范围：${input.searchScope || "全国 / 全网优先，本地只作为补充"}
- 研究主题：${topic}
- 关键词：${keywords}

重要原则：外部学习不能局限在账号当地，也不能只看本地同类内容。必须优先吸收全国成熟账号、行业文章、专家拆解和高互动案例里的共性方法，再判断哪些适合当前账号落地。

## 当前账号
- 账号名称：${input.account.name}
- 账号类型：${input.template?.name || input.account.accountType}
- 城市：${input.account.city || "未填写"}
- 阶段：${input.account.stage}
- 目标用户：${input.account.targetUsers || "未填写"}
- 用户痛点：${input.account.painPoints || "未填写"}
- 内容方向：${input.account.contentDirections || "未填写"}
- 商业目标：${input.account.businessGoals || "未填写"}
- 创作偏好：允许使用有情绪、有画面感的体验化表达，重点避免文案收束为理性说明。

## 请先收集
1. 全国同类型爆款笔记或账号：标题、封面、图集、评论痛点、转化方式。
2. 运营专家文章/课程/拆解：标题方法、封面方法、图文结构、真实感、评论引导、复盘方法。
3. 当前账号可借鉴的规律：哪些可直接用，哪些需要改造。
4. 不适合照搬的套路：本地条件、素材授权、AI 味、平台风险、硬广感。

## 输出格式
1. 资料来源摘要：按“小红书站内 / 全网文章 / 专家观点 / 评论痛点”分组。
2. 核心方法提炼：标题、封面、图片方案、正文、评论互动、转化、复盘各 3-5 条。
3. 对当前账号的适配判断：哪些马上加入生成规则，哪些只作为观察。
4. 风险边界：不能伪造真实案例、不能盗图、不能把 AI 图伪装成真实素材、不能编造价格/档期/路线/库存/资质。
5. 下周验证计划：最多 3 个测试变量。

## 可加入规则库的候选规则
请额外输出 JSON 数组，字段如下：

\`\`\`json
[
  {
    "accountType": "${input.account.accountType}",
    "module": "title | cover | image_plan | body | interaction | risk | positioning",
    "rule": "可复用的专家规则",
    "positiveExample": "好的例子",
    "negativeExample": "差的例子",
    "reason": "为什么这条规则成立",
    "source": "industry_article | expert_article | xhs_hot_note | comments | case_study",
    "applicableWhen": "适用场景",
    "notApplicableWhen": "不适用场景",
    "nextTest": "如何在当前账号验证"
  }
]
\`\`\`

要求：
- 每条规则都要说明来源类型，不要凭空编造。
- 站外文章观点只能作为启发，必须结合小红书真实内容形态验证。
- 不要照搬别人的标题和正文，只提炼方法。
- 规则用于后续生成 Prompt，不是直接对外发布文案。`;
}
