import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { generateDraftVariants } from "@/lib/draftVariants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

async function buildDraftVariantsResult(body: Record<string, any>) {
  const { account, noteTask, weeklyPlan } = body;
  if (!account || !noteTask || !weeklyPlan) throw new Error("缺少任务上下文");
  if (!String(noteTask.writingStyleName || "").trim() || !String(noteTask.writingStyleReference || "").trim()) {
    throw new Error("当前笔记任务缺少已选爆款文风资料。请重新生成本周计划后再生成文案版本。");
  }

  return generateDraftVariants({
    account,
    weeklyPlan,
    noteTask,
    expertRules: account.expertRules || [],
    knowledgeSnapshotId: String(weeklyPlan.knowledgeSnapshotId || ""),
    knowledgeSourceKeys: Array.isArray(noteTask.knowledgeSourceKeys) ? noteTask.knowledgeSourceKeys : []
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  if (!body.account || !body.noteTask || !body.weeklyPlan) {
    return NextResponse.json({ error: "缺少任务上下文" }, { status: 400 });
  }
  if (!String(body.noteTask.writingStyleName || "").trim() || !String(body.noteTask.writingStyleReference || "").trim()) {
    return NextResponse.json({ error: "当前笔记任务缺少已选爆款文风资料。请重新生成本周计划后再生成文案版本。" }, { status: 400 });
  }

  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });

  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildDraftVariantsResult(body)));
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });

  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildDraftVariantsResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error || "生成文案版本失败。" });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
