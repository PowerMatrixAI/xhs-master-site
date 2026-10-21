"use client";

import { useState } from "react";
import { LoaderCircle, Pencil, Save, Sparkles, Trash2 } from "lucide-react";
import type { Asset } from "@/types/domain";
import type { AssetAnalysisAction } from "@/lib/api";

export function AssetAnalysisCard({ asset, disabled, loadingAction, onAction }: {
  asset: Asset;
  disabled: boolean;
  loadingAction: string | null;
  onAction: (assetId: number, action: AssetAnalysisAction, content?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const count = Array.from(draft).length;
  const pending = asset.aiAnalysisStatus === "pending";
  const busy = loadingAction?.startsWith(`assetAnalysis-${asset.id}-`);
  const buttonClass = "inline-flex items-center gap-1 text-xs text-teal hover:underline disabled:cursor-not-allowed disabled:opacity-50";

  async function act(action: AssetAnalysisAction, content?: string) {
    setError("");
    try {
      await onAction(asset.id, action, content);
      if (action === "update") setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片分析操作失败，请重试。");
    }
  }

  return (
    <div className="space-y-2 rounded border border-teal/15 bg-teal/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal"><Sparkles size={13} /> 图片分析</span>
        {busy && <LoaderCircle size={13} className="animate-spin text-teal" aria-label="正在处理图片分析" />}
      </div>
      {editing ? (
        <div className="space-y-2">
          <label className="block">
            <span className="sr-only">编辑图片分析</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              disabled={disabled}
              placeholder="描述场景、人物及主要物体的位置分布，100字以内"
              className="w-full resize-y rounded border border-ink/15 bg-white p-2 text-xs leading-5 outline-none focus:border-teal focus:ring-1 focus:ring-teal/30"
            />
          </label>
          <div className={`text-right text-xs ${count > 100 ? "text-red-600" : "text-ink/45"}`}>{count}/100 字</div>
          <div className="flex gap-3">
            <button type="button" disabled={disabled || !draft.trim() || count > 100} onClick={() => void act("update", draft.trim())} className={buttonClass}><Save size={12} /> 保存分析</button>
            <button type="button" disabled={disabled} onClick={() => { setEditing(false); setError(""); }} className="text-xs text-ink/55 hover:underline disabled:opacity-50">取消</button>
          </div>
        </div>
      ) : (
        <>
          {asset.aiAnalysis && <p className="whitespace-pre-wrap break-words text-xs leading-5 text-ink/75">{asset.aiAnalysis}</p>}
          {pending ? (
            <p className="text-xs leading-5 text-ink/50" role="status">{asset.aiAnalysis ? "正在重新分析，完成后自动更新。" : "等待后台分析，完成后自动显示。"}</p>
          ) : asset.aiAnalysisStatus === "failed" ? (
            <p className="text-xs leading-5 text-ink/50" role="status">分析暂未成功，可重试；后台也会自动重试近期素材。</p>
          ) : !asset.aiAnalysis && (
            <p className="text-xs text-ink/50">{asset.aiAnalysisStatus === "deleted" ? "分析已删除，可重新生成或手动填写。" : "暂无图片分析。"}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            <button type="button" disabled={disabled} onClick={() => { setDraft(asset.aiAnalysis || ""); setEditing(true); setError(""); }} className={buttonClass}><Pencil size={12} /> {asset.aiAnalysis ? "编辑" : "填写"}</button>
            <button type="button" disabled={disabled} onClick={() => void act("generate")} className={buttonClass}><Sparkles size={12} /> {asset.aiAnalysis ? "重新生成" : "生成分析"}</button>
            {(pending || asset.aiAnalysisStatus === "failed") && <button type="button" disabled={disabled} onClick={() => void act("get")} className={buttonClass}>刷新结果</button>}
            {(asset.aiAnalysis || pending || asset.aiAnalysisStatus === "failed") && <button type="button" disabled={disabled} onClick={() => void act("delete")} className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50"><Trash2 size={12} /> 删除分析</button>}
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
