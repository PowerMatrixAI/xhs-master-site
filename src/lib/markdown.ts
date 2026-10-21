import type { Account, AccountStrategy, Asset, NoteTask, WeeklyPlan } from "@/types/domain";

export function listBlock(items: string[]) {
  return items.filter(Boolean).map((item) => `- ${item}`).join("\n");
}

export function jsonListBlock(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return listBlock(parsed);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).map(([key, val]) => `- ${key}: ${String(val)}`).join("\n");
    }
  } catch {
    // plain text fallback
  }
  return value || "- 暂无";
}

export function exportStrategyMarkdown(strategy: AccountStrategy) {
  return strategy.markdown;
}

export function exportWeeklyPlanMarkdown(plan: WeeklyPlan & { noteTasks: NoteTask[] }) {
  return `# 一周笔记计划：${plan.theme}

## 本周目标
${plan.goal}

## 测试假设
${plan.testHypothesis}

## 商业化动作
${plan.commercializationMove}

## 互动目标
${plan.interactionGoal}

## 笔记任务
${plan.noteTasks
  .map(
    (task, index) => `### ${index + 1}. ${task.topicTitle}

- 发布时间：${task.publishAt}
- 内容类型：${task.contentType}
- 内容目标：${task.contentGoal}
- 目标用户：${task.targetUser}
- 用户痛点：${task.painPoint}
- 核心观点：${task.coreView}
- 可写事实与核心观点：${task.coreView}
- 推荐素材：${task.recommendedAssets}
- 封面方向：${task.coverCopyDirection}
- 评论区钩子：${task.commentHook}
- 预期目标：${task.expectedGoal}
- 状态：${task.status}`
  )
  .join("\n\n")}
`;
}

export function assetManifestMarkdown(account: Account, assets: Asset[]) {
  return `# ${account.name} 素材 Manifest

更新时间：${new Date().toISOString()}

${assets
  .map(
    (asset) => `## ${asset.filePath}

- 类型：${asset.fileType}
- 来源：${asset.sourceType}
- 标签：${asset.tags || "未标注"}
- 图片分析：${asset.aiAnalysis || "未填写"}
- 适合内容：${asset.suitableTypes || "未标注"}
- 适合封面：${asset.coverReady ? "是" : "否"}
- 已使用：${asset.used ? "是" : "否"}
- 风险备注：${asset.riskNotes || "无"}`
  )
  .join("\n\n")}
`;
}
