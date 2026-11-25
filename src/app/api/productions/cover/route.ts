import { NextResponse } from "next/server";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { coverInputSchema } from "@/lib/coverProduction";
import { planCovers } from "@/lib/coverProductionLlm";
declare global { var __coverTaskOwners: Map<string, string> | undefined; }
const owners = globalThis.__coverTaskOwners ||= new Map<string, string>();
export async function POST(request: Request) {
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "请重新登录。" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = coverInputSchema.safeParse(body?.input);
  if (!parsed.success || !Number.isSafeInteger(body?.account?.id) || body.account.id <= 0) return NextResponse.json({ error: "请选择当前账号的一张有效图片，并填写封面文字。" }, { status: 400 });
  const account = { name: String(body.account.name || ""), accountType: String(body.account.accountType || ""), taboos: String(body.account.taboos || "") };
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => planCovers(parsed.data, account, credentials)));
  owners.set(task.uuid, String(credentials.uid));
  for (const id of owners.keys()) if (!getAsyncRouteTask(id)) owners.delete(id);
  return NextResponse.json({ uuid: task.uuid, status: task.status });
}
export async function GET(request: Request) {
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "请重新登录。" }, { status: 401 });
  const uuid = new URL(request.url).searchParams.get("uuid") || "";
  if (owners.get(uuid) !== String(credentials.uid)) return NextResponse.json({ error: "任务不存在或无权访问。" }, { status: 404 });
  const task = getAsyncRouteTask(uuid);
  if (!task) return NextResponse.json({ error: "规划任务已过期，请重新生成。" }, { status: 404 });
  return NextResponse.json(task);
}
