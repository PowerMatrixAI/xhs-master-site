import type { Account, AccountImageStyleStudy, AccountReferenceResearch, Asset } from "@/types/domain";
import { accountVisualMode, isWeddingAccount, type AccountVisualMode } from "@/lib/imagePrompts";

type BatchPostAccount = Account & {
  assets?: Asset[];
  imageStyleStudies?: AccountImageStyleStudy[];
  referenceResearches?: AccountReferenceResearch[];
};

type BatchPostOptions = {
  weeks: number;
  openclawImagePaths?: string;
  planningGoal?: string;
};

const modeNames: Record<AccountVisualMode, string> = {
  culture_tourism: "文旅目的地",
  heritage: "民俗非遗",
  stay: "住宿营地",
  food: "餐饮门店",
  outdoor: "户外路线",
  museum: "展馆研学",
  product: "地域产品/文创",
  service: "本地服务"
};

const modeImageFocus: Record<AccountVisualMode, string> = {
  culture_tourism: "目的地图、活动现场图、导览图、交通/票务截图、服务信息图",
  heritage: "工艺细节图、作品图、活动现场图、体验过程图、人物图",
  stay: "房间图、窗景图、公共区图、营地设施图、周边体验图、价格政策截图",
  food: "菜品图、套餐组合图、门店环境图、包间图、门头图、停车/交通图",
  outdoor: "真实现场图、路线图、轨迹截图、关键路况图、装备图、交通补给截图",
  museum: "展品图、展厅图、导览图、活动海报、票务预约截图、研学现场图",
  product: "产品图、包装图、原料图、制作过程图、产地图、价格规格图",
  service: "门店空间图、服务流程图、工具设备图、资质图、案例图、价格预约信息图"
};

const modeSearchKeywords: Record<AccountVisualMode, string[]> = {
  culture_tourism: ["全国 文旅目的地 爆款", "城市旅行 攻略 收藏", "景区 街区 古镇 高互动"],
  heritage: ["全国 非遗 民俗 体验 爆款", "手作 工艺 文化体验 高收藏", "亲子 非遗 研学 高互动"],
  stay: ["全国 民宿 酒店 营地 爆款", "房型 空间 住宿攻略 高收藏", "亲子 宠物 周边体验 高互动"],
  food: ["全国 餐厅 探店 爆款", "本地美食 菜品 种草 高收藏", "餐厅 环境 停车 攻略 高互动"],
  outdoor: ["全国 徒步 路线 爆款", "户外路线 攻略 高收藏", "路线图 轨迹 风景 高互动"],
  museum: ["全国 展览 博物馆 研学 爆款", "展览攻略 亲子研学 高收藏", "展厅 展品 导览 高互动"],
  product: ["全国 地域产品 文创 爆款", "伴手礼 特产 种草 高收藏", "产品 包装 产地 高互动"],
  service: ["全国 本地服务 爆款", "服务案例 流程 价格 高收藏", "门店 预约 问答 高互动"]
};

function q(value: string) {
  return JSON.stringify(value);
}

function compact(value: string | null | undefined, fallback = "未填写") {
  const text = String(value || "").trim();
  return text || fallback;
}

function assetLines(assets: Asset[] | undefined) {
  if (!assets?.length) return "- 素材库还没有登记图片；请先让用户上传或选择素材库图片。";
  return assets
    .slice(0, 80)
    .map((asset, index) => {
      const tags = [asset.sourceType, asset.tags, asset.suitableTypes, asset.riskNotes].filter(Boolean).join(" / ");
      return `${index + 1}. ${asset.filePath}${tags ? `｜${tags}` : ""}`;
    })
    .join("\n");
}

