"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { isPlatformAdmin, type LoginResponse } from "@/lib/api";
import { createReferenceVideo, deleteReferenceVideo, fetchReferenceVideos, updateReferenceVideo, uploadReferenceVideo, type ReferenceVideo } from "@/lib/referenceVideos";
import { ReferenceVideoPreview } from "@/app/components/ReferenceVideoPreview";

export function ReferenceVideoManagementPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: "success" | "error") => void;
}) {
  const admin = isPlatformAdmin(currentUser);
  const [videos, setVideos] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<ReferenceVideo | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"upload" | "url">("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formRevision, setFormRevision] = useState(0);

  const load = useCallback(async () => {
    if (!admin) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try { setVideos(await fetchReferenceVideos()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "读取参考视频失败。"); }
    finally { setLoading(false); }
  }, [admin]);

  useEffect(() => { void load(); }, [load]);

  function openForm(video?: ReferenceVideo) {
    setFormRevision((current) => current + 1);
    setSelected(video || null);
    setName(video?.name || "");
    setDescription(video?.description || "");
    setSource(video?.sourceType || "upload");
    setVideoUrl(video?.sourceType === "url" ? video.videoUrl : "");
    setFile(null);
    setFormOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { notify("请填写参考视频名称。", "error"); return; }
    if (source === "upload" && !file && selected?.sourceType !== "upload") { notify("请选择要上传的视频。", "error"); return; }
    if (source === "url" && !videoUrl.trim()) { notify("请填写可直接播放的视频链接。", "error"); return; }
    setSaving(true);
    try {
      const details = { name: name.trim(), description: description.trim() };
      let saved: ReferenceVideo;
      if (source === "upload" && file) {
        saved = await uploadReferenceVideo({ ...details, file, ...(selected ? { id: selected.id, version: selected.version } : {}) });
      } else if (selected) {
        saved = await updateReferenceVideo({ ...details, id: selected.id, version: selected.version, ...(source === "url" ? { videoUrl: videoUrl.trim() } : {}) });
      } else {
        saved = await createReferenceVideo({ ...details, videoUrl: videoUrl.trim() });
      }
      setVideos((current) => selected ? current.map((video) => video.id === saved.id ? saved : video) : [saved, ...current]);
      setFormOpen(false);
      setFile(null);
      notify(selected ? "参考视频已修改。" : "参考视频已新增，可在精选 Vlog 模板中选择。", "success");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "保存参考视频失败。", "error"); }
    finally { setSaving(false); }
  }

  async function remove(video: ReferenceVideo) {
    if (!window.confirm(`确定删除参考视频「${video.name}」吗？关联模板会解除引用，模板本身保留；上传的文件也会移除。`)) return;
    setSaving(true);
    try {
      await deleteReferenceVideo(video);
      setVideos((current) => current.filter((item) => item.id !== video.id));
      if (selected?.id === video.id) setFormOpen(false);
      notify("参考视频已删除，关联模板已解除引用。", "success");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "删除参考视频失败。", "error"); }
    finally { setSaving(false); }
  }

  if (!admin) return <div className="panel text-sm text-coral">当前账号没有平台管理权限。</div>;

  return <div className="space-y-5">
    <div className="panel flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-2"><h2 className="section-title">参考视频</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal"><ShieldCheck size={14} /> 平台管理</span></div><p className="mt-2 text-sm leading-6 text-ink/60">维护供精选 Vlog 模板选择的参考视频，可上传文件或登记视频直链。</p></div>
      <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={loading || saving} className="secondary-button"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新</button><button type="button" onClick={() => openForm()} disabled={saving} className="primary-button"><Plus size={16} /> 新增参考视频</button></div>
    </div>
    {formOpen && <form onSubmit={submit} className="panel space-y-4">
      <div className="flex items-center justify-between gap-3"><h3 className="section-title">{selected ? "编辑参考视频" : "新增参考视频"}</h3><button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="secondary-button"><X size={15} /> 取消</button></div>
      <fieldset key={formRevision} disabled={saving} className="space-y-4">
        <label className="field"><span>视频名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="例如：林间民宿体验参考" /></label>
        <label className="field"><span>参考说明（可选）</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={2000} placeholder="说明希望参考的节奏、构图、运镜或叙事方式。" /></label>
        <div className="flex flex-wrap gap-4 text-sm"><label className="inline-flex items-center gap-2"><input type="radio" name="referenceVideoSource" checked={source === "upload"} onChange={() => setSource("upload")} /> 上传视频</label><label className="inline-flex items-center gap-2"><input type="radio" name="referenceVideoSource" checked={source === "url"} onChange={() => setSource("url")} /> 视频链接</label></div>
        {source === "upload" ? <label className="field"><span>{selected?.sourceType === "upload" ? "替换视频文件（不选则保留原文件）" : "选择视频文件"}</span><input key={`${selected?.id || "new"}-${formOpen}`} type="file" accept=".mp4,.m4v,.mov,.webm,video/mp4,video/webm,video/quicktime" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); if (next && !name.trim()) setName(next.name.replace(/\.[^.]+$/, "")); }} /><span className="text-xs text-ink/50">支持 MP4、M4V、MOV、WebM，单个文件不超过200MB；推荐使用 MP4。</span>{file && <span className="text-xs text-teal">已选择：{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>}</label> : <label className="field"><span>视频直链</span><input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} maxLength={2000} required placeholder="https://example.com/reference.mp4" /><span className="text-xs text-ink/50">填写可直接播放的 HTTP/HTTPS 视频地址；分享页链接无法直接预览。</span></label>}
        {selected && <ReferenceVideoPreview video={selected} />}
        <div className="flex justify-end"><button type="submit" disabled={saving} className="primary-button">{saving ? <LoaderCircle size={16} className="animate-spin" /> : source === "upload" && file ? <Upload size={16} /> : <Save size={16} />}{saving ? "正在保存..." : selected ? "保存修改" : "新增参考视频"}</button></div>
      </fieldset>
    </form>}
    {error && <div role="alert" className="panel text-sm text-coral">{error}</div>}
    {loading && !videos.length && <div className="panel flex items-center gap-2 text-sm text-ink/55"><LoaderCircle size={16} className="animate-spin" /> 正在读取参考视频...</div>}
    {!loading && !error && !videos.length && <div className="panel text-center text-sm text-ink/55">还没有参考视频，点击“新增参考视频”上传或登记链接。</div>}
    <div className="grid gap-5 lg:grid-cols-2">{videos.map((video) => <article key={video.id} className="panel space-y-3">
      <ReferenceVideoPreview video={video} />
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink/45">{video.sourceType === "upload" ? `上传文件 · ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "外部视频链接"}{video.updatedAt ? ` · 更新于 ${video.updatedAt}` : ""}</p><div className="flex gap-2"><button type="button" onClick={() => openForm(video)} disabled={saving} className="secondary-button"><Pencil size={15} /> 编辑</button><button type="button" onClick={() => void remove(video)} disabled={saving} className="secondary-button text-coral"><Trash2 size={15} /> 删除</button></div></div>
    </article>)}</div>
  </div>;
}
