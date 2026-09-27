"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FilePlus2, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  createFeaturedVlogTemplate,
  deleteFeaturedVlogTemplate,
  fetchFeaturedVlogTemplates,
  type FeaturedVlogBeat,
  type FeaturedVlogTemplate,
  updateFeaturedVlogTemplate
} from "@/lib/featuredVlog";
import { isPlatformAdmin, type LoginResponse } from "@/lib/api";

type FeedbackTone = "success" | "error";
type PageMode = "list" | "create" | "edit";

const emptyBeat = (): FeaturedVlogBeat => ({ name: "", shotDuty: "", visualGuidance: "", required: true });

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function splitTags(value: string) {
  return value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
}

export function FeaturedVlogManagementPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: FeedbackTone) => void;
}) {
  const [templates, setTemplates] = useState<FeaturedVlogTemplate[]>([]);
  const [page, setPage] = useState<PageMode>("list");
  const [selected, setSelected] = useState<FeaturedVlogTemplate | null>(null);
  const [name, setName] = useState("");
  const [outline, setOutline] = useState("");
  const [beats, setBeats] = useState<FeaturedVlogBeat[]>([emptyBeat()]);
  const [requiredScenes, setRequiredScenes] = useState("");
  const [perspectiveGuidance, setPerspectiveGuidance] = useState("");
  const [visualGuidance, setVisualGuidance] = useState("");
  const [musicTags, setMusicTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const admin = isPlatformAdmin(currentUser);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTemplates(await fetchFeaturedVlogTemplates());
    } catch (loadError) {
      setTemplates([]);
      setError(loadError instanceof Error ? loadError.message : "获取精选 Vlog 模板失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  function openCreate() {
    setSelected(null);
    setName("");
    setOutline("");
    setBeats([emptyBeat()]);
    setRequiredScenes("");
    setPerspectiveGuidance("");
    setVisualGuidance("");
    setMusicTags("");
    setPage("create");
  }

  function openEdit(template: FeaturedVlogTemplate) {
    setSelected(template);
    setName(template.name);
    setOutline(template.outline);
    setBeats(template.beats.length ? template.beats : [emptyBeat()]);
    setRequiredScenes(template.requiredScenes.join("\n"));
    setPerspectiveGuidance(template.perspectiveGuidance);
    setVisualGuidance(template.visualGuidance);
    setMusicTags(template.musicTags.join(", "));
    setPage("edit");
  }

  function updateBeat(index: number, patch: Partial<FeaturedVlogBeat>) {
    setBeats((current) => current.map((beat, beatIndex) => beatIndex === index ? { ...beat, ...patch } : beat));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin) {
      notify("仅平台管理员可以管理精选 Vlog 模板。", "error");
      return;
    }
    const normalizedBeats = beats.map((beat) => ({
      name: beat.name.trim(),
      shotDuty: beat.shotDuty.trim(),
      visualGuidance: beat.visualGuidance.trim(),
      required: beat.required
    }));
    if (!name.trim() || !outline.trim() || normalizedBeats.some((beat) => !beat.name || !beat.shotDuty)) {
      notify("请填写模板名称、故事梗概，以及每个镜头的名称和职责。", "error");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        outline: outline.trim(),
        beats: normalizedBeats,
        requiredScenes: splitLines(requiredScenes),
        perspectiveGuidance: perspectiveGuidance.trim(),
        visualGuidance: visualGuidance.trim(),
        musicTags: splitTags(musicTags)
      };
      const saved = page === "create"
        ? await createFeaturedVlogTemplate(input)
        : await updateFeaturedVlogTemplate({ ...input, id: selected?.id || "", version: selected?.version || 0 });
      setTemplates((current) => page === "create" ? [...current, saved] : current.map((item) => item.id === saved.id ? saved : item));
      setPage("list");
      notify(page === "create" ? "精选 Vlog 模板已创建。" : "精选 Vlog 模板已保存。", "success");
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "保存精选 Vlog 模板失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(template: FeaturedVlogTemplate) {
    if (!window.confirm(`确定删除精选 Vlog 模板「${template.name}」吗？\n\n删除后，用户将不能再选择这个模板；已生成的任务不受影响。`)) return;
    setSaving(true);
    try {
      await deleteFeaturedVlogTemplate({ id: template.id, version: template.version });
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      notify("精选 Vlog 模板已删除。", "success");
    } catch (deleteError) {
      notify(deleteError instanceof Error ? deleteError.message : "删除精选 Vlog 模板失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!admin) {
    return <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">当前账号没有平台管理权限。</div></div>;
  }

  if (page !== "list") {
    return (
      <div className="space-y-5">
        <div className="panel">
          <button type="button" onClick={() => setPage("list")} disabled={saving} className="secondary-button mb-5"><ArrowLeft size={16} /> 返回精选 Vlog</button>
          <div className="flex items-center gap-2"><h2 className="section-title">{page === "create" ? "新建精选 Vlog 模板" : "编辑精选 Vlog 模板"}</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">模板保存后会成为所有用户生成精选 Vlog 时可选的服务端模板。</p>
        </div>
        <div className="panel">
          <form onSubmit={submit} className="grid gap-4">
            {page === "edit" && <label className="field"><span>模板标识 / 版本</span><input value={`${selected?.id || ""} / v${selected?.version || 0}`} readOnly className="bg-ink/5" /></label>}
            <label className="field"><span>模板名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="例如：民宿精选 Vlog" /></label>
            <label className="field"><span>故事梗概</span><textarea value={outline} onChange={(event) => setOutline(event.target.value)} maxLength={5000} rows={5} placeholder="描述视频的主题、节奏和不能虚构的边界。" /></label>
            <div className="rounded-lg border border-ink/10 bg-white/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-medium">镜头节拍</h3><p className="mt-1 text-xs text-ink/55">每个节拍对应一个镜头职责，生成时会按此顺序组织内容。</p></div><button type="button" onClick={() => setBeats((current) => [...current, emptyBeat()])} className="secondary-button"><Plus size={15} /> 增加镜头</button></div>
              <div className="grid gap-3">
                {beats.map((beat, index) => <div key={`${index}-${beat.name}`} className="rounded border border-ink/10 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-ink/55">镜头 {index + 1}</span>{beats.length > 1 && <button type="button" onClick={() => setBeats((current) => current.filter((_, beatIndex) => beatIndex !== index))} className="icon-button h-8 w-8 text-coral" title="删除镜头"><Trash2 size={14} /></button>}</div>
                  <div className="grid gap-3 md:grid-cols-2"><label className="field"><span>名称</span><input value={beat.name} onChange={(event) => updateBeat(index, { name: event.target.value })} maxLength={100} placeholder="抵达与入口" /></label><label className="field"><span>镜头职责</span><input value={beat.shotDuty} onChange={(event) => updateBeat(index, { shotDuty: event.target.value })} maxLength={500} placeholder="建立到达后的第一印象" /></label></div>
                  <label className="field mt-3"><span>画面指导</span><textarea value={beat.visualGuidance} onChange={(event) => updateBeat(index, { visualGuidance: event.target.value })} maxLength={2000} rows={3} placeholder="镜头应该拍什么，哪些信息不能补写。" /></label>
                  <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink/70"><input type="checkbox" checked={beat.required} onChange={(event) => updateBeat(index, { required: event.target.checked })} /> 必须出现</label>
                </div>)}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2"><label className="field"><span>必须出现的场景（每行一条）</span><textarea value={requiredScenes} onChange={(event) => setRequiredScenes(event.target.value)} maxLength={10000} rows={5} placeholder="门头或入口\n入住空间" /></label><label className="field"><span>音乐标签（逗号分隔）</span><textarea value={musicTags} onChange={(event) => setMusicTags(event.target.value)} maxLength={1000} rows={5} placeholder="轻松，旅行，生活感" /></label></div>
            <label className="field"><span>视角指导</span><textarea value={perspectiveGuidance} onChange={(event) => setPerspectiveGuidance(event.target.value)} maxLength={2000} rows={3} placeholder="例如：游客第一视角，不使用旁白。" /></label>
            <label className="field"><span>画面总指导</span><textarea value={visualGuidance} onChange={(event) => setVisualGuidance(event.target.value)} maxLength={2000} rows={3} placeholder="强调真实素材、空间关系和节奏。" /></label>
            <div className="flex flex-wrap justify-end gap-3 border-t border-ink/10 pt-4"><button type="button" onClick={() => setPage("list")} disabled={saving} className="secondary-button">取消</button><button type="submit" disabled={saving} className="primary-button">{saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} {saving ? "正在保存..." : page === "create" ? "创建模板" : "保存模板修改"}</button></div>
          </form>
        </div>
      </div>
    );
  }

  return <div className="space-y-5">
    <div className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="section-title">精选 Vlog</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">维护本次精选 Vlog 需求使用的共享模板。普通用户只读取这里的模板，不会看到平台配乐管理列表。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void loadTemplates()} disabled={loading} className="secondary-button">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 刷新</button><button type="button" onClick={openCreate} className="primary-button"><FilePlus2 size={17} /> 新建模板</button></div></div></div>
    {error && <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">{error}</div></div>}
    {!loading && !error && !templates.length && <div className="panel"><div className="rounded border border-dashed border-ink/20 bg-white/60 p-10 text-center text-sm text-ink/60">还没有精选 Vlog 模板，点击右上角创建第一个模板。</div></div>}
    {templates.length > 0 && <div className="grid gap-5 lg:grid-cols-2">{templates.map((template) => <article key={template.id} className="panel flex min-h-64 flex-col"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{template.name}</h3><div className="mt-1 text-xs text-ink/40">{template.id} · v{template.version}</div></div><div className="flex gap-2"><button type="button" onClick={() => openEdit(template)} disabled={saving} className="secondary-button"><Pencil size={16} /> 编辑</button><button type="button" onClick={() => void removeTemplate(template)} disabled={saving} className="secondary-button text-coral hover:border-coral/40 hover:bg-coral/5 hover:text-coral"><Trash2 size={16} /> 删除</button></div></div><p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-7 text-ink/70">{template.outline}</p><div className="mt-4 border-t border-ink/10 pt-3 text-xs text-ink/50">{template.beats.length} 个镜头节拍 · {template.musicTags.length ? `音乐：${template.musicTags.join("、")}` : "未指定音乐标签"}{template.updatedAt && <span className="ml-3">更新于 {template.updatedAt}</span>}</div></article>)}</div>}
  </div>;
}
