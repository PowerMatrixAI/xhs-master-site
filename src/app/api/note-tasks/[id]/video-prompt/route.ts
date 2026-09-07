import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import {
  buildDirectVideoTask,
  buildImageToVideoTask,
  buildStoryVideoTask,
  planStoryVideoFrames,
  planStoryVideoMotion,
  type VideoSourceAsset,
  type StoryVideoFramePlan,
  type StoryVideoMotionPlan,
  type VideoStoryDraft
} from "@/lib/videoPrompts";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";

function requestContext(body: Record<string, unknown>) {
  const account = body.account as Record<string, unknown> & { name: string; accountParam: string };
  const noteTask = body.noteTask as Record<string, unknown> & { id: number; topicTitle: string };
  const knowledgeSnapshotId = String(body.knowledgeSnapshotId || "").trim();
  const knowledgeSourceKeys = Array.isArray(body.knowledgeSourceKeys)
    ? body.knowledgeSourceKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (!account?.accountParam || !noteTask?.id) throw new Error("缺少账号或视频任务上下文。");
  const expertRules = formatExpertRulesForPrompt(
    (account as { expertRules?: Array<{ module: string; rule: string; source?: string; enabled?: boolean; updatedAt?: string }> }).expertRules || [],
    ["cover", "video_plan", "risk"]
  );
  return { account, noteTask, knowledgeSnapshotId, knowledgeSourceKeys, expertRules };
}

async function buildResult(body: Record<string, unknown>) {
  const { account, noteTask, knowledgeSnapshotId, knowledgeSourceKeys, expertRules } = requestContext(body);
  const mode = body.mode === "direct_video" ? "direct_video" : "image_to_video";
  const assets = (Array.isArray(body.assets) ? body.assets : []) as VideoSourceAsset[];

  let content = "";
  if (mode === "direct_video") {
    if (assets.length !== 1 || !String(assets[0]?.fileUrl || "").startsWith("http")) throw new Error("请选择一个可访问的视频素材。");
    content = buildDirectVideoTask({ account, noteTask, asset: assets[0] });
  } else if (mode === "image_to_video") {
    if (assets.length < 2 || assets.length > 6 || assets.some((asset) => !String(asset.fileUrl || "").startsWith("http"))) {
      throw new Error("图片转视频需要按顺序选择 2-6 张可访问的素材库图片。");
    }
    content = await buildImageToVideoTask({
      account,
      noteTask,
      assets,
      expertRules,
      knowledgeSnapshotId,
      knowledgeSourceKeys
    });
  }
  const aiCalls = mode === "direct_video" ? 0 : 1;
  return {
    videoPrompt: { title: `${noteTask.topicTitle} 视频方案`, content },
    openclawTask: { title: `${noteTask.topicTitle} Agent 视频任务`, content },
    ai: { used: aiCalls > 0, calls: aiCalls, stage: mode, totalCalls: aiCalls }
  };
}

function storyPlanContext(body: Record<string, unknown>) {
  const context = requestContext(body);
  const story = body.story as VideoStoryDraft;
  const assets = (Array.isArray(body.assets) ? body.assets : []) as VideoSourceAsset[];
  const manualAssets = (Array.isArray(body.manualAssets) ? body.manualAssets : []) as VideoSourceAsset[];
  if (!story?.title || !Array.isArray(story.shots) || story.shots.length < 3 || story.shots.length > 6) throw new Error("请先生成并确认完整故事。");
  if (assets.some((asset) => !String(asset.fileUrl || "").startsWith("http"))) throw new Error("故事视频候选素材中存在不可访问的图片。");
  if ((manualAssets.length > 0 && manualAssets.length < 3) || manualAssets.length > 6 || manualAssets.some((asset) => !String(asset.fileUrl || "").startsWith("http"))) {
    throw new Error("手动指定图片时，图片数量不得低于 3 张或超过 6 张；也可清空后由 AI 决定首帧。");
  }
  const candidateUrls = new Set(assets.map((asset) => asset.fileUrl));
  if (manualAssets.some((asset) => !candidateUrls.has(asset.fileUrl))) throw new Error("手动指定图片必须来自当前账号素材库候选列表。");
  if (new Set(manualAssets.map((asset) => asset.fileUrl)).size !== manualAssets.length) throw new Error("手动指定图片不能重复。");
  return { ...context, story, assets, manualAssets };
}

async function buildStoryFrameResult(body: Record<string, unknown>) {
  const input = storyPlanContext(body);
  const result = await planStoryVideoFrames(input);
  return { ...result, ai: { used: true, calls: 1, stage: "frames" } };
}

async function buildStoryMotionResult(body: Record<string, unknown>) {
  const input = storyPlanContext(body);
  const framePlan = body.framePlan as StoryVideoFramePlan;
  if (!Array.isArray(framePlan) || framePlan.length < 3 || framePlan.length > 6) throw new Error("缺少有效的首帧规划结果。");
  const motionPlan = await planStoryVideoMotion({
    story: input.story,
    framePlan,
    expertRules: input.expertRules,
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    knowledgeSourceKeys: input.knowledgeSourceKeys
  });
  return { motionPlan, ai: { used: true, calls: 1, stage: "motion" } };
}

function buildStoryTaskResult(body: Record<string, unknown>) {
  const input = storyPlanContext(body);
  const framePlan = body.framePlan as StoryVideoFramePlan;
  const motionPlan = body.motionPlan as StoryVideoMotionPlan;
  if (!Array.isArray(framePlan) || !Array.isArray(motionPlan)) throw new Error("缺少首帧或动态规划结果。");
  const content = buildStoryVideoTask({
    account: input.account,
    noteTask: input.noteTask,
    story: input.story,
    framePlan,
    motionPlan,
    overallDirection: String(body.overallDirection || "").trim()
  });
  return {
    videoPrompt: { title: `${input.noteTask.topicTitle} 视频方案`, content },
    openclawTask: { title: `${input.noteTask.topicTitle} Agent 视频任务`, content },
    ai: { used: true, calls: 2, stage: "complete", totalCalls: 3 }
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.account || !body.noteTask) return NextResponse.json({ error: "缺少任务上下文" }, { status: 400 });
  if ((body.noteTask as { type?: string }).type !== "video_text") return NextResponse.json({ error: "只有视频笔记可以生成视频方案。" }, { status: 400 });
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
  if (body.action === "plan_story_frames") {
    const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildStoryFrameResult(body)));
    return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
  }
  if (body.action === "plan_story_motion") {
    const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildStoryMotionResult(body)));
    return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
  }
  if (body.action === "build_story_task") {
    try { return NextResponse.json(await runWithBackendAiCredentials(credentials, () => buildStoryTaskResult(body))); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "组装故事视频任务失败" }, { status: 400 }); }
  }
  if (body.mode === "direct_video") {
    try { return NextResponse.json(await runWithBackendAiCredentials(credentials, () => buildResult(body))); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "生成视频方案失败" }, { status: 400 }); }
  }
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildResult(body)));
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });
  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
