import { NextResponse } from "next/server";
import { z } from "zod";
import { getBackendAiCredentialsFromRequest, runWithBackendAiCredentials } from "@/lib/backendAiRequestContext";
import { accountTypeTemplates, getTemplateByKey } from "@/data/accountTypeTemplates";
import { generateStrategyWithLlm } from "@/lib/llm";
import { buildAccountStrategy } from "@/lib/strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const requestSchema = z.object({
  account: z.object({
    id: z.number().optional().default(0),
    name: z.string().min(1),
    accountParam: z.string().default(""),
    accountType: z.string().min(1),
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
    assetsPath: z.string().default("")
  })
});

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "请求参数不合法";
  if (error instanceof Error) return error.message;
  return "生成策划案失败";
}

export async function POST(request: Request) {
  try {
    const credentials = getBackendAiCredentialsFromRequest(request);
    if (!credentials) return NextResponse.json({ error: "登录认证信息缺失，请重新登录后重试。" }, { status: 401 });
    const { account } = requestSchema.parse(await request.json());
    const templateSeed = getTemplateByKey(account.accountType) ?? accountTypeTemplates[0];
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

    const accountRecord = {
      ...account,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };

    const fallback = buildAccountStrategy(accountRecord as never, template as never);
    const strategyResult = await runWithBackendAiCredentials(
      credentials,
      () => generateStrategyWithLlm(accountRecord as never, template as never, fallback)
    );

    return NextResponse.json({
      usedLlm: strategyResult.usedLlm,
      model: strategyResult.usedLlm ? strategyResult.model : null,
      error: strategyResult.usedLlm ? null : strategyResult.error || null,
      strategy: strategyResult.data
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
