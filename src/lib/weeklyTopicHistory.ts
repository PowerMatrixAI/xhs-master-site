export type RecentWeeklyTopicGroup = {
  planId?: number;
  createdAt?: string;
  topicTitles: string[];
};

type WeeklyPlanTopicSource = {
  id?: number;
  weekStart?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  noteTasks?: Array<{ topicTitle?: string | null }> | null;
};

function toTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.getTime();
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function collectRecentWeeklyTopicGroups(
  plans: WeeklyPlanTopicSource[]
): RecentWeeklyTopicGroup[] {
  return plans
    .map((plan, index) => ({
      plan,
      index,
      createdAt: plan.createdAt || plan.updatedAt || "",
      timestamp: toTimestamp(plan.createdAt || plan.updatedAt)
    }))
    .filter(({ plan }) => (plan.noteTasks || []).some((task) => String(task.topicTitle || "").trim()))
    .sort((left, right) => {
      if (Number.isFinite(left.timestamp) && Number.isFinite(right.timestamp)) return right.timestamp - left.timestamp;
      if (Number.isFinite(left.timestamp)) return -1;
      if (Number.isFinite(right.timestamp)) return 1;
      return left.index - right.index;
    })
    .slice(0, 2)
    .map(({ plan, createdAt }) => ({
      planId: plan.id,
      createdAt: String(createdAt || ""),
      topicTitles: Array.from(new Set(
        (plan.noteTasks || [])
          .map((task) => String(task.topicTitle || "").trim())
          .filter(Boolean)
      ))
    }));
}
