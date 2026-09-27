"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Music2, Pencil, RefreshCw, Save, ShieldCheck, Upload, X } from "lucide-react";
import { isPlatformAdmin, type LoginResponse } from "@/lib/api";
import { fetchPlatformMusic, updatePlatformMusic, uploadPlatformMusic, type PlatformMusic } from "@/lib/featuredVlog";

type FeedbackTone = "success" | "error";

export function PlatformMusicLibraryPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: FeedbackTone) => void;
}) {
  const [musics, setMusics] = useState<PlatformMusic[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [authorizationNote, setAuthorizationNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const admin = isPlatformAdmin(currentUser);

  const loadMusic = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setMusics(await fetchPlatformMusic());
    } catch (loadError) {
      setMusics([]);
      setError(loadError instanceof Error ? loadError.message : "获取平台配乐失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMusic();
  }, [loadMusic]);

  function resetUpload() {
    setName("");
    setTags("");
    setAuthorizationNote("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin) {
      notify("仅平台管理员可以上传平台配乐。", "error");
      return;
    }
    if (!name.trim() || !file) {
      notify("请填写配乐名称并选择文件。", "error");
      return;
    }
    setUploading(true);
    try {
      await uploadPlatformMusic({ name: name.trim(), tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), authorizationNote: authorizationNote.trim(), file });
      resetUpload();
      await loadMusic();
      notify("平台配乐已上传。", "success");
    } catch (uploadError) {
      notify(uploadError instanceof Error ? uploadError.message : "上传平台配乐失败。", "error");
    } finally {
      setUploading(false);
    }
  }

  function beginEdit(music: PlatformMusic) {
    setEditingId(music.id);
  }

  async function saveMusic(event: React.FormEvent<HTMLFormElement>, music: PlatformMusic) {
    event.preventDefault();
    setSavingId(music.id);
    try {
      const form = new FormData(event.currentTarget);
      const saved = await updatePlatformMusic({
        id: music.id,
        name: String(form.get("name") || "").trim(),
        tags: String(form.get("tags") || "").split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
        authorizationState: String(form.get("authorizationState") || "unavailable"),
        authorizationNote: String(form.get("authorizationNote") || "").trim()
      });
      setMusics((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditingId(null);
      notify("平台配乐信息已保存。", "success");
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "保存平台配乐失败。", "error");
    } finally {
      setSavingId(null);
    }
  }

  if (!admin) return <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">当前账号没有平台配乐管理权限。</div></div>;

  return <div className="space-y-5">
    <div className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="section-title">平台配乐</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台管理</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">上传后配乐只会通过候选接口参与精选 Vlog 生成。普通用户不会直接读取这份管理列表。</p></div><button type="button" onClick={() => void loadMusic()} disabled={loading} className="secondary-button">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 刷新列表</button></div></div>
    <div className="panel"><div className="mb-4 flex items-center gap-2"><Music2 size={20} className="text-teal" /><h3 className="font-semibold">上传平台配乐</h3></div><form onSubmit={submitUpload} className="grid gap-4 md:grid-cols-2"><label className="field"><span>配乐名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="例如：轻快旅途" /></label><label className="field"><span>标签（逗号分隔）</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="旅行，轻松，生活感" /></label><label className="field md:col-span-2"><span>授权备注（可选）</span><textarea value={authorizationNote} onChange={(event) => setAuthorizationNote(event.target.value)} maxLength={1000} rows={3} placeholder="记录授权来源或内部备注。" /></label><label className="field md:col-span-2"><span>音频文件</span><input ref={fileInputRef} type="file" accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><div className="flex items-center justify-between gap-3 md:col-span-2">{file ? <span className="text-xs text-ink/55">已选择：{file.name}（{Math.ceil(file.size / 1024)} KB）</span> : <span className="text-xs text-ink/45">支持 MP3、M4A、WAV，大小限制由服务端执行。</span>}<button type="submit" disabled={uploading} className="primary-button">{uploading ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />} {uploading ? "正在上传..." : "上传配乐"}</button></div></form></div>
    {error && <div className="panel"><div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">{error}</div></div>}
    <div className="panel"><div className="mb-4 flex items-center justify-between"><div><h3 className="section-title">已上传配乐</h3><p className="mt-1 text-sm text-ink/60">共 {musics.length} 条</p></div></div>{loading ? <div className="py-10 text-center text-sm text-ink/55">正在读取平台配乐...</div> : musics.length ? <div className="grid gap-3">{musics.map((music) => editingId === music.id ? <form key={music.id} onSubmit={(event) => void saveMusic(event, music)} className="rounded-lg border border-teal/25 bg-teal/5 p-4"><div className="grid gap-3 md:grid-cols-2"><label className="field"><span>名称</span><input name="name" defaultValue={music.name} maxLength={100} /></label><label className="field"><span>标签</span><input name="tags" defaultValue={music.tags.join(", ")} /></label><label className="field"><span>授权状态</span><select name="authorizationState" defaultValue={music.authorizationState}><option value="available">可用</option><option value="unavailable">不可用</option></select></label><label className="field"><span>授权备注</span><input name="authorizationNote" defaultValue={music.authorizationNote} maxLength={1000} /></label></div><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditingId(null)} className="secondary-button"><X size={15} /> 取消</button><button type="submit" disabled={savingId === music.id} className="primary-button">{savingId === music.id ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} 保存</button></div></form> : <article key={music.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-ink/10 bg-white/70 p-4"><audio controls preload="none" src={music.audioUrl} className="h-9 min-w-[220px]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium">{music.name}</h4><span className={`rounded px-2 py-1 text-xs ${music.authorizationState === "available" ? "bg-teal/10 text-teal" : "bg-ink/10 text-ink/55"}`}>{music.authorizationState === "available" ? <><Check size={12} className="mr-1 inline" />可用</> : "未授权"}</span></div><p className="mt-1 text-xs text-ink/55">{music.tags.length ? music.tags.join("、") : "暂无标签"} · {music.mimeType || "音频"} · {music.sizeBytes ? `${Math.ceil(music.sizeBytes / 1024)} KB` : "大小未知"}</p>{music.authorizationNote && <p className="mt-1 text-xs text-ink/45">备注：{music.authorizationNote}</p>}</div><button type="button" onClick={() => beginEdit(music)} className="secondary-button"><Pencil size={15} /> 编辑</button></article>)}</div> : <div className="rounded border border-dashed border-ink/20 bg-white/60 p-10 text-center text-sm text-ink/60">还没有平台配乐，请先上传。</div>}</div>
  </div>;
}
