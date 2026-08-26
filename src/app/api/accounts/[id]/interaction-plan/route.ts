import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { summarizeInteractionCandidatesWithLlm } from "@/lib/llm";
import {
  buildInteractionCommands,
  buildInteractionCommentPrompt,
  buildInteractionDiscoveryPrompt,
  buildInteractionKeywords,
  fallbackInteractionSummary
} from "@/lib/interactionPrompts";

export async function POST(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  const action = body.action || "prepare";
  const account = body.account && typeof body.account === "object" ? body.account : null;
  const noteTaskSnapshot = body.noteTask && typeof body.noteTask === "object" ? body.noteTask : null;
  if (!account) return NextResponse.json({ error: "账号不存在" }, { status: 404 });

  const noteTaskId = body.noteTaskId ? Number(body.noteTaskId) : null;
  const resolvedNoteTask = noteTaskSnapshot;
  if (noteTaskId && !resolvedNoteTask) {
    return NextResponse.json({ error: "笔记任务不存在或不属于当前账号" }, { status: 404 });
  }

  if (action === "prepare") {
    const publishedNoteUrl = String(body.publishedNoteUrl || "");
    const interactionGoal = String(body.interactionGoal || "");
    const commands = buildInteractionCommands(account, resolvedNoteTask, { publishedNoteUrl, interactionGoal });
    const openclawTask = buildInteractionDiscoveryPrompt({
      account,
      strategy: account.strategy,
      noteTask: resolvedNoteTask,
      publishedNoteUrl,
      interactionGoal
    });
    const commentPrompt = buildInteractionCommentPrompt({ account, noteTask: resolvedNoteTask, discoveryPrompt: openclawTask });
    const plan = {
      id: Number(body.planId) || Date.now(),
      accountId: account.id,
      noteTaskId: resolvedNoteTask?.id || null,
      searchKeywords: publishedNoteUrl || buildInteractionKeywords(account, resolvedNoteTask),
      commandJson: JSON.stringify(commands, null, 2),
      discoveryPrompt: openclawTask,
      commentPrompt,
      rawResults: "",
      targetUsersMarkdown: "",
      commentDraftsMarkdown: "",
      status: "已生成互动执行指令"
    };

    return NextResponse.json({ plan, commands, openclawTask, discoveryPrompt: openclawTask, commentPrompt });
  }

  if (action === "save-results") {
    const rawResults = String(body.rawResults || "");
    if (!rawResults.trim()) return NextResponse.json({ error: "请先粘贴 xiaohongshu_auto_op 返回结果。" }, { status: 400 });
    const credentials = getBackendAiCredentialsFromRequest(request);
    if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
    const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, async () => {
      const plan = {
        id: Number(body.planId) || Date.now(),
        accountId: account.id,
        noteTaskId: resolvedNoteTask?.id || null,
        searchKeywords: buildInteractionKeywords(account, resolvedNoteTask),
        commandJson: JSON.stringify(buildInteractionCommands(account, resolvedNoteTask), null, 2),
        discoveryPrompt: buildInteractionDiscoveryPrompt({ account, strategy: account.strategy, noteTask: resolvedNoteTask }),
        commentPrompt: buildInteractionCommentPrompt({
          account,
          noteTask: resolvedNoteTask,
          discoveryPrompt: buildInteractionDiscoveryPrompt({ account, strategy: account.strategy, noteTask: resolvedNoteTask })
        }),
        status: "待总结"
      };

      const summaryResult = await summarizeInteractionCandidatesWithLlm({
        account,
        strategy: account.strategy,
        noteTask: resolvedNoteTask,
        rawResults,
        discoveryPrompt: plan.discoveryPrompt,
        commentPrompt: plan.commentPrompt
      }).catch((error) => ({
        usedLlm: false as const,
        data: fallbackInteractionSummary(rawResults),
        error: error instanceof Error ? error.message : "AI 总结失败"
      }));

      const savedPlan = {
        ...plan,
        rawResults,
        targetUsersMarkdown: summaryResult.data.targetUsersMarkdown,
        commentDraftsMarkdown: summaryResult.data.commentDraftsMarkdown,
        status: summaryResult.usedLlm ? "已生成互动策略" : "已保存待总结"
      };

      return {
        plan: savedPlan,
        summary: summaryResult.data,
        warning: summaryResult.usedLlm ? "" : summaryResult.error || "大模型总结未完成，已保存原始结果。"
      };
    }));

    return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
  }

  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });

  const task = getAsyncRouteTask(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error || "任务执行失败" });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
