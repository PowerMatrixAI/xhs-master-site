import { NextResponse } from "next/server";
import { resolveStoryCharacter } from "@/lib/storyCharacters";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import type { BackendAiCredentials } from "@/lib/backendAiClient";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";
import { generateVideoStoryDraft, type VideoStorySourceType } from "@/lib/videoPrompts";
import { extractWritingStyleReferences, findWritingStyleReference } from "@/lib/writingStyles";

async function buildStoryResult(body: Record<string, unknown>, credentials: BackendAiCredentials) {
  const account = body.account as Record<string, unknown> & { name: string; accountParam: string; referenceAccounts?: string };
  const weeklyPlan = body.weeklyPlan as { id?: number; knowledgeSnapshotId?: string };
  const sourceType = body.storySourceType === "template" ? "template" as VideoStorySourceType : null;
  const sourceContent = String(body.storySourceContent || "").trim();
  const character = await resolveStoryCharacter(String(body.templateId || ""), String(body.characterId || ""), credentials);
  const knowledgeSnapshotId = String(body.knowledgeSnapshotId || weeklyPlan?.knowledgeSnapshotId || "").trim();

  if (!account?.accountParam || !weeklyPlan?.id) throw new Error("缺少账号或当前周计划上下文。");
  if (!sourceType || !sourceContent) throw new Error("请选择故事来源并填写故事内容。");

  const styles = extractWritingStyleReferences(account.referenceAccounts || "");
  if (!styles.length) throw new Error("当前账号还没有可用爆款文风，请先完成爆款研究并增强策划。");
  const story = await generateVideoStoryDraft({
    character,
    account,
    noteTask: {
      id: 0,
      topicTitle: "创意故事视频",
      contentType: "故事型视频",
      contentGoal: "基于账号定位创作一条独立故事视频",
      targetUser: String(account.targetUsers || ""),
      painPoint: String(account.painPoints || ""),
      coreView: "账号主题自然进入故事，而不是被生硬植入。"
    },
    sourceType,
    sourceContent,
    extraRequirements: String(body.storyExtraRequirements || "").trim(),
    availableWritingStyles: styles.map((style) => style.name),
    expertRules: formatExpertRulesForPrompt(
      (account as { expertRules?: Array<{ module: string; rule: string; source?: string; enabled?: boolean; updatedAt?: string }> }).expertRules || [],
      ["cover", "video_plan", "risk", "body"]
    ),
    knowledgeSnapshotId,
    knowledgeSourceKeys: []
  });
  const style = findWritingStyleReference(account.referenceAccounts || "", story.noteTask.writingStyleName);
  if (!style) throw new Error("故事结果未选择有效的爆款文风，请重试。");

  return {
    story: {
      ...story,
      noteTask: { ...story.noteTask, writingStyleName: style.name, writingStyleReference: style.reference }
    },
    knowledgeSnapshotId,
    ai: { used: true, calls: 1, stage: "story" }
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.account || !body.weeklyPlan) return NextResponse.json({ error: "缺少账号或周计划上下文。" }, { status: 400 });
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildStoryResult(body, credentials)));
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });
  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildStoryResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
