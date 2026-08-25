import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { buildDirectVideoTask, buildImageToVideoTask, type VideoSourceAsset } from "@/lib/videoPrompts";
import { formatExpertRulesForPrompt } from "@/lib/expertLearning";

async function buildResult(body: Record<string, unknown>) {
  const account = body.account as { name: string; accountParam: string };
  const noteTask = body.noteTask as { id: number; topicTitle: string };
  const mode = body.mode === "direct_video" ? "direct_video" : "image_to_video";
  const assets = (Array.isArray(body.assets) ? body.assets : []) as VideoSourceAsset[];
  const knowledgeSnapshotId = String(body.knowledgeSnapshotId || "").trim();
  const knowledgeSourceKeys = Array.isArray(body.knowledgeSourceKeys)
    ? body.knowledgeSourceKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (!account?.accountParam || !noteTask?.id) throw new Error("缺少账号或视频任务上下文。");

  let content = "";
  if (mode === "direct_video") {
    if (assets.length !== 1 || !String(assets[0]?.fileUrl || "").startsWith("http")) throw new Error("请选择一个可访问的视频素材。");
    content = buildDirectVideoTask({ account, noteTask, asset: assets[0] });
  } else {
    if (assets.length < 2 || assets.length > 6 || assets.some((asset) => !String(asset.fileUrl || "").startsWith("http"))) {
      throw new Error("图片转视频需要按顺序选择 2-6 张可访问的素材库图片。");
    }
    content = await buildImageToVideoTask({
      account,
      noteTask,
      assets,
      expertRules: formatExpertRulesForPrompt((account as { expertRules?: Array<{ module: string; rule: string; source?: string; enabled?: boolean; updatedAt?: string }> }).expertRules || [], ["cover", "video_plan", "risk"]),
      knowledgeSnapshotId,
      knowledgeSourceKeys
    });
  }
  return { videoPrompt: { title: `${noteTask.topicTitle} 视频方案`, content }, openclawTask: { title: `${noteTask.topicTitle} Agent 视频任务`, content }, ai: { used: mode === "image_to_video", calls: mode === "image_to_video" ? 1 : 0 } };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.account || !body.noteTask) return NextResponse.json({ error: "缺少任务上下文" }, { status: 400 });
  if ((body.noteTask as { type?: string }).type !== "video_text") return NextResponse.json({ error: "只有视频笔记可以生成视频方案。" }, { status: 400 });
  if (body.mode === "direct_video") {
    try { return NextResponse.json(await buildResult(body)); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "生成视频方案失败" }, { status: 400 }); }
  }
  const task = createAsyncRouteTask(() => buildResult(body));
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
