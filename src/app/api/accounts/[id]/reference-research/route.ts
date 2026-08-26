import { NextResponse } from "next/server";
import { z } from "zod";
import { createAsyncRouteTask, getAsyncRouteTask } from "@/lib/asyncRouteTask";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { buildAccountStrategy } from "@/lib/strategy";
import { regenerateStrategyFromReferenceResearchWithLlm, summarizeReferenceResearchWithLlm } from "@/lib/llm";
import { getTemplateByKey } from "@/data/accountTypeTemplates";
import { buildReferenceResearchPrompt } from "@/lib/referenceResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const accountSchema = z.object({
  id: z.number(),
  name: z.string(),
  accountParam: z.string().default(""),
  accountType: z.string(),
  stage: z.string().default("冷启动"),
  personaBase: z.string().default(""),
  city: z.string().default(""),
  targetUsers: z.string().default(""),
  painPoints: z.string().default(""),
  contentDirections: z.string().default(""),
  businessGoals: z.string().default(""),
  monetization: z.string().default(""),
  referenceAccounts: z.string().default(""),
  materialCondition: z.string().default(""),
  taboos: z.string().default(""),
  profilePath: z.string().default(""),
  assetsPath: z.string().default(""),
  profile: z
    .object({
      content: z.string().default(""),
      version: z.number().default(1),
      path: z.string().default("")
    })
    .nullable()
    .optional()
});

const bodySchema = z.object({
  action: z.enum(["prepare", "save-results"]).default("prepare"),
  account: accountSchema,
  researchId: z.number().optional(),
  rawResults: z.string().optional(),
  selectedAccounts: z.string().optional()
});

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "请求参数不合法";
  if (error instanceof Error) return error.message;
  return "爆款研究处理失败";
}

async function buildReferenceResearchResult(body: z.infer<typeof bodySchema>) {
  const account = {
    ...body.account,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  };
  const templateSeed = getTemplateByKey(account.accountType);
  const template = {
    id: 0,
    typeKey: templateSeed.typeKey,
    name: templateSeed.name,
    defaultColumns: JSON.stringify(templateSeed.defaultColumns),
    weeklyRatio: JSON.stringify(templateSeed.weeklyRatio),
    imageStrategy: JSON.stringify(templateSeed.imageStrategy),
    titleStrategy: JSON.stringify(templateSeed.titleStrategy),
    coverStrategy: JSON.stringify(templateSeed.coverStrategy),
    interactionStrategy: JSON.stringify(templateSeed.interactionStrategy),
    commercializationPath: JSON.stringify(templateSeed.commercializationPath),
    riskRules: JSON.stringify(templateSeed.riskRules),
    promptRules: JSON.stringify(templateSeed.promptRules),
    createdAt: new Date(0),
    updatedAt: new Date(0)
  };

  const researchId = body.researchId || Date.now();
  const rawResults = String(body.rawResults || "");
  const selectedAccounts = String(body.selectedAccounts || "");
  if (!rawResults.trim()) {
    throw new Error("请先粘贴 xiaohongshu_auto_op 返回结果。");
  }

  const summaryResult = await summarizeReferenceResearchWithLlm({
    account: account as never,
    template: template as never,
    rawResults,
    selectedAccounts
  });

  if (!summaryResult.usedLlm) {
    throw new Error(`AI 未能完成参考账号总结：${summaryResult.error || "未知错误"}`);
  }
  if (!/(?:^|\n)###\s*文风：\S+/u.test(summaryResult.data.writingStyleInsights)) {
    throw new Error("爆款研究未生成可用文风库。请确保每种文风均以“### 文风：唯一名称”独立输出后重试。");
  }

  const research = {
    id: researchId,
    accountId: account.id,
    searchKeywords: "",
    commandJson: "[]",
    researchPrompt: buildReferenceResearchPrompt(account as never, template as never, researchId),
    rawResults,
    selectedAccounts,
    summaryMarkdown: summaryResult.data.summaryMarkdown,
    contentFeatures: summaryResult.data.contentFeatures,
    personaInsights: summaryResult.data.personaInsights,
    strategyInsights: summaryResult.data.strategyInsights,
    writingStyleInsights: summaryResult.data.writingStyleInsights,
    status: "已总结"
  };

  const updatedAccount = {
    ...account,
    referenceAccounts: [
      selectedAccounts ? `## 人工标记参考账号\n${selectedAccounts}` : "",
      `## 爆款研究总览\n${summaryResult.data.summaryMarkdown}`,
      `## 参考账号内容特色\n${summaryResult.data.contentFeatures}`,
      `## 人设洞察\n${summaryResult.data.personaInsights}`,
      `## 策略洞察\n${summaryResult.data.strategyInsights}`,
      `## 爆款正文文风洞察\n${summaryResult.data.writingStyleInsights}`
    ]
      .filter(Boolean)
      .join("\n\n")
  };

  const fallbackStrategy = buildAccountStrategy(updatedAccount as never, template as never);
  const strategyResult = await regenerateStrategyFromReferenceResearchWithLlm({
    account: updatedAccount as never,
    template: template as never,
    referenceSummary: {
      summaryMarkdown: research.summaryMarkdown,
      contentFeatures: research.contentFeatures,
      personaInsights: research.personaInsights,
      strategyInsights: research.strategyInsights,
      writingStyleInsights: research.writingStyleInsights,
      selectedAccounts: research.selectedAccounts
    },
    fallback: fallbackStrategy
  });

  if (!strategyResult.usedLlm) {
    throw new Error(`AI 未能基于爆款研究重生成策划案：${strategyResult.error || "未知错误"}`);
  }

  return {
    research,
    summary: summaryResult.data,
    account: {
      ...updatedAccount,
      strategy: {
        markdown: strategyResult.data.markdown,
        positioning: strategyResult.data.positioning,
        execGuide: strategyResult.data.execGuide
      },
      profile: {
        content: strategyResult.data.agentsMdContent,
        version: (body.account.profile?.version || 0) + 1,
        path: body.account.profile?.path || body.account.profilePath || ""
      }
    }
  };
}

