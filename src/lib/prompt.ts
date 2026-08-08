import type { Account, AccountStrategy, NoteTask, WeeklyPlan } from "@/types/domain";
import { accountVisualMode, isWeddingAccount, type AccountVisualMode } from "@/lib/imagePrompts";

type PromptAccount = Account & {
  referenceResearches?: Array<{
    contentFeatures?: string | null;
    personaInsights?: string | null;
    strategyInsights?: string | null;
  }>;
};

type PromptNoteTask = NoteTask & {
  type?: "image_text" | "video_text";
  requiredMaterials?: string;
  plan?: string;
  writingStyleName?: string;
  writingStyleReference?: string;
};

function compactPromptText(value: unknown, maxLength = 800) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function stripCreativityRestrictions(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => !/(?:伪造探店|伪造亲历|伪造体验|伪造顾客评价|伪造客户案例|伪造真实案例|伪造排队|虚构亲历|虚构体验|不可编造|不得编造|真实体验|伪探店|人工核验|待确认)/u.test(line))
    .join("\n")
    .trim();
}

function extractWritingStyleInsights(referenceAccounts: unknown) {
  const text = String(referenceAccounts || "").trim();
  if (!text) return "";

  const heading = /(?:^|\n)##\s*爆款正文文风洞察\s*\n?/.exec(text);
  if (!heading || heading.index === undefined) return "";

  // 文风库内部同样使用二级标题（例如“## 1）体验日记型”）。
  // 不能再把第一个内部标题误判为文风库的结束边界。
  const content = text.slice(heading.index + heading[0].length);
  return compactPromptText(content, 8000);
}

export function hasUsableWritingStyleLibrary(referenceAccounts: unknown) {
  const insights = extractWritingStyleInsights(referenceAccounts);
  return /(?:^|\n)###\s*文风：\S+/u.test(insights);
}

function buildReferenceStyleBrief(noteTask: PromptNoteTask) {
  const name = noteTask.writingStyleName?.trim();
  const reference = noteTask.writingStyleReference?.trim();
  if (!name || !reference) return "";
  return `本篇已由周计划 AI 选定唯一文风：${name}。以下是该文风的完整研究资料与真实案例；不得查阅、选择或混用其他文风：\n${reference}`;
}

export function buildTaskPrompt(input: {
  account: PromptAccount;
  strategy: AccountStrategy | null;
  weeklyPlan: WeeklyPlan;
  noteTask: PromptNoteTask;
  expertRules?: string;
}) {
  const { account, strategy, weeklyPlan, noteTask, expertRules } = input;
  const strategySummary = strategy?.positioning ?? `${account.name} ${account.accountType} 账号`;
  return buildModeTaskPrompt({ account, strategySummary, weeklyPlan, noteTask, expertRules });
}

function baseContext(input: {
  account: PromptAccount;
  strategySummary: string;
  weeklyPlan: WeeklyPlan;
  noteTask: PromptNoteTask;
  imagePanelName: string;
  expertRules?: string;
}) {
  const { account, strategySummary, weeklyPlan, noteTask, imagePanelName, expertRules } = input;
  const isVideo = noteTask.type === "video_text";
  return `## 模式
生成可直接填写到小红书发布页的标题和正文，但只允许保存到草稿箱，严禁真实发布和互动。

## 账号参数
--account ${account.accountParam}

## 上下文
- 账号素材目录：assets/${account.accountParam}/
- ${isVideo ? "视频任务输出：.openclaw_tasks/xhs-video-task-" + noteTask.id + "/video-path.txt" : "图片任务输出：.openclaw_tasks/xhs-image-task-" + noteTask.id + "/image-paths.txt"}
- ${isVideo ? "视频处理：先在“视频方案”完成视频任务；本阶段只读取最终视频路径，不重新生成或替换视频。" : `图片处理：先在“${imagePanelName}”完成图片任务；本阶段只读取其成品图片清单，不重新生成或替换图片。`}
- 账号定位：${strategySummary}
- 账号对外人设：${account.personaBase || "真实、具体、克制，以能够核验的信息帮助用户做判断"}
- 本周目标：${weeklyPlan.goal}

## 本篇笔记任务
- 标题方向：${noteTask.topicTitle}
- 内容类型：${noteTask.contentType}
- 内容目标：${noteTask.contentGoal}
- 目标用户：${noteTask.targetUser}
- 痛点：${noteTask.painPoint}
- 核心观点：${noteTask.coreView}
- 可写事实与核心观点：${noteTask.coreView}
- 素材与事实范围：${noteTask.requiredMaterials || "未填写"}；${noteTask.recommendedAssets || "未填写"}
- 预期目标：${noteTask.expectedGoal}
- 封面方向：${noteTask.coverCopyDirection}
- 评论钩子：${noteTask.commentHook}
- 禁忌：${stripCreativityRestrictions(weeklyPlan.taboos || account.taboos) || "无创作性表达限制；遵守账号和 OpenClaw 执行边界"}

## 本篇唯一爆款文风参考
${buildReferenceStyleBrief(noteTask)}

## 爆款文风仿写优先级（最高优先级）
1. 正文首先要仿写上方爆款文风的整体感觉，其优先级高于事实范围、核心观点、素材说明和其他理性化要求。目标不是写成资料整理或商家说明，而是写出像真实的人在分享生活、分享体验和推荐一顿饭/一次出行/一个场景。
2. 最终正文与参考爆款文风在语气、情绪浓度、口语程度、句子节奏、细节密度、生活场景、感官描写和分享感上，目标达到约 80% 的风格相似度；只允许借鉴表达方式，不得复制参考标题、句子、独特比喻、个人经历、具体数据或结论。
3. 如果核心观点、素材说明、事实范围或其他要求会明显降低仿写相似度，可以舍弃、压缩或改写其中部分信息，但主题不能偏离，不能写成与本篇主题无关的内容。不要为了覆盖所有输入字段而牺牲爆款文风。
4. 必须避免理性、平铺直叙、报告式和说明书式表达。优先使用有情绪、有态度、有犹豫、有画面、有生活细节的“活人感”表达，让读者感觉是在看真实分享，而不是阅读运营策划或产品介绍。

## 按案例写法重新创作（必须先完成）
1. 本篇唯一允许使用上方已选文风；不得自行改选、查阅或混用其他文风。
2. 紧贴案例的语气、情绪、口语、节奏、细节描写和信息表达方式，写出同风格的新内容，避免理性说明文。
3. 原文全文只用于学习写法；不得复制标题、句子、独特比喻、个人经历、数据或结论，也不要输出内部写作安排和段落规则。
4. 优先使用第一人称、感官细节、情绪和生活化场景制造活人感；文风资料缺失时立即报告，不得退回通用模板。

## 已沉淀专家规则
${stripCreativityRestrictions(expertRules) || "暂无影响创作性表达的已保存规则；按账号策划案和本篇任务生成。"}`;
}

