"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FilePlus2, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  createFeaturedVlogTemplate,
  deleteFeaturedVlogTemplate,
  fetchFeaturedVlogTemplates,
  type FeaturedVlogTemplateInput,
  type FeaturedVlogTemplate,
  updateFeaturedVlogTemplate
} from "@/lib/featuredVlog";
import { isPlatformAdmin, type LoginResponse } from "@/lib/api";
import { fetchReferenceVideos, type ReferenceVideo } from "@/lib/referenceVideos";
import { ReferenceVideoPreview } from "@/app/components/ReferenceVideoPreview";
import { VLOG_REFERENCE_STYLE_RULE } from "@/lib/featuredVlogTemplateRules";

type FeedbackTone = "success" | "error";
type PageMode = "list" | "create" | "edit";

type TemplateBeat = FeaturedVlogTemplateInput["beats"][number];
const emptyBeat = (): TemplateBeat => ({ name: "", shotDuty: "", required: false });

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
  const [beats, setBeats] = useState<TemplateBeat[]>([emptyBeat()]);
  const [perspectiveGuidance, setPerspectiveGuidance] = useState("");
  const [visualGuidance, setVisualGuidance] = useState("");
  const [musicTags, setMusicTags] = useState("");
  const [referenceVideos, setReferenceVideos] = useState<ReferenceVideo[]>([]);
  const [referenceVideoId, setReferenceVideoId] = useState("");
  const [referenceVideosLoading, setReferenceVideosLoading] = useState(false);
  const [referenceVideosError, setReferenceVideosError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const admin = isPlatformAdmin(currentUser);

  const loadReferenceVideos = useCallback(async () => {
    if (!admin) return;
    setReferenceVideosLoading(true);
    setReferenceVideosError("");
    try { setReferenceVideos(await fetchReferenceVideos()); }
    catch (cause) { setReferenceVideosError(cause instanceof Error ? cause.message : "获取参考视频失败。"); }
    finally { setReferenceVideosLoading(false); }
  }, [admin]);

  useEffect(() => { void loadReferenceVideos(); }, [loadReferenceVideos]);

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
    setPerspectiveGuidance("");
    setVisualGuidance("");
    setMusicTags("");
    setReferenceVideoId("");
    void loadReferenceVideos();
    setPage("create");
  }

  function openEdit(template: FeaturedVlogTemplate) {
    setSelected(template);
    setName(template.name);
    setOutline(template.outline);
    setBeats(template.beats.length ? template.beats.map(b => ({ name: b.name, shotDuty: b.shotDuty, required: b.required })) : [emptyBeat()]);
    setPerspectiveGuidance(template.perspectiveGuidance);
    setVisualGuidance(template.visualGuidance);
    setMusicTags(template.musicTags.join(", "));
    setReferenceVideoId(template.referenceVideoId ? String(template.referenceVideoId) : "");
    void loadReferenceVideos();
    setPage("edit");
  }

  function updateBeat(index: number, patch: Partial<TemplateBeat>) {
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
      required: beat.required
    }));
    if (!name.trim() || !outline.trim() || normalizedBeats.some((beat) => !beat.name || !beat.shotDuty)) {
      notify("请填写模板名称、视频主题与整体主线，以及每个镜头的名称和主要内容。", "error");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        outline: outline.trim(),
        beats: normalizedBeats,
        perspectiveGuidance: perspectiveGuidance.trim(),
        visualGuidance: visualGuidance.trim(),
        musicTags: splitTags(musicTags),
        referenceVideoId: referenceVideoId ? Number(referenceVideoId) : 0
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
          <button type="button" onClick={() => setPage("list")} disabled={saving} className="secondary-button mb-5"><ArrowLeft size={16} /> 返回精选Vlog模版</button>
          <div className="flex items-center gap-2"><h2 className="section-title">{page === "create" ? "新建精选Vlog模版" : "编辑精选Vlog模版"}</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">模板保存后会成为所有用户生成精选 Vlog 时可选的服务端模板。</p>
        </div>
        <div className="panel">
          <form onSubmit={submit} className="grid gap-4">
            {page === "edit" && <label className="field"><span>模板标识 / 版本</span><input value={`${selected?.id || ""} / v${selected?.version || 0}`} readOnly className="bg-ink/5" /></label>}
            <label className="field"><span>模板名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="例如：民宿精选 Vlog" /></label>
            <label className="field"><span>视频主题与整体主线</span><textarea value={outline} onChange={(event) => setOutline(event.target.value)} maxLength={5000} rows={5} placeholder="观众看完应该理解什么？说明内容如何推进、情绪如何变化，以及结尾回应什么。" /></label>
            {selected && (selected.requiredScenes.length > 0 || selected.beats.some(b => b.visualGuidance.trim())) && <p className="rounded border border-ink/10 bg-ink/5 p-3 text-xs leading-5 text-ink/60">旧版逐镜画面指导和必须出现场景已停用，不参与新脚本生成。保存时会清空这些旧字段；重要叙事要求请补充到“主要内容”或整体主线中。</p>}
            <div className="space-y-3 rounded-lg border border-ink/10 p-4">
              <label className="field"><span>参考视频（Omni 制作需关联）</span><select value={referenceVideoId} onChange={(event) => setReferenceVideoId(event.target.value)} disabled={saving || referenceVideosLoading}><option value="">暂不关联（制作前需补充）</option>{referenceVideos.map((video) => <option key={video.id} value={video.id}>{video.name}</option>)}{referenceVideoId && !referenceVideos.some((video) => String(video.id) === referenceVideoId) && <option value={referenceVideoId}>{selected?.referenceVideo?.name || "原关联视频暂不可用，请刷新或取消关联"}</option>}</select></label>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55"><span>{referenceVideosLoading ? "正在读取参考视频..." : "由“平台管理 → 参考视频”维护，模板可先保存，Omni 制作前须完成关联。"}</span><button type="button" disabled={saving || referenceVideosLoading} onClick={() => void loadReferenceVideos()} className="inline-flex items-center gap-1 text-teal hover:underline"><RefreshCw size={12} /> 刷新列表</button></div>
              <p className="text-xs leading-5 text-ink/60">{VLOG_REFERENCE_STYLE_RULE} 制作时最多使用前 10 秒，请确保该片段能体现目标风格。</p>
              {referenceVideosError && <p role="alert" className="text-xs text-coral">{referenceVideosError}</p>}
              {(() => { const video = referenceVideos.find((item) => String(item.id) === referenceVideoId) || (String(selected?.referenceVideo?.id) === referenceVideoId ? selected?.referenceVideo : null); return video ? <ReferenceVideoPreview video={video} /> : null; })()}
            </div>
            <div className="rounded-lg border border-ink/10 bg-white/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-medium">镜头内容</h3><p className="mt-1 text-xs leading-5 text-ink/55">按顺序写观看重点、希望呈现的内容及其与主题的关系，不只列素材名称。具体机位、路径和运动幅度由实际图片决定；仅勾选必须保留的核心内容。</p></div><button type="button" onClick={() => setBeats((current) => [...current, emptyBeat()])} className="secondary-button"><Plus size={15} /> 增加镜头</button></div>
              <div className="grid gap-3">
                {beats.map((beat, index) => <div key={index} className="rounded border border-ink/10 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-ink/55">镜头 {index + 1}</span>{beats.length > 1 && <button type="button" onClick={() => setBeats((current) => current.filter((_, beatIndex) => beatIndex !== index))} className="icon-button h-8 w-8 text-coral" title="删除镜头"><Trash2 size={14} /></button>}</div>
                  <label className="field"><span>名称</span><input value={beat.name} onChange={(event) => updateBeat(index, { name: event.target.value })} maxLength={100} placeholder="抵达与发现" /></label>
                  <label className="field mt-3"><span>主要内容</span><textarea value={beat.shotDuty} onChange={(event) => updateBeat(index, { shotDuty: event.target.value })} maxLength={500} rows={3} placeholder="例如：展现民宿与自然环境的关系，让观众理解住在这里可以获得什么体验。" /></label>
                  <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink/70"><input type="checkbox" checked={beat.required} onChange={(event) => updateBeat(index, { required: event.target.checked })} /> 必须保留这一主要内容</label>
                </div>)}
              </div>
            </div>
            <label className="field"><span>音乐标签（逗号分隔）</span><textarea value={musicTags} onChange={(event) => setMusicTags(event.target.value)} maxLength={1000} rows={3} placeholder="轻松，旅行，生活感" /></label>
            <label className="field"><span>视角指导</span><textarea value={perspectiveGuidance} onChange={(event) => setPerspectiveGuidance(event.target.value)} maxLength={2000} rows={3} placeholder="说明主要叙事视角，如以第三人称观察为主，必要时结合主观体验。" /><span className="text-xs text-ink/50">描述叙事方式，不预设每镜机位，也不默认所有镜头只能背影或同一景别。</span></label>
            <label className="field"><span>画面总指导</span><textarea value={visualGuidance} onChange={(event) => setVisualGuidance(event.target.value)} maxLength={2000} rows={3} placeholder="说明整片的摄影质感、景别变化和情绪节奏，具体运镜依据实际场景设计。" /><span className="text-xs text-ink/50">不预设每镜的机位、路径或运动幅度；模板表达主要内容，实际图片决定可执行的拍摄方式。</span></label>
            <div className="flex flex-wrap justify-end gap-3 border-t border-ink/10 pt-4"><button type="button" onClick={() => setPage("list")} disabled={saving} className="secondary-button">取消</button><button type="submit" disabled={saving} className="primary-button">{saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} {saving ? "正在保存..." : page === "create" ? "创建模板" : "保存模板修改"}</button></div>
          </form>
        </div>
      </div>
    );
  }

  return <div className="space-y-5">
    <div className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="section-title">精选Vlog模版</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">维护平台共享的精选 Vlog 视频模版，供所有用户生成任务时选择。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void loadTemplates()} disabled={loading} className="secondary-button">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 刷新</button><button type="button" onClick={openCreate} className="primary-button"><FilePlus2 size={17} /> 新建模板</button></div></div></div>
    {error && <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">{error}</div></div>}
    {!loading && !error && !templates.length && <div className="panel"><div className="rounded border border-dashed border-ink/20 bg-white/60 p-10 text-center text-sm text-ink/60">还没有精选 Vlog 模板，点击右上角创建第一个模板。</div></div>}
    {templates.length > 0 && <div className="grid gap-5 lg:grid-cols-2">{templates.map((template) => <article key={template.id} className="panel flex min-h-64 flex-col"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{template.name}</h3><div className="mt-1 text-xs text-ink/40">{template.id} · v{template.version}</div></div><div className="flex gap-2"><button type="button" onClick={() => openEdit(template)} disabled={saving} className="secondary-button"><Pencil size={16} /> 编辑</button><button type="button" onClick={() => void removeTemplate(template)} disabled={saving} className="secondary-button text-coral hover:border-coral/40 hover:bg-coral/5 hover:text-coral"><Trash2 size={16} /> 删除</button></div></div><p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-7 text-ink/70">{template.outline}</p><div className="mt-4 border-t border-ink/10 pt-3 text-xs text-ink/50">{template.beats.length} 个镜头节拍 · {template.musicTags.length ? `音乐：${template.musicTags.join("、")}` : "未指定音乐标签"}{template.updatedAt && <span className="ml-3">更新于 {template.updatedAt}</span>}</div></article>)}</div>}
  </div>;
}
