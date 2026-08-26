import { NextResponse } from "next/server";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { completeWithBackendAi } from "@/lib/backendAiServerClient";
import { buildPostReviewPrompt } from "@/lib/expertLearning";

const ALLOWED_MODULES = new Set(["title", "cover", "image_plan", "video_plan", "body", "interaction", "risk", "positioning"]);
const ALLOWED_SOURCES = new Set(["post_performance", "comments", "expert_feedback", "user_edit", "subjective_observation"]);

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(source: string) {
  try {
    const parsed = JSON.parse(source.trim()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function extractJsonObjects(text: string) {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function findValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function normalizeReviewPayload(record: Record<string, unknown> | null) {
  if (!record) return null;
  const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : record;
  const summary = readText(findValue(nested, ["summary", "reviewSummary", "conclusion", "复盘总结", "总结", "单帖结论"]));
  const evidenceAssessment = readText(findValue(nested, ["evidenceAssessment", "evidence_assessment", "evidence", "证据评估", "证据判断", "数据诊断"]));
  const rulesValue = findValue(nested, ["rules", "expertRules", "candidateRules", "候选规则", "规则"]);
  if (!summary || !evidenceAssessment) return null;
  return { summary, evidenceAssessment, rules: Array.isArray(rulesValue) ? rulesValue : [] };
}

function extractReviewPayload(text: string) {
  const candidates = [
    text,
    ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]),
    ...extractJsonObjects(text)
  ];
  for (const candidate of candidates) {
    const payload = normalizeReviewPayload(parseJsonObject(candidate));
    if (payload) return payload;
  }
  return null;
}

function normalizeRule(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const module = readText(raw.module);
  const rule = readText(raw.rule);
  if (!ALLOWED_MODULES.has(module) || !rule) return null;
  const source = ALLOWED_SOURCES.has(readText(raw.source)) ? readText(raw.source) : "subjective_observation";
  return {
    module,
    rule,
    positiveExample: readText(raw.positiveExample),
    negativeExample: readText(raw.negativeExample),
    reason: readText(raw.reason),
    source,
    applicableWhen: readText(raw.applicableWhen),
    notApplicableWhen: readText(raw.notApplicableWhen),
    nextTest: readText(raw.nextTest)
  };
}

async function buildReviewResult(body: Record<string, unknown>) {
  const account = body.account && typeof body.account === "object" ? body.account as Record<string, unknown> : null;
  const noteTask = body.noteTask && typeof body.noteTask === "object" ? body.noteTask as Record<string, unknown> : null;
  if (!account) throw new Error("账号不存在");

  const response = await completeWithBackendAi({
    instructions: "你是小红书单篇内容复盘专家。只依据用户提供的证据进行诊断，不虚构数据或因果关系。只返回合法 JSON，不要输出 Markdown、代码围栏或额外解释。",
    input: buildPostReviewPrompt({
      account: account as never,
      noteTask: noteTask as never,
      postTitle: readText(body.postTitle), postUrl: readText(body.postUrl), publishedAt: readText(body.publishedAt),
      metrics: readText(body.metrics), comments: readText(body.comments), actualContent: readText(body.actualContent),
      expertFeedback: readText(body.expertFeedback), editComparison: readText(body.editComparison),
      subjective: readText(body.subjective), distillGoal: readText(body.distillGoal)
    })
  });
  if (!response.ok) throw new Error(`后端 AI 未能完成专家复盘：${response.error}`);

  let parsed = extractReviewPayload(response.text);
  let resolvedModel = response.model || "";
  if (!parsed) {
    const repaired = await completeWithBackendAi({
      instructions: "你是 JSON 格式修复器。只修复用户提供内容的结构，不新增、删改或推断任何复盘结论。只返回一个合法 JSON 对象，不要输出代码围栏或解释。",
      input: `将下面的内容整理为这个固定结构：
{"summary":"原有复盘总结","evidenceAssessment":"原有证据评估","rules":[{"module":"title|cover|image_plan|video_plan|body|interaction|risk|positioning","rule":"规则","positiveExample":"","negativeExample":"","reason":"","source":"post_performance|comments|expert_feedback|user_edit|subjective_observation","applicableWhen":"","notApplicableWhen":"","nextTest":""}]}

只能使用原文已有信息；如果原文没有规则，rules 返回空数组。

待修复原文：
${response.text.slice(0, 60_000)}`
    });
    if (repaired.ok) {
      parsed = extractReviewPayload(repaired.text);
      resolvedModel = repaired.model || resolvedModel;
    }
  }
  if (!parsed) throw new Error("后端 AI 返回的复盘内容无法解析为规定 JSON，客户端自动修复后仍失败，请重试。");
  const rules = parsed.rules.slice(0, 5).map(normalizeRule).filter(Boolean);
  return { summary: parsed.summary, evidenceAssessment: parsed.evidenceAssessment, aiModel: resolvedModel, rules };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.account) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (Number(body.noteTaskId || 0) && !body.noteTask) return NextResponse.json({ error: "笔记不属于当前账号" }, { status: 400 });
  const evidenceFields = ["actualContent", "metrics", "comments", "expertFeedback", "editComparison", "subjective"];
  if (!evidenceFields.some((field) => readText(body[field]))) return NextResponse.json({ error: "请至少填写一项复盘证据。" }, { status: 400 });
  const credentials = getBackendAiCredentialsFromRequest(request);
  if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
  const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildReviewResult(body)));
  return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });
  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildReviewResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}