const promptModeCopy: Record<AccountVisualMode, {
  title: string;
  imagePanelName: string;
  styleRules: string[];
  checkTitle: string;
}> = {
  culture_tourism: {
    title: "文旅目的地小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "文旅图片创作",
    styleRules: [
      "这是文旅目的地发布稿，不是旅行社硬广，也不是完整旅游攻略。",
      "每篇只解决一个明确的出行问题；目的地、动线、活动、机位、交通票务和避坑信息按本篇内容类型选择，不要求全部写入。",
      "优先使用现场、活动和服务细节营造目的地体验；允许补充合理的旅行场景、情绪和感官描写。"
    ],
    checkTitle: "发布前人工检查"
  },
  heritage: {
    title: "民俗非遗小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "民俗非遗图片创作",
    styleRules: [
      "这是民俗/非遗体验发布稿，不是猎奇故事，也不是泛泛文化口号。",
      "每篇只围绕一个工艺、作品、人物、体验或文化问题展开，不要求同时介绍流程、故事和预约。",
      "工艺图用于承接作品、材料、步骤和人物故事；允许补充合理的体验感和文化氛围描写。",
      "避免猎奇化民俗和滥用族群/宗教符号，表达重点放在体验价值和独特细节。"
    ],
    checkTitle: "文化与授权检查"
  },
  stay: {
    title: "住宿/营地小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "住宿图片创作",
    styleRules: [
      "这是民宿/酒店/营地发布稿，不是平台详情页复制，也不是夸张种草文。",
      "每篇只解决一个入住决策问题；房型、场景、周边、套餐、攻略和政策信息按本篇内容类型选择，不要求全部写入。",
      "空间图用于营造房型、设施、景观和入住体验；允许补充合理的放松、约会、亲子或周末场景。"
    ],
    checkTitle: "入住前人工检查"
  },
  food: {
    title: "餐饮小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "餐饮图片创作",
    styleRules: [
      "这是餐饮小红书发布稿，不是运营交付包，也不是大众点评长评。",
      "每篇必须先确定一个主轴：某个菜品、某个营销活动，或某个当地特色；不要一篇里散讲太多菜。",
      "菜品、套餐、当地特色、制作过程、环境交通和营销活动按本篇内容类型选择，不要求每篇同时覆盖。",
      "菜品图优先写具体菜品、口感、香气、火候、分量和搭配；环境图优先写空间氛围、座位和用餐场景；允许使用创作性第一人称和朋友聚餐、约会等体验设定。",
      "不要把菜单说明、价格提醒或交通信息写成全文主轴；它们只作为具体菜品、套餐或到店体验的辅助内容。"
    ],
    checkTitle: "发布前人工检查"
  },
  outdoor: {
    title: "户外路线小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "路线图片创作",
    styleRules: [
      "这是户外路线小红书发布稿，不是旅行社广告，也不是完整户外安全手册。",
      "每篇只解决一个路线判断问题；路线体验、关键路况、风景、攻略、装备、交通补给和安全提醒按本篇内容类型选择，不要求全部写入。",
      "现场图优先写风景、路况、季节和身体感受；允许补充合理的同行、出发、抵达和情绪场景。"
    ],
    checkTitle: "出发前人工检查"
  },
  museum: {
    title: "展馆研学小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "展馆研学图片创作",
    styleRules: [
      "这是博物馆/展览/研学发布稿，不是馆方公告复制，也不是泛泛打卡文。",
      "每篇只解决一个观展或研学问题；展览看点、展品故事、动线、亲子研学、票务和问答按本篇内容类型选择。",
      "展品图优先写观看感受、细节、故事和适合人群；允许补充合理的亲子、周末和观展体验场景。"
    ],
    checkTitle: "展期与版权检查"
  },
  product: {
    title: "地域产品/文创小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "产品文创图片创作",
    styleRules: [
      "这是地域特产/文创产品发布稿，不是电商详情页堆砌，也不是夸大功效文。",
      "每篇只解决一个购买或使用问题；产品卖点、产地、工艺、使用、送礼和购买问答按本篇内容类型选择。",
      "产品图优先写外观、口感、使用感、送礼场景和地域记忆；允许补充合理的使用者体验和生活场景。"
    ],
    checkTitle: "产品信息检查"
  },
  service: {
    title: "本地服务小红书笔记草稿 Prompt（发布精简版）",
    imagePanelName: "本地服务图片创作",
    styleRules: [
      "这是本地生活服务发布稿，不是夸张案例广告，也不是硬性成交话术。",
      "每篇只解决一个服务决策问题；用户问题、服务项目、流程、授权案例、空间和价格预约按本篇内容类型选择。",
      "流程图和案例图优先写服务过程、体验变化、适合人群和结果感受；允许补充合理的顾客场景和情绪表达。"
    ],
    checkTitle: "服务与授权检查"
  }
};

