import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import type { BackendAiCredentials } from "@/lib/backendAiClient";
import { fetchFeaturedVlogTemplatesFromBackend, fetchMusicCandidatesFromBackend, type VlogScript, type FeaturedVlogFramePlan } from "@/lib/featuredVlog";
import { generateFeaturedVlogScript, adaptFeaturedVlogCharacter, planFeaturedVlogFrames, selectFeaturedVlogMusic } from "@/lib/featuredVlogPrompts";
import { buildOmniTask, omniEnabled, validateOmniScript, vlogResolution } from "@/lib/featuredVlogOmni";
import { vlogCharacterSelection } from "@/lib/vlogCharacters";
import { videoAccountContext } from "@/lib/contentProductions";
import type { VideoSourceAsset } from "@/lib/videoPrompts";

declare global { var __productionTaskOwners: Map<string, string> | undefined; }
const owners = globalThis.__productionTaskOwners ||= new Map<string, string>();

async function execute(body: Record<string, unknown>, credentials: BackendAiCredentials) {
  const account = videoAccountContext(body.account as Record<string, unknown>);
  if (!Number.isSafeInteger(account.id) || !account.accountParam) throw new Error("请选择有效客户账号。");
  if (!omniEnabled()) throw new Error("独立精选Vlog需要启用Omni。");
  const templates = await fetchFeaturedVlogTemplatesFromBackend(credentials);
  const template = templates.find(t => t.id === body.templateId);
  if (!template) throw new Error("模板不存在或已停用。");
  if (body.templateVersion && body.templateVersion !== template.version) throw new Error("模板已更新，请重新生成脚本。");
  if (body.action === "script") {
    return generateFeaturedVlogScript({
      standalone: true, account, template, noteTask: {}, availableWritingStyles: [],
      extraRequirements: String(body.extraRequirements || ""),
      knowledgeSnapshotId: String(body.knowledgeSnapshotId || "")
    });
  }
  const script = body.featuredVlogScript as VlogScript;
  validateOmniScript(script);
  const assets = (Array.isArray(body.assets) ? body.assets : []) as VideoSourceAsset[];
  const characterSelection = vlogCharacterSelection(body.character);
  switch (body.action) {
    case "featured_vlog_context":
      return { template, assets, music: await fetchMusicCandidatesFromBackend(Number(account.id), credentials) };
    case "adapt_featured_vlog_character":
      return adaptFeaturedVlogCharacter({ script, characterSelection, credentials });
    case "plan_featured_vlog_frames":
      return planFeaturedVlogFrames({ script, template, assets, credentials });
    case "select_featured_vlog_music": {
      const excluded = body.excludedMusicId;
      if (excluded !== undefined && (!Number.isSafeInteger(excluded) || Number(excluded) <= 0)) throw new Error("排除配乐ID无效。");
      return selectFeaturedVlogMusic({ accountId: Number(account.id), script, credentials, excludedMusicId: excluded as number | undefined });
    }
    case "build_featured_vlog_task": {
      if (!Number.isSafeInteger(body.productionId) || Number(body.productionId) <= 0) throw new Error("请先保存作品。");
      const music = (await fetchMusicCandidatesFromBackend(Number(account.id), credentials)).find(m => m.id === (body.selectedMusic as { id?: number })?.id);
      if (!music) throw new Error("配乐已失效，请重新选曲。");
      const content = buildOmniTask({ productionId: Number(body.productionId), script, template,
        framePlan: body.framePlan as FeaturedVlogFramePlan, music, characterSelection,
        resolution: vlogResolution(body.resolution), useReferenceVideo: body.featuredVlogUseReferenceVideo === true,
        overallDirection: String(body.overallDirection || "") });
      return { openclawTask: { content, title: script.title }, videoPrompt: { content, title: script.title }, sceneReferences: body.framePlan };
    }
    default: throw new Error("不支持的制作步骤。");
  }
}

export async function POST(request: Request) {
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "请重新登录。" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.account) return NextResponse.json({ error: "缺少账号资料。" }, { status: 400 });
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => execute(body, credentials)));
  owners.set(task.uuid, String(credentials.uid));
  for (const id of owners.keys()) if (!getAsyncRouteTask(id)) owners.delete(id);
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
}
export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid");
  if (!uuid) return NextResponse.json({ error: "缺少任务编号。" }, { status: 400 });
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "请重新登录。" }, { status: 401 });
  if (owners.get(uuid) !== String(credentials.uid)) return NextResponse.json({ error: "任务不存在或无权访问。" }, { status: 404 });
  const task = getAsyncRouteTask(uuid);
  if (!task) return NextResponse.json({ error: "任务状态已丢失。" }, { status: 404 });
  return NextResponse.json({ ...task, uuid });
}
