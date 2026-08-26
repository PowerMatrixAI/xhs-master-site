import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { summarizeImageStyleStudyWithLlm } from "@/lib/llm";
import {
  buildImageStyleCommands,
  buildImageStyleKeywords,
  buildImageStyleResearchPrompt,
  summarizeImageStyleStudyFallback
} from "@/lib/imageStyleStudy";

export async function POST(request: Request, context: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "prepare";
  const account = body.account && typeof body.account === "object" ? body.account : null;
  if (!account) return NextResponse.json({ error: "账号不存在" }, { status: 404 });

  if (action === "prepare") {
    const commands = buildImageStyleCommands(account);
    const researchPrompt = buildImageStyleResearchPrompt(account);
    const study = {
      id: Number(body.studyId) || Date.now(),
      accountId: account.id,
      searchKeywords: buildImageStyleKeywords(account),
      commandJson: JSON.stringify(commands, null, 2),
      researchPrompt,
      rawResults: "",
      summaryMarkdown: "",
      styleBriefJson: "[]",
      status: "待搜索"
    };
    return NextResponse.json({ study, commands, researchPrompt });
  }

  if (action === "save-results") {
    const rawResults = String(body.rawResults || "");
    if (!rawResults.trim()) return NextResponse.json({ error: "请先粘贴 xiaohongshu_auto_op 返回的图片风格研究结果。" }, { status: 400 });
    const credentials = getBackendAiCredentialsFromRequest(request);
    if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
    const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, async () => {
      const study = {
        id: Number(body.studyId) || Date.now(),
        accountId: account.id,
        searchKeywords: buildImageStyleKeywords(account),
        commandJson: JSON.stringify(buildImageStyleCommands(account), null, 2),
        researchPrompt: buildImageStyleResearchPrompt(account),
        status: "待总结"
      };

      const summaryResult = await summarizeImageStyleStudyWithLlm({
        account,
        rawResults,
        researchPrompt: study.researchPrompt
      });
      const fallback = summarizeImageStyleStudyFallback(account, rawResults);
      const summary = summaryResult.data || fallback;

      const savedStudy = {
        ...study,
        rawResults,
        summaryMarkdown: summary.summaryMarkdown,
        styleBriefJson: JSON.stringify(summary.styleBrief, null, 2),
        status: summaryResult.usedLlm ? "已总结" : "已保存待复核"
      };

      return {
        study: savedStudy,
        summary,
        warning: summaryResult.usedLlm ? "" : summaryResult.error || "AI 未完成总结，已使用本地规则生成图片风格摘要。"
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
