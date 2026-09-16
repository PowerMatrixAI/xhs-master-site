"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FilePlus2, LoaderCircle, Pencil, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  createBackendStoryCharacterTemplate,
  fetchBackendStoryCharacterTemplates,
  isPlatformAdmin,
  updateBackendStoryCharacterTemplate,
  type LoginResponse
} from "@/lib/api";
import type { StoryCharacterTemplate } from "@/lib/storyCharacters";

type FeedbackTone = "success" | "error";
type PageMode = "list" | "create" | "edit";

export function StoryTemplateManagementPanel({ currentUser, notify, initialPage, onBackToLibrary }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: FeedbackTone) => void;
  initialPage?: PageMode;
  onBackToLibrary?: () => void;
}) {
  const [templates, setTemplates] = useState<StoryCharacterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState<PageMode>(initialPage || "list");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateOutline, setTemplateOutline] = useState("");
  const [requiredScenesText, setRequiredScenesText] = useState("");
  const admin = isPlatformAdmin(currentUser);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTemplates(await fetchBackendStoryCharacterTemplates());
    } catch (loadError) {
      setTemplates([]);
      setError(loadError instanceof Error ? loadError.message : "获取故事模板失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  function splitRequiredScenes(value: string) {
    return value.split(/\r?\n/).map((scene) => scene.trim()).filter(Boolean);
  }

  function openCreate() {
    setSelectedTemplateId("");
    setTemplateName("");
    setTemplateOutline("");
    setRequiredScenesText("");
    setPage("create");
  }

  function openEdit(template: StoryCharacterTemplate) {
    setSelectedTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateOutline(template.outline);
    setRequiredScenesText(template.requiredScenes.join("\n"));
    setPage("edit");
  }

  function backToList() {
    if (!saving) setPage("list");
  }

  async function submitTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin) {
      notify("仅平台管理员可以管理故事模板。", "error");
      return;
    }
    if (!templateName.trim() || !templateOutline.trim()) {
      notify("请填写故事模板名称和内容。", "error");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: templateName.trim(),
        outline: templateOutline.trim(),
        requiredScenes: splitRequiredScenes(requiredScenesText)
      };
      const saved = page === "create"
        ? await createBackendStoryCharacterTemplate(input)
        : await updateBackendStoryCharacterTemplate({ templateId: selectedTemplateId, ...input });
      setTemplates((current) => page === "create"
        ? [...current, saved]
        : current.map((template) => template.id === saved.id ? saved : template));
      setSelectedTemplateId(saved.id);
      setPage("list");
      notify(page === "create" ? "故事模板已创建。" : "故事模板已保存。", "success");
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "保存故事模板失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!admin) {
    return <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">当前账号没有故事模板管理权限。</div></div>;
  }

  if (page !== "list") {
    return (
      <div className="space-y-5">
        <div className="panel">
          <button type="button" onClick={backToList} disabled={saving} className="secondary-button mb-5">
            <ArrowLeft size={16} /> 返回故事模板
          </button>
          <div className="flex items-center gap-2">
            <h2 className="section-title">{page === "create" ? "创建故事模板" : "编辑故事模板"}</h2>
            <span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">{page === "create" ? "创建后，模板会立即出现在所有用户的故事生成页面中。" : "修改后，新的故事内容和场景要求会立即用于后续生成。"}</p>
        </div>

        <div className="panel max-w-4xl">
          <form onSubmit={submitTemplate} className="grid gap-4">
            {page === "edit" && <label className="field"><span>模板标识</span><input value={selectedTemplateId} readOnly className="bg-ink/5" /></label>}
            <label className="field"><span>模板名称</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={100} placeholder="例如：小熊｜山谷回声" /></label>
            <label className="field"><span>故事内容</span><textarea value={templateOutline} onChange={(event) => setTemplateOutline(event.target.value)} maxLength={5000} rows={9} placeholder="描述故事主线、冲突和结尾。" /></label>
            <label className="field"><span>场景要求（每行一条，可选）</span><textarea value={requiredScenesText} onChange={(event) => setRequiredScenesText(event.target.value)} maxLength={20000} rows={5} placeholder="例如：第 2 个场景必须出现一句对白。" /></label>
            <div className="flex flex-wrap justify-end gap-3 border-t border-ink/10 pt-4">
              <button type="button" onClick={backToList} disabled={saving} className="secondary-button">取消</button>
              <button type="submit" disabled={saving || loading} className="primary-button">
                {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} {saving ? "正在保存..." : page === "create" ? "创建故事模板" : "保存模板修改"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="section-title">故事模板</h2>
              <span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">创建和维护创意故事视频模板。模板属于平台资源，所有用户的故事生成页面都会读取这里的最新内容。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBackToLibrary && <button type="button" onClick={onBackToLibrary} disabled={loading} className="secondary-button"><ArrowLeft size={16} /> 返回平台素材库</button>}
            <button type="button" onClick={() => void loadTemplates()} disabled={loading} className="secondary-button">
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 刷新
            </button>
            <button type="button" onClick={openCreate} className="primary-button"><FilePlus2 size={17} /> 新建故事模板</button>
          </div>
        </div>
      </div>

      {error && <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">{error}</div></div>}
      {!loading && !error && !templates.length && <div className="panel"><div className="rounded border border-dashed border-ink/20 bg-white/60 p-10 text-center text-sm text-ink/60">还没有故事模板，点击右上角创建第一个模板。</div></div>}
      {templates.length > 0 && <div className="grid gap-5 lg:grid-cols-2">
        {templates.map((template) => (
          <article key={template.id} className="panel flex min-h-64 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{template.name}</h3>
                <div className="mt-1 text-xs text-ink/40">模板标识：{template.id}</div>
              </div>
              <button type="button" onClick={() => openEdit(template)} className="secondary-button"><Pencil size={16} /> 编辑</button>
            </div>
            <p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-7 text-ink/70">{template.outline}</p>
            <div className="mt-4 border-t border-ink/10 pt-3 text-xs text-ink/50">
              {template.requiredScenes.length ? `场景要求：${template.requiredScenes.length} 条` : "暂无额外场景要求"}
              {template.updatedAt && <span className="ml-3">更新于 {template.updatedAt}</span>}
            </div>
          </article>
        ))}
      </div>}
    </div>
  );
}
