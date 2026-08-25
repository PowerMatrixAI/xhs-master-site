import type { Account, AccountImageStyleStudy, AccountReferenceResearch, Asset } from "@/types/domain";
import { isWeddingAccount } from "@/lib/imagePrompts";

type WeddingPlanAccount = Account & {
  assets?: Asset[];
  imageStyleStudies?: AccountImageStyleStudy[];
  referenceResearches?: AccountReferenceResearch[];
};

type WeddingPlanOptions = {
  weeks: number;
  openclawImagePaths?: string;
  planningGoal?: string;
};

function q(value: string) {
  return JSON.stringify(value);
}

function compact(value: string | null | undefined, fallback = "未填写") {
  const text = String(value || "").trim();
  return text || fallback;
}

function assetLines(assets: Asset[] | undefined) {
  if (!assets?.length) return "- 当前还没有可用婚礼素材；请优先读取用户刚准备好的婚礼图片链接。";
  return assets
    .slice(0, 60)
    .map((asset, index) => {
      const tags = [asset.sourceType, asset.tags, asset.suitableTypes, asset.riskNotes]
        .filter(Boolean)
        .join(" / ");
      return `${index + 1}. ${asset.filePath}${tags ? `｜${tags}` : ""}`;
    })
    .join("\n");
}