export async function GET(request: Request) {
  const uuid = new URL(request.url).searchParams.get("uuid")?.trim();
  if (!uuid) return NextResponse.json({ error: "缺少 uuid" }, { status: 400 });

  const task = getAsyncRouteTask<Awaited<ReturnType<typeof buildReferenceResearchResult>>>(uuid);
  if (!task) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  if (task.status === "pending") return NextResponse.json({ async: true, uuid, status: "pending" });
  if (task.status === "failed") return NextResponse.json({ async: true, uuid, status: "failed", error: task.error || "任务执行失败" });
  return NextResponse.json({ async: true, uuid, status: "completed", result: task.result });
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const account = {
      ...body.account,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };
    const templateSeed = getTemplateByKey(account.accountType);
    const template = {
      id: 0,
      typeKey: templateSeed.typeKey,
      name: templateSeed.name,
      defaultColumns: JSON.stringify(templateSeed.defaultColumns),
      weeklyRatio: JSON.stringify(templateSeed.weeklyRatio),
      imageStrategy: JSON.stringify(templateSeed.imageStrategy),
      titleStrategy: JSON.stringify(templateSeed.titleStrategy),
      coverStrategy: JSON.stringify(templateSeed.coverStrategy),
      interactionStrategy: JSON.stringify(templateSeed.interactionStrategy),
      commercializationPath: JSON.stringify(templateSeed.commercializationPath),
      riskRules: JSON.stringify(templateSeed.riskRules),
      promptRules: JSON.stringify(templateSeed.promptRules),
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };

    if (body.action === "prepare") {
      const researchId = body.researchId || Date.now();
      const researchPrompt = buildReferenceResearchPrompt(account as never, template as never, researchId);
      const research = {
        id: researchId,
        accountId: account.id,
        searchKeywords: "",
        commandJson: "[]",
        researchPrompt,
        rawResults: "",
        selectedAccounts: "",
        summaryMarkdown: "",
        contentFeatures: "",
        personaInsights: "",
        strategyInsights: "",
        writingStyleInsights: "",
        status: "待搜索"
      };
      return NextResponse.json({ research, commands: [], researchPrompt });
    }

    const credentials = getBackendAiCredentialsFromRequest(request);
    if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
    const task = createAsyncRouteTask(() => runWithBackendAiCredentials(credentials, () => buildReferenceResearchResult(body)));
    return NextResponse.json({ async: true, uuid: task.uuid, status: task.status });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
