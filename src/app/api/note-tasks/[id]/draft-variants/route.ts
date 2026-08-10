import { NextResponse } from "next/server";
import { generateDraftVariants } from "@/lib/draftVariants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { account, noteTask, weeklyPlan } = body;
    if (!account || !noteTask || !weeklyPlan) return NextResponse.json({ error: "缺少任务上下文" }, { status: 400 });
    if (!String(noteTask.writingStyleName || "").trim() || !String(noteTask.writingStyleReference || "").trim()) {
      return NextResponse.json({ error: "当前笔记任务缺少已选爆款文风资料。请重新生成本周计划后再生成文案版本。" }, { status: 400 });
    }

    const result = await generateDraftVariants({
      account,
      strategy: account.strategy || null,
      weeklyPlan,
      noteTask,
      expertRules: account.expertRules || []
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成文案版本失败。" }, { status: 422 });
  }
}
