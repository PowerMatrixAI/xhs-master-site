import { buildCoverExecution, coverStyles, type CoverInput, type CoverVariant, type CoverVariantId } from './coverProduction';
import type { MediaGenerationInput, MediaTask } from './mediaTasks';
export type CoverBatchItem = { variantId: CoverVariantId; fingerprint: string; requestId: string; taskId?: string; productionRevision?: number; submission?: MediaGenerationInput; status: 'planned' | 'prepared' | 'submitted' };
export type CoverBatch = { version: 1; id: string; input: CoverInput; variants: CoverVariant[]; items: CoverBatchItem[]; createdAt: string };
export function coverFingerprint(input: CoverInput, variant: CoverVariant) { return JSON.stringify([input, variant]); }
export function createCoverBatch(input: CoverInput, variants: CoverVariant[], ids: CoverVariantId[], uuid: () => string): CoverBatch {
  return { version: 1, id: uuid(), input: structuredClone(input), variants: structuredClone(variants), createdAt: new Date().toISOString(), items: ids.map(variantId => ({ variantId, fingerprint: coverFingerprint(input, variants.find(v => v.variantId === variantId)!), requestId: uuid(), status: 'planned' })) };
}
export function buildSingleCoverExecution(input: CoverInput, variants: CoverVariant[], id: CoverVariantId) {
  const item = buildCoverExecution({version:1,kind:'cover_image',input,variants},[id]).items[0];
  const plan = { version:1, kind:'cover_image', variantId:id, title:item.textBlocks[0].text, subtitle:item.textBlocks[1]?.text || '', imageUrl:item.imageUrl, size:item.size, editPrompt:item.editPrompt, design:variants.find(v=>v.variantId===id)!.design, maxRepairAttempts:2 };
  const prompt = ['# 单版本封面制作任务',
    '本任务仅制作'+item.name+'，不要制作其他版本。使用xiaohongshu_auto_op的cover-image命令；若入口不支持，明确报错，不退回旧的单次编辑流程。',
    '将以下JSON保存到本任务独立目录plan.json。按Skill cover-image规则执行prepare、实际读图、generate、review、delivery。每次命令带--plan-file及--work-dir绝对路径。',
    '首次生成后逐版实际验收：文字准确、主体无遮挡、场景事实保留、风格成立。位置、换行、边距等建议允许按图调整，不能虚构用户的硬性布局要求。',
    '视觉不合格时依据原因修订prompt，自动最多修复两次；修复命令通过--prompt-file输入，入口同时传原图与上一版图。次数发起前落盘，恢复不清零。通过即停止，两次后仍不合格保留failed，不强制放行。不自动重投未决请求。',
    '仅返回本版真实合格文件的delivery结果，业务后端负责收取上传；失败保留记录，不发布、不发送飞书。上传失败复用文件，不重新生图。',
    '```json\n'+JSON.stringify(plan)+'\n```'].join('\n\n');
  return { prompt, items:[item], title:input.text+'｜'+coverStyles.find(s=>s.id===id)!.name };
}
// An adapter supplies durable saves and request-ID reconciliation. Never continue after uncertainty.
export async function submitCoverBatch(batch: CoverBatch, io: {
  checkpoint: (batch: CoverBatch) => Promise<void>;
  prepare: (item: CoverBatchItem) => Promise<MediaGenerationInput>;
  submit: (input: MediaGenerationInput, requestId: string) => Promise<MediaTask>;
  find: (requestId: string) => Promise<MediaTask | null>;
}) {
  for (const item of batch.items) {
    if (item.taskId) continue;
    if (item.status === 'prepared') {
      const found = await io.find(item.requestId);
      if (found) { item.taskId=found.id; item.status='submitted'; await io.checkpoint(batch); continue; }
      if (!item.submission) throw new Error('提交结果待核实，缺少原请求快照；请先查询原任务。');
    } else {
      item.submission=await io.prepare(item);
      item.productionRevision=item.submission.productionRevision;
      item.status='prepared';
      await io.checkpoint(batch);
    }
    const task=await io.submit(item.submission!,item.requestId);
    item.taskId=task.id; item.status='submitted';
    await io.checkpoint(batch);
  }
}