function buildModeTaskPrompt(input: {
  account: PromptAccount;
  strategySummary: string;
  weeklyPlan: WeeklyPlan;
  noteTask: PromptNoteTask;
  expertRules?: string;
}) {
  const mode = accountVisualMode(input.account.accountType);
  const copy = promptModeCopy[mode];
  const imageCountLine = mode === "food" ? "图集默认 6 张" : "图集默认 5 张";
  const isVideo = input.noteTask.type === "video_text";
  const weddingAccount = isWeddingAccount(input.account);
  const promptTitle = weddingAccount ? "婚礼服务小红书笔记草稿 Prompt（发布精简版）" : copy.title;
  const imagePanelName = weddingAccount ? "婚礼图片创作" : copy.imagePanelName;
  const weddingRules = weddingAccount
    ? [
        "这是婚礼公司小红书发布稿，图片是选题入口，不是只做服务介绍。",
        "每篇只围绕一个真实婚礼细节或备婚问题；风格、场地、预算、流程和问答按本篇内容类型选择，不要求全部写入。",
        "参考同类型爆款文章的标题节奏、情绪表达、细节命名和收藏理由，允许对婚礼体验进行创作性演绎，但不要照搬原文。",
        "允许补充合理的新人情绪、婚礼氛围和体验化表达；重点学习爆款案例的标题节奏、细节命名和收藏理由。"
      ]
    : [];
  return `# ${promptTitle}

${baseContext({ ...input, imagePanelName })}

## 品类与事实边界
- ${copy.styleRules.join("\n- ")}
${weddingRules.length ? `- ${weddingRules.join("\n- ")}\n` : ""}- 正文控制在 300-600 中文字，节奏服从所选爆款文风；${isVideo ? "视频以 video-path.txt 为准。" : `${imageCountLine}以 image-paths.txt 的成品顺序为准。`}
- 正文要与${isVideo ? "视频" : "图片"}整体一致，但不要逐镜头或逐图说明；优先写具体体验、细节和情绪。
- 使用账号对外身份自然表达，禁止出现 AI、运营、Prompt、素材、选题、生成过程等幕后语言。
- 不要评价图片或解释资料是否完整；信息不足时用创作性场景、感官细节和生活化表达补足，不要写成说明或报告。

## 内部生成与检查
- 内部比较 3 个标题候选，选择最符合账号人设、被选中文风和小红书标题限制的 1 个，不输出候选过程。
- 内部完成图片与正文对应检查、主题一致性检查和“${copy.checkTitle}”，不把检查过程写入发布内容；检查不能削弱爆款文风和活人感。
- 内部确认正文没有运营分析、创作说明、图片说明、人工核验项或重复安全声明。
- 写入 content.txt 前进行读者视角复查；如果正文在评价图片或帖子、解释创作目的、暴露资料缺口或使用分析报告语气，必须先重写。
- 正文不得以素材评价、内容完整性声明或资料缺口说明开头；其余开场方式遵循被选中的爆款文风。

## 最终内容
只生成并写入以下最终内容：
1. 最终标题 1 个。
2. 正文发布稿 1 份，控制在 300-600 中文字，段落节奏遵循被选中的爆款文风。
3. 正文最后一行放 5-6 个话题标签。

不要把标题候选、封面文案、图集配文清单、置顶评论、检查清单或任何内部分析写入 title.txt 和 content.txt。

## 完成报告
在任务最终回复中单独说明：所选文风名称、选择原因、结构性仿写策略摘要、最终标题和草稿保存结果。不得将文风选择过程或策略摘要写入 title.txt 和 content.txt。`;
}
