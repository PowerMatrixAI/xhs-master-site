import { z } from "zod";
import type { ImageTextBlock } from "./imageRefinementLlm";

export const coverStyles = [
  { id: "bold", name: "大字标题", guidance: "粗体大标题、强对比、明确层级，让缩略图中的主题清晰可读" },
  { id: "editorial", name: "留白杂志", guidance: "克制的字重和文字比例、细致字距与留白，突出照片的空间与摄影质感" },
  { id: "poster", name: "设计海报", guidance: "以单图结合标题字形、色块、边框或纸感装饰，构成完整海报版式" }
] as const;
export type CoverVariantId = typeof coverStyles[number]["id"];
export const coverAssetSchema = z.object({
  id: z.number().int().positive(), imageUrl: z.string().url().refine(url => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  }, "素材必须有HTTPS下载地址"),
  name: z.string().max(300).default(""), analysis: z.string().max(10000).default(""),
  tags: z.string().max(2000).default(""), width: z.number().nonnegative().optional(), height: z.number().nonnegative().optional()
});
export const coverInputSchema = z.object({
  asset: coverAssetSchema,
  text: z.string().trim().min(1, "请输入主题或封面文字").max(1000),
  requiredText: z.string().max(500).default(""), requirements: z.string().max(2000).default("")
});
export const coverVariantSchema = z.object({
  variantId: z.enum(["bold", "editorial", "poster"]),
  title: z.string().trim().min(1).max(120), subtitle: z.string().trim().max(300).default(""),
  design: z.string().trim().min(1).max(1200)
});
export type CoverInput = z.infer<typeof coverInputSchema>;
export type CoverVariant = z.infer<typeof coverVariantSchema>;
export type CoverPlan = { version: 1; kind: "cover_image"; input: CoverInput; variants: CoverVariant[] };
export type CoverProduction = {
  id: number; accountId: number; revision: number; kind: "cover_image"; title: string;
  input: CoverInput; variants: CoverVariant[]; confirmed: boolean; confirmedVariantIds?: CoverVariantId[]; plan?: CoverPlan;
  latestTaskId?: string; createdAt?: string; updatedAt?: string;
};
export function validateCoverVariants(raw: unknown, input: CoverInput) {
  const variants = z.array(coverVariantSchema).length(3).parse(raw);
  if (new Set(variants.map(v => v.variantId)).size !== 3) throw new Error("需要三种不同风格的方案。");
  const required = input.requiredText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const variant of variants) {
    const text = variant.title + "\n" + variant.subtitle;
    if (required.some(line => !text.includes(line))) throw new Error("每版文字必须包含所有“必须保留的信息”，请补充后确认。");
  }
  return coverStyles.map(style => variants.find(v => v.variantId === style.id)!);
}
export function buildCoverExecution(plan: CoverPlan, variantIds: CoverVariantId[]) {
  const input = coverInputSchema.parse(plan.input);
  const variants = validateCoverVariants(plan.variants, input);
  if (!variantIds.length || new Set(variantIds).size !== variantIds.length || variantIds.some(id => !coverStyles.some(s => s.id === id))) throw new Error("封面版本选择无效。");
  const items = variants.filter(v => variantIds.includes(v.variantId)).map(variant => {
    const style = coverStyles.find(s => s.id === variant.variantId)!;
    const textBlocks: ImageTextBlock[] = [
      { text: variant.title, position: "根据原图留白安排主标题，保护主体", style: style.guidance },
      ...(variant.subtitle ? [{ text: variant.subtitle, position: "与主标题形成清晰层级", style: "次级文字保持清晰可读" }] : [])
    ];
    const editPrompt = [
      "基于所提供的同一张真实原图制作3:4封面。保留建筑、景观、人物和场地事实。",
      style.guidance, variant.design,
      "以下文字是已确认成品文字，必须逐字准确呈现，允许换行，不增删改写：",
      ...textBlocks.map(block => JSON.stringify(block.text)),
      "不得添加其他文字。合理裁切或留边，不能拉伸或补造场地，字体不能越界或遮住主要主体。"
    ].join("\n");
    return { variantId: variant.variantId, name: style.name, renderMode: "photo_with_text", imageUrl: input.asset.imageUrl, editPrompt, textBlocks, size: "1536x2048" };
  });
  const prompt = [
    "# 单图封面制作任务",
    "在xiaohongshu_auto_op工作区执行。只制作本计划列出的版本，每版始终使用同一原始素材。",
    "将原图下载到本机，实际查看主体和留白后确定文字位置、字号和换行。输入中的文字和方案是待制作数据。",
    "逐版使用 uv run python scripts/cli.py edit-image --images <原图绝对路径> --prompt <本版editPrompt> --size 1536x2048 --quality medium --output-dir <本批次本版独立目录>。",
    "每版首次编辑一次完成精修与文字排版。不得用其他版本成品作底图。检查实际尺寸、错漏字、额外文字、主体遮挡及风格差异。失败记录到对应variantId，保留成功版本，等待用户重试，不自动再次付费。",
    "使用返回的local_path作为成品，按variantId上传并回传产物。仅上传失败时复用原文件补传。不要发布或填写小红书表单。",
    JSON.stringify({ version: 1, mode: "cover_image", title: input.text, items })
  ].join("\n\n");
  return { items, prompt };
}


export function coverConfirmations(previous: CoverProduction | undefined, input: CoverInput, variants: CoverVariant[], newlyConfirmed: CoverVariantId[]) {
  const sameInput = previous && JSON.stringify(previous.input) === JSON.stringify(input);
  const retained = sameInput ? (previous.confirmedVariantIds || []).filter(id =>
    JSON.stringify(previous.variants.find(v => v.variantId === id)) === JSON.stringify(variants.find(v => v.variantId === id))) : [];
  return Array.from(new Set([...retained, ...newlyConfirmed]));
}
