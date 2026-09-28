import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import type { BackendAiCredentials } from "@/lib/backendAiClient";
import { fetchFeaturedVlogTemplatesFromBackend } from "@/lib/featuredVlog";
import { generateFeaturedVlogScript } from "@/lib/featuredVlogPrompts";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";
import { extractWritingStyleReferences, findWritingStyleReference } from "@/lib/writingStyles";

async function buildScriptResult(body: Record<string, unknown>, weeklyPlanId: number, credentials: BackendAiCredentials) {
  const account = body.account as Record<string, unknown> & { id: number; accountParam: string; referenceAccounts?: string };
  const weeklyPlan = body.weeklyPlan as { id?: number; knowledgeSnapshotId?: string };
  if (!account?.id || !account.accountParam || !weeklyPlan?.id || weeklyPlan.id !== weeklyPlanId) {
    throw new Error("缺少或不匹配的账号、周计划信息。");
  }
  const templateId = String(body.templateId || "").trim();
  const templates = await fetchFeaturedVlogTemplatesFromBackend(credentials);
  const template = templates.find((item) => item.id === templateId);
  if (!template) throw new Error("精选vlog模板不存在或已被停用。");
  const styles = extractWritingStyleReferences(account.referenceAccounts || "");
  if (!styles.length) throw new Error("当前账号还没有可用爆款文风，请先完成爆款研究并增强策划。");

  const knowledgeSnapshotId = String(body.knowledgeSnapshotId || weeklyPlan.knowledgeSnapshotId || "").trim();
  const expertRules = formatExpertRulesForPrompt(
    (account as { expertRules?: Array<{ module: string; rule: string; source?: string; enabled?: boolean; updatedAt?: string }> }).expertRules || [],
    ["cover", "video_plan", "risk", "body"]
  );
  const result = await generateFeaturedVlogScript({
    account: { ...account, expertRules },
    noteTask: body.noteTask && typeof body.noteTask === "object" ? body.noteTask as Record<string, unknown> : {},
    template,
    extraRequirements: String(body.extraRequirements || "").trim(),
    availableWritingStyles: styles.map((style) => style.name),
    knowledgeSnapshotId,
    knowledgeSourceKeys: []
  });
  const writingStyle = findWritingStyleReference(account.referenceAccounts || "", result.script.noteTask.writingStyleName);
  if (!writingStyle) throw new Error("精选vlog脚本选择了无效的账号文风，请重试。");
  return {
    script: { ...result.script, noteTask: { ...result.script.noteTask, writingStyleReference: writingStyle.reference } },
    templateVersion: template.version,
    knowledgeSnapshotId,
    ai: { used: true, calls: 1, stage: "script", model: result.model }
  };
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.account || !body.weeklyPlan) return NextResponse.json({ error: "缺少账号或当前周计划上下文。" }, { status: 400 });
  const weeklyPlanId = Number(context.params.id);
  if (!Number.isInteger(weeklyPlanId) || weeklyPlanId <= 0) return NextResponse.json({ error: "周计划 ID 无效。" }, { status: 400 });
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildScriptResult(body, weeklyPlanId, credentials)));
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });
  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildScriptResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