function latestReferenceBrief(account: BatchPostAccount) {
  const reference = account.referenceResearches?.[0];
  if (!reference) return "暂无爆款研究。请在本次任务中只读搜索全国同类型热门内容。";
  return [
    reference.summaryMarkdown && `爆款研究摘要：\n${reference.summaryMarkdown}`,
    reference.contentFeatures && `内容特征：\n${reference.contentFeatures}`,
    reference.strategyInsights && `策略启发：\n${reference.strategyInsights}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function latestStyleBrief(account: BatchPostAccount) {
  const study = account.imageStyleStudies?.[0];
  if (!study) return "暂无图片风格研究。请在本次任务中同步观察同类型热门图文的封面、图集顺序、信息卡和评论痛点。";
  return study.summaryMarkdown || study.rawResults || "已有图片风格研究但内容为空，请重新补充观察。";
}

function accountMode(account: BatchPostAccount) {
  return isWeddingAccount(account) ? "service" : accountVisualMode(account.accountType);
}

function accountKind(account: BatchPostAccount) {
  return isWeddingAccount(account) ? "婚礼服务/婚礼策划" : modeNames[accountMode(account)];
}

function imageFocus(account: BatchPostAccount) {
  if (isWeddingAccount(account)) {
    return "婚礼蛋糕、甜品台、花艺、仪式区、迎宾区、桌花、席位卡、菜单卡、手捧花、灯光布幔、合影区、誓言本、戒指、请柬、宾客互动、场布全景";
  }
  return modeImageFocus[accountMode(account)];
}

function searchKeywords(account: BatchPostAccount) {
  if (isWeddingAccount(account)) {
    return ["全国 婚礼策划 婚礼布置 爆款", "备婚灵感 婚礼蛋糕 花艺 仪式区 高收藏", "迎宾区 甜品台 桌花 席位卡 婚礼细节 爆款"];
  }
  return modeSearchKeywords[accountMode(account)];
}

export function buildBatchImagePostsPrompt(account: BatchPostAccount, options: BatchPostOptions) {
  const weeks = options.weeks === 2 ? 2 : 1;
  const targetCount = weeks === 2 ? "10-14 篇" : "5-7 篇";
  const specifiedImages = compact(options.openclawImagePaths, "未指定；请先在前端选择素材库图片。");
  const planningGoal = compact(options.planningGoal, "优先从真实图片里找高收藏选题，直接形成可执行的小红书批量帖子方案。");
  const keywords = searchKeywords(account);

  return `# 给 Agent 的批量帖子生成 Prompt

## 当前执行模式
只读研究 + 素材库图片分析 + 生成批量帖子方案。不得发布、评论、点赞、收藏、关注或私信。

## 任务目标
客户会从素材库提供一批真实图片。请你先读取图片，识别其中最适合小红书表达的主体、细节、场景和可核验信息；再只读研究小红书全国范围内同类型热门内容；最后把“真实图片特点”和“全国同行爆款表达方式”合并，直接输出 ${weeks} 周小红书批量帖子方案（${targetCount}）。

重要原则：同行爆款内容分析不能局限在账号当地。必须优先搜索全国同类型热门内容，充分学习成熟账号的标题节奏、封面文字、图集顺序、信息卡表达、评论痛点和转化方式；本地城市内容只作为落地差异、价格语境、用户咨询习惯的补充对照，不能限制整体风格。

## 账号信息
- 账号名称：${account.name}
- 账号参数：--account ${account.accountParam}
- 账号类型：${account.accountType}（${accountKind(account)}）
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
- 指定素材库图片 URL：
${specifiedImages}

## 当前可用素材
${assetLines(account.assets)}

## 已有爆款研究
${latestReferenceBrief(account)}

## 已有图片风格研究
${latestStyleBrief(account)}

## 第一步：批量读图，建立图片清单
请读取这些素材库图片 URL，输出一张 Markdown 表格。每张图至少判断：
1. 文件名/URL。
2. 画面主体：${imageFocus(account)}。
3. 可写亮点：用户为什么会点开、收藏、评论或咨询。
4. 适合写成什么帖子：细节拆解、攻略清单、真实案例、避坑问答、服务说明、转化咨询等。
5. 图片可用性：适合封面 / 适合图集内页 / 只适合参考 / 需要补拍 / 需要裁切或打码。
6. 风险：肖像、隐私、价格、日期、路线、地点、库存、资质、合同、AI 痕迹、画质不足等。

## 第二步：只读研究全国同类型热门内容
请优先搜索并总结全国同类型热门笔记，不要照搬文字。建议关键词：
${keywords.map((keyword) => `- ${keyword}`).join("\n")}
- ${[account.city, accountKind(account)].filter(Boolean).join(" ")}（仅作为本地对照，不作为主要风格样本）

请重点总结：
1. 标题节奏：具体对象、场景、情绪、收藏理由如何组合。
2. 封面形式：真实图、拼图、信息卡、图上短字如何使用。
3. 图集顺序：封面、细节、关系图、信息卡、FAQ/咨询引导如何组织。
4. 正文风格：审美点评、攻略清单、避坑提醒、案例复盘、服务问答的比例。
5. 评论区痛点：预算、交通、价格、适合人群、真实度、预约/购买/出行条件。
6. 不可借鉴内容：盗图感、伪造案例、夸大效果、虚构价格/路线/档期/库存、直接复制标题和正文。

## 第三步：输出 ${weeks} 周批量帖子方案
请输出 ${targetCount} 篇帖子方案。每篇帖子必须绑定真实图片，不能只写泛泛方向。

每篇帖子按以下字段输出：
- 发布日：第几周 / 星期几。
- 标题：给 3 个小红书标题候选，学习爆款标题节奏但不得照搬。
- 主轴：这篇只讲一个清晰对象或场景。
- 绑定图片：列出 3-6 张建议使用的文件名或路径，并说明图 1 到图 6 的顺序。
- 图片判断理由：这组图里最值得写的点是什么。
- 图集结构：封面、细节拆解、关系图、信息卡、FAQ/咨询引导分别放什么。
- 正文草稿：直接写出 300-600 字小红书正文，包含开头钩子、价值拆解、适合人群、收藏/评论/咨询引导。
- 参考同行风格：只写可学习的表达方式，不引用原句。
- 图上文字：每张图建议叠加的短字。
- 互动问题：引导用户评论预算、偏好、时间、路线、需求或顾虑。
- 需要人工核验：所有价格、日期、地点、路线、库存、档期、资质、效果和承诺。
- 缺口清单：如果图片不足，需要补拍哪些画面。

## 第四步：给后续精修提示
在方案末尾，请挑出优先级最高的 3 篇，分别给出可以继续进入“单篇精修模式”的简短 Prompt。每条 Prompt 必须包含：标题、绑定图片、主轴、参考爆款风格、正文重点和风险边界。

## 安全边界
- 不得伪造真实案例、用户反馈、服务效果、价格、日期、地点、路线、档期、库存或资质。
- 涉及人脸、手机号、合同、车牌或私人信息时必须提示打码，避免侵犯肖像权和隐私。
- 可以学习同行爆款的结构、节奏、情绪表达和收藏理由，但不能复制标题、正文或图片。
- AI 改图只能做补光、构图、背景延展和信息卡排版，不能改变真实事实。
- 所有未确认信息必须写“待确认”，不要写成事实。`;
}

export function buildBatchImagePostsCommands(account: BatchPostAccount, options: BatchPostOptions & { promptFile: string }) {
  const base = "uv run xiaohongshu_auto_op";
  const accountFlag = `--account ${q(account.accountParam)}`;
  return [
    {
      category: "批量分析图片并生成帖子",
      command: `${base} xhs-content-ops draft-note --prompt-file ${q(options.promptFile)} ${accountFlag} --safe-mode`,
      description: `读取素材库图片，先识别可写图片，再结合全国同类型爆款研究，输出 ${options.weeks === 2 ? "两周" : "一周"}批量帖子方案。`,
      safetyNote: "只生成方案和草稿建议；价格、日期、地点、路线、档期、库存、资质和隐私必须人工核验。"
    }
  ];
}
