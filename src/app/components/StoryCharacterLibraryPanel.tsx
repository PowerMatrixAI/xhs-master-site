"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, LoaderCircle, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import {
  fetchBackendStoryCharacterTemplates,
  fetchBackendStoryCharacters,
  isPlatformAdmin,
  uploadBackendStoryCharacter,
  type LoginResponse
} from "@/lib/api";
import type { StoryCharacter, StoryCharacterTemplate } from "@/lib/storyCharacters";
import { StoryTemplateManagementPanel } from "@/app/components/StoryTemplateManagementPanel";

type FeedbackTone = "success" | "error";

export function StoryCharacterLibraryPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: FeedbackTone) => void;
}) {
  const [section, setSection] = useState<"characters" | "templates">("characters");
  const [templatePage, setTemplatePage] = useState<"list" | "create">("list");
  const [templates, setTemplates] = useState<StoryCharacterTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [characters, setCharacters] = useState<StoryCharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const admin = isPlatformAdmin(currentUser);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError("");
    try {
      const nextTemplates = await fetchBackendStoryCharacterTemplates();
      setTemplates(nextTemplates);
      setTemplateId((currentTemplateId) => nextTemplates.some((template) => template.id === currentTemplateId)
        ? currentTemplateId
        : nextTemplates[0]?.id || "");
    } catch (loadError) {
      setTemplates([]);
      setTemplateId("");
      setTemplatesError(loadError instanceof Error ? loadError.message : "获取故事模板失败。");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const loadCharacters = useCallback(async () => {
    if (!templateId) {
      setCharacters([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setCharacters(await fetchBackendStoryCharacters(templateId));
    } catch (loadError) {
      setCharacters([]);
      setError(loadError instanceof Error ? loadError.message : "获取平台角色库失败。");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  function chooseFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(nextFile.type)) {
      notify("角色图片必须是 PNG、JPEG 或 WebP。", "error");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      notify("角色图片不能超过 10 MB。", "error");
      return;
    }
    setFile(nextFile);
  }

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin) {
      notify("仅平台管理员可以上传故事角色。", "error");
      return;
    }
    if (!name.trim() || !description.trim() || !file) {
      notify("请填写角色名称、外观描述并选择图片。", "error");
      return;
    }
    setUploading(true);
    try {
      await uploadBackendStoryCharacter(templateId, name.trim(), description.trim(), file);
      setName("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadCharacters();
      notify("平台角色已上传。", "success");
    } catch (uploadError) {
      notify(uploadError instanceof Error ? uploadError.message : "上传故事角色失败。", "error");
    } finally {
      setUploading(false);
    }
  }

  if (section === "templates") {
    return <StoryTemplateManagementPanel currentUser={currentUser} notify={notify} initialPage={templatePage} onBackToLibrary={() => setSection("characters")} />;
  }

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="section-title">平台素材库</h2>
              <span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal"><ShieldCheck size={14} /> 平台共享</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">管理创意故事视频的主角形象。角色属于平台资源，不绑定客户账号；普通用户可以在故事视频中选择，只有平台管理员可以上传。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin && <>
              <button type="button" onClick={() => { setTemplatePage("list"); setSection("templates"); }} className="secondary-button"><FileText size={16} /> 故事模板</button>
              <button type="button" onClick={() => { setTemplatePage("create"); setSection("templates"); }} className="primary-button"><FileText size={16} /> 新建故事模板</button>
            </>}
            <button type="button" onClick={() => { void loadTemplates(); void loadCharacters(); }} disabled={loading || templatesLoading} className="secondary-button">
              {loading || templatesLoading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 刷新模板和角色
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="panel">
          <h3 className="section-title">选择故事模板</h3>
          <p className="mt-1 text-sm text-ink/60">切换模板后只展示该模板的角色。</p>
          <label className="field mt-4">
            <span>故事模板</span>
            <select disabled={templatesLoading || !templates.length} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          {templatesLoading && <p className="mt-2 text-xs text-ink/55">正在读取服务端故事模板...</p>}
          {templatesError && <div className="mt-3 rounded border border-coral/25 bg-coral/5 p-3 text-sm text-coral">{templatesError}</div>}
          {!templatesLoading && !templatesError && !templates.length && <div className="mt-3 rounded border border-dashed border-ink/20 bg-white/60 p-3 text-sm leading-6 text-ink/60">平台还没有故事模板，请先创建一个模板。</div>}

          {admin ? (
            <form onSubmit={submitUpload} className="mt-5 border-t border-ink/10 pt-5">
              <div className="mb-3">
                <h3 className="section-title">上传平台角色</h3>
                <p className="mt-1 text-xs leading-5 text-ink/55">每次上传都会新增一条角色记录，不会覆盖已有角色。名称和描述会进入故事生成 Prompt。</p>
              </div>
              <div className="grid gap-3">
                <label className="field"><span>角色名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="例如：橘白猫邮差" /></label>
                <label className="field"><span>外观描述</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={5} placeholder="例如：橘白短毛，绿色邮差挎包。" /></label>
                <label className="field"><span>角色图片</span><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={(event) => chooseFile(event.target.files?.[0] || null)} /></label>
              </div>
              {file && <div className="mt-2 rounded bg-ink/5 px-3 py-2 text-xs text-ink/60">已选择：{file.name}（{Math.ceil(file.size / 1024)} KB）</div>}
              <button type="submit" disabled={uploading || loading} className="primary-button mt-4 w-full">
                {uploading ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />} {uploading ? "正在上传..." : "上传到平台素材库"}
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded border border-ink/10 bg-ink/5 p-3 text-sm leading-6 text-ink/60">当前账号可以查看和使用平台角色，但没有上传权限。</div>
          )}
        </div>

        <div className="panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">{templates.find((template) => template.id === templateId)?.name || "故事模板"} · 角色列表</h3>
              <p className="mt-1 text-sm text-ink/60">{loading ? "正在读取服务端角色列表..." : `共 ${characters.length} 个角色`}</p>
            </div>
            <ImagePlus size={22} className="text-teal" />
          </div>
          {error ? (
            <div className="rounded border border-coral/25 bg-coral/5 p-4 text-sm text-coral">{error}</div>
          ) : characters.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {characters.map((character) => (
                <article key={character.id} className="overflow-hidden rounded border border-ink/10 bg-white">
                  <img src={character.imageUrl} alt={character.name} className="aspect-square w-full object-contain" />
                  <div className="p-3">
                    <div className="font-medium">{character.name}</div>
                    <p className="mt-1 min-h-10 text-xs leading-5 text-ink/60">{character.description}</p>
                    {character.createdAt && <div className="mt-2 text-[11px] text-ink/40">上传于 {character.createdAt}</div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-ink/20 bg-white/60 p-10 text-center text-sm text-ink/60">当前模板还没有角色。平台管理员可在左侧上传。</div>
          )}
        </div>
      </div>
    </div>
  );
}