function latestReferenceBrief(account: WeddingPlanAccount) {
  const reference = account.referenceResearches?.[0];
  if (!reference) return "暂无账号爆款参考研究。请在本次任务中自行做只读搜索。";
  return [
    reference.summaryMarkdown && `账号参考摘要：\n${reference.summaryMarkdown}`,
    reference.contentFeatures && `内容特征：\n${reference.contentFeatures}`,
    reference.strategyInsights && `策略启发：\n${reference.strategyInsights}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function latestStyleBrief(account: WeddingPlanAccount) {
  const study = account.imageStyleStudies?.[0];
  if (!study) return "暂无图片风格研究。请在本次任务中同步研究同行婚礼图文的封面、图集顺序和细节命名。";
  return study.summaryMarkdown || study.rawResults || "已有图片风格研究但内容为空，请重新补充观察。";
}

export function buildWeddingImagePlanPrompt(account: WeddingPlanAccount, options: WeddingPlanOptions) {
  const weeks = options.weeks === 2 ? 2 : 1;
  const targetCount = weeks === 2 ? "10-14 篇" : "5-7 篇";
  const specifiedImages = compact(options.openclawImagePaths, "未指定；请先选择婚礼图片。");
  const planningGoal = compact(options.planningGoal, "优先从真实婚礼图片里找高收藏细节，直接形成可执行的小红书批量帖子方案。");

  return `# 给 Agent 的婚礼批量帖子生成 Prompt

## 当前执行模式
只读研究 + 素材库图片分析 + 生成方案。不得发布、评论、点赞、收藏、关注或私信。

## 任务目标
客户会先准备约 30 张真实婚礼现场图片。请你读取这些图片链接，识别图片中的优秀细节；再只读研究小红书全国范围内同类型婚礼公司、婚礼策划、婚礼布置、备婚灵感类爆款笔记；最后把“真实图片特点”和“全国同行爆款表达方式”合并，直接输出 ${weeks} 周小红书批量帖子方案（${targetCount}）。

重要原则：同行爆款内容分析不能局限在账号当地。必须优先搜索全国同类型热门内容，充分学习成熟账号的标题节奏、封面文字、图集顺序、细节命名、情绪表达和评论痛点；本地城市内容只作为落地差异、价格语境、用户咨询习惯的补充对照，不能限制整体风格。

## 账号信息
- 账号名称：${account.name}
- 账号参数：--account ${account.accountParam}
- 账号类型：${account.accountType}
- 城市/区域：${compact(account.city)}
- 账号基础描述：${compact(account.personaBase)}
- 目标用户：${compact(account.targetUsers)}
- 运营目标：${compact(account.businessGoals)}
- 内容方向：${compact(account.contentDirections)}
- 用户顾虑：${compact(account.painPoints)}
- 商业化方式：${compact(account.monetization)}
- 禁忌/风险：${compact(account.taboos)}

## 本次额外目标
${planningGoal}

## 素材库图片输入
- 指定婚礼已上传图片链接：
${specifiedImages}

## 当前可用素材
${assetLines(account.assets)}

## 已有参考研究
${latestReferenceBrief(account)}

## 已有图片风格研究
${latestStyleBrief(account)}

## 第一步：批量读图，建立婚礼图片清单
请读取这些婚礼已上传图片链接，输出一张 Markdown 表格。每张图至少判断：
1. 文件名/URL。
2. 画面主体：婚礼蛋糕、甜品台、花艺、仪式区、迎宾区、桌花、席位卡、菜单卡、手捧花、灯光、布幔、合影区、誓言本、戒指、请柬、宾客互动、场布全景等。
3. 细节亮点：色系、材质、花材、层次、动线、仪式感、宾客体验、镜头角度、可被新人收藏的理由。
4. 适合写成什么选题：蛋糕细节、花艺预算沟通、仪式区灵感、迎宾区高级感、桌面布置、备婚避坑、婚礼风格命名等。
5. 图片可用性：适合封面 / 适合图集内页 / 只适合参考 / 需要补拍 / 需要裁切或打码。
6. 风险：新人或宾客隐私、场地/品牌露出、合同价格、手机号、侵权内容、AI 痕迹、画质不足。

## 第二步：只读研究小红书同行热门笔记
请优先搜索并总结全国同类型热门笔记，不要照搬文字。建议关键词：
- 全国 婚礼策划 婚礼布置 爆款
- 备婚灵感 婚礼蛋糕 花艺 仪式区 高收藏
- 迎宾区 甜品台 桌花 席位卡 婚礼细节 爆款
- 婚礼公司 真实案例 备婚攻略 高互动
- ${account.city || ""} 婚礼策划 婚礼布置（仅作为本地对照，不作为主要风格样本）

请重点总结：
1. 标题节奏：细节名、风格词、情绪表达、收藏理由如何组合。
2. 封面形式：单张细节、全景场布、拼图、图上短字、信息卡如何使用。
3. 图集顺序：封面细节、关系图、近景拆解、信息卡、FAQ/咨询引导。
4. 正文风格：审美点评、备婚口吻、避坑提醒、清单式拆解、案例复盘的比例。
5. 评论区痛点：预算、场地适配、风格沟通、花材、档期、落地效果、是否适合自己的婚礼。
6. 不可借鉴内容：盗图感、伪造案例、夸大效果、虚构价格档期、直接复制标题和正文。

## 第三步：输出 ${weeks} 周批量帖子方案
请输出 ${targetCount} 篇帖子方案。每篇帖子必须绑定真实图片，不能只写泛泛婚礼服务。

每篇帖子按以下字段输出：
- 发布日：第几周 / 星期几。
- 标题：给 3 个小红书标题候选，学习爆款标题节奏但不得照搬。
- 主轴细节：只聚焦一个细节，例如婚礼蛋糕、白绿花艺、仪式区拱门、迎宾牌、桌花、席位卡。
- 绑定图片：列出 3-6 张建议使用的文件名或路径，并说明图 1 到图 6 的顺序。
- 图片判断理由：这组图里最值得写的细节优秀在哪里。
- 图集结构：封面、细节拆解、关系图、信息卡、FAQ/咨询引导分别放什么。
- 正文草稿：直接写出 300-600 字小红书正文，包含开头钩子、细节拆解、备婚价值、适合人群、咨询/收藏引导。
- 参考同行风格：只写可学习的表达方式，例如“标题用细节名 + 情绪 + 收藏理由”，不要引用原句。
- 图上文字：每张图建议叠加的短字。
- 互动问题：引导用户评论预算、风格、场地、喜欢的细节或备婚困惑。
- 需要人工核验：价格、档期、场地、套餐、花材、案例真实性和人物隐私。
- 缺口清单：如果图片不足，需要补拍哪些画面。

## 第四步：给后续精修提示
在方案末尾，请挑出优先级最高的 3 篇，分别给出可以继续进入“单篇精修模式”的简短 Prompt。每条 Prompt 必须包含：标题、绑定图片、主轴细节、参考爆款风格、正文重点和风险边界。

## 安全边界
- 不得伪造真实新人案例、宾客反馈、婚礼落地效果、价格、档期、场地、套餐和花材成本。
- 涉及新人/宾客人脸、手机号、合同、车牌或私人信息时必须提示打码，避免侵犯肖像权和隐私。
- 可以学习同行爆款的结构、节奏、情绪表达和收藏理由，但不能复制标题、正文或图片。
- AI 改图只能做补光、构图、背景延展和信息卡排版，不能改变真实婚礼设计、场地结构、蛋糕层数、花材核心形态和肖像事实。
- 所有未确认信息必须写“待确认”，不要写成事实。`;
}

export function buildWeddingImagePlanCommands(account: WeddingPlanAccount, options: WeddingPlanOptions & { promptFile: string }) {
  const base = "uv run xiaohongshu_auto_op";
  const accountFlag = `--account ${q(account.accountParam)}`;
  return [
    {
      category: "批量分析婚礼现场图片并生成帖子",
      command: `${base} xhs-content-ops draft-note --prompt-file ${q(options.promptFile)} ${accountFlag} --safe-mode`,
      description: `读取约 30 张婚礼素材库图片，先识别蛋糕、花艺、仪式区、迎宾区、桌花、席位卡等细节，再结合全国同行爆款研究，输出 ${options.weeks === 2 ? "两周" : "一周"}批量帖子方案。`,
      safetyNote: "只生成规划和草稿建议；新人隐私、场地、价格、档期、套餐和案例真实性必须人工核验。"
    }
  ];
}

export function assertWeddingAccount(account: WeddingPlanAccount) {
  if (!isWeddingAccount(account)) {
    throw new Error("当前账号不像婚礼/婚庆/备婚账号，批量婚礼图片规划仅对婚礼账号开放。");
  }
}
