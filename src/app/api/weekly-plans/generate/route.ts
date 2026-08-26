import { NextResponse } from "next/server";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { clampWeeklyFrequency, normalizeWeeklyRatio } from "@/lib/weeklyPlan";
import { generateWeeklyTasksWithLlm } from "@/lib/llm";
import { collectRecentWeeklyTopicGroups } from "@/lib/weeklyTopicHistory";
import { selectedWeeklyPlanningObjectives } from "@/lib/weeklyPlanningObjectives";

export async function POST(request: Request) {
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
  const body = await request.json();
  const account = body.account;
  if (!account) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  const frequency = clampWeeklyFrequency(body.frequency);
  const ratio = normalizeWeeklyRatio(String(body.ratio || ""), frequency);

  const plan = {
    id: Date.now(),
    accountId: account.id,
    weekStart: body.weekStart || new Date().toISOString().slice(0, 10),
    theme: body.theme || "本周主题",
    goal: body.goal || "验证内容方向并积累可复用素材",
    frequency,
    ratio,
    testHypothesis: body.testHypothesis || "",
    commercializationMove: body.commercializationMove || "",
    interactionGoal: body.interactionGoal || "",
    availableAssets: body.availableAssets || "",
    taboos: body.taboos || "",
    knowledgeSnapshotId: String(body.knowledgeSnapshotId || ""),
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const weeklyFocus = String(body.weeklyFocus || "").trim();
  const selectedObjectiveIds = Array.isArray(body.selectedObjectiveIds)
    ? body.selectedObjectiveIds.map(String)
    : String(body.selectedObjectiveIds || "").split(",").map((value) => value.trim()).filter(Boolean);
  const weeklyPlanInput = { ...body, frequency, ratio };
  const recentTopicGroups = weeklyFocus
    ? []
    : collectRecentWeeklyTopicGroups(account.weeklyPlans || [], plan.weekStart);
  const weeklyInput = {
    ...weeklyPlanInput,
    weeklyFocus,
    selectedObjectives: selectedWeeklyPlanningObjectives(account.accountType, selectedObjectiveIds),
    recentTopicGroups
  };
  try {
    const llmResult = await runWithBackendAiCredentials(credentials, () => generateWeeklyTasksWithLlm({
      account,
      strategy: account.strategy,
      assets: account.assets || [],
      weeklyPlan: plan,
      weeklyInput,
      taskCount: frequency,
      knowledgeSnapshotId: String(body.knowledgeSnapshotId || "")
    }));
    return NextResponse.json({
      ...plan,
      noteTasks: llmResult.data.map((task, index) => ({ ...task, id: Date.now() + index }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成本周内容计划失败。" },
      { status: 422 }
    );
  }
}
