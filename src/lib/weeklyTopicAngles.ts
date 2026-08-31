export type WeeklyTopicAnglePlanItem = {
  id: string;
  referenceBasis: string;
  adaptedDirection: string;
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildWeeklyTopicAngleRequirements(taskCount: number) {
  return `
## 本周选题角度分配（仅用于本次计划校验）
- 必须先从 account.referenceAccounts 中提炼 ${taskCount} 个彼此不同的“爆款选题机制”。选题机制指真实帖子采用的内容对象、叙事入口、生活场景或读者感受的组合，不是“房型空间”“周边体验”等栏目名称，也不是单纯更换标题或形容词。
- 如果研究报告没有足够明确的选题机制，可以使用完整 strategy 和 weeklyFocus 补足，但 referenceBasis 必须明确写“账号策划与本周重点推导”，不得伪称来自爆款研究。
- 本周每篇任务必须绑定一个不同的 angleId；即使 weeklyFocus 只指定一个菜品、房型、路线或活动，也必须用不同的选题机制和生活场景拆分，禁止重复同一介绍角度。
- weeklyAnglePlan 只用于客户端校验，不要把它写进标题、contentGoal、coreView 或面向用户的文案。
- weeklyAnglePlan 必须恰好包含 ${taskCount} 项，tasks 中每个 angleId 必须唯一且引用其中一项。
`;
}

export function validateWeeklyTopicAnglePlan(
  parsed: unknown,
  rawTasks: Array<Record<string, unknown>>,
  taskCount: number
) {
  const source = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  const rawAngles = source && Array.isArray(source.weeklyAnglePlan) ? source.weeklyAnglePlan : [];
  if (rawAngles.length !== taskCount) {
    throw new Error(`大模型返回的本周选题角度数量异常：期望 ${taskCount} 项，实际 ${rawAngles.length} 项。`);
  }

  const angles = rawAngles.map((value, index) => {
    const item = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const angle = {
      id: readText(item.id),
      referenceBasis: readText(item.referenceBasis),
      adaptedDirection: readText(item.adaptedDirection)
    } satisfies WeeklyTopicAnglePlanItem;
    if (!angle.id || !angle.referenceBasis || !angle.adaptedDirection) {
      throw new Error(`第 ${index + 1} 个本周选题角度不完整，请重新生成。`);
    }
    return angle;
  });

  const angleIds = new Set(angles.map((angle) => angle.id));
  if (angleIds.size !== angles.length) {
    throw new Error("本周选题角度存在重复，请重新生成。" );
  }

  const taskAngleIds = rawTasks.map((task, index) => {
    const angleId = readText(task.angleId);
    if (!angleId || !angleIds.has(angleId)) {
      throw new Error(`第 ${index + 1} 篇任务缺少有效的 angleId，请重新生成。`);
    }
    return angleId;
  });
  if (new Set(taskAngleIds).size !== taskAngleIds.length) {
    throw new Error("本周任务复用了同一选题角度，请重新生成。" );
  }
}
