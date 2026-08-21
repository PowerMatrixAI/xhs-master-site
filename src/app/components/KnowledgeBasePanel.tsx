"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Pencil, RefreshCw, Trash2, Upload, X } from "lucide-react";
import {
  deleteBackendKnowledgeDocument,
  fetchBackendKnowledgeDocuments,
  replaceBackendKnowledgeDocumentFile,
  updateBackendKnowledgeDocument,
  uploadBackendKnowledgeDocumentFile,
  type BackendKnowledgeDocument
} from "@/lib/api";

type KnowledgeBaseAccount = {
  id: number;
  name: string;
};

type FeedbackTone = "success" | "error";

type KnowledgeBasePanelProps = {
  selected?: KnowledgeBaseAccount;
  notify: (message: string, tone: FeedbackTone) => void;
};

type DocumentDraft = {
  title: string;
  description: string;
};

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const INDEXING_STATUSES = new Set(["uploading", "indexing", "parsing", "cleaning", "splitting"]);

function formatDocumentSize(characters: number) {
  return Number.isFinite(characters) ? `${characters.toLocaleString("zh-CN")} 字` : "-";
}

function formatDocumentDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function documentStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "ready") return { label: "已就绪", className: "bg-teal/10 text-teal", icon: <CheckCircle2 size={14} /> };
  if (normalized === "failed") return { label: "索引失败", className: "bg-coral/10 text-coral", icon: <AlertCircle size={14} /> };
  if (normalized === "deleting") return { label: "删除中", className: "bg-amber-50 text-amber-700", icon: <LoaderCircle size={14} className="animate-spin" /> };
  return { label: "索引中", className: "bg-amber-50 text-amber-700", icon: <LoaderCircle size={14} className="animate-spin" /> };
}

async function validateMarkdownFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".md")) {
    throw new Error("知识库只支持 .md Markdown 文件。");
  }
  if (file.size <= 0) {
    throw new Error("不能上传空文件。");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("单个 Markdown 文件不能超过 2 MB。");
  }

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(await file.arrayBuffer());
  } catch {
    throw new Error("文件不是有效的 UTF-8 编码，请另存为 UTF-8 后重试。");
  }
}

export function KnowledgeBasePanel({ selected, notify }: KnowledgeBasePanelProps) {
  const [documents, setDocuments] = useState<BackendKnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [drafts, setDrafts] = useState<Record<number, DocumentDraft>>({});
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const accountId = selected?.id ?? null;
  const hasIndexingDocuments = useMemo(
    () => documents.some((document) => INDEXING_STATUSES.has(document.status.trim().toLowerCase())),
    [documents]
  );

  const loadDocuments = useCallback(async () => {
    if (!accountId) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetchBackendKnowledgeDocuments(accountId);
      setDocuments(response.data || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取知识库文档失败。";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setDocuments([]);
    setDrafts({});
    setUploadFile(null);
    setUploadTitle("");
    setUploadDescription("");
    void loadDocuments();
  }, [accountId, loadDocuments]);

  useEffect(() => {
    if (!hasIndexingDocuments) return;
    const timer = window.setTimeout(() => void loadDocuments(), 5000);
    return () => window.clearTimeout(timer);
  }, [hasIndexingDocuments, loadDocuments]);

  function selectUploadFile(file: File | null) {
    if (!file) return;
    setUploadFile(file);
    if (!uploadTitle.trim()) setUploadTitle(file.name.replace(/\.md$/i, ""));
  }

  async function uploadDocument() {
    if (!accountId || !uploadFile) {
      notify("请先选择要上传的 Markdown 文件。", "error");
      return;
    }
    try {
      await validateMarkdownFile(uploadFile);
      setBusyAction("upload");
      await uploadBackendKnowledgeDocumentFile(accountId, uploadFile, {
        title: uploadTitle.trim(),
        description: uploadDescription.trim()
      });
      setUploadFile(null);
      setUploadTitle("");
      setUploadDescription("");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      await loadDocuments();
      notify("知识库文档已上传，正在等待索引完成。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "上传知识库文档失败。", "error");
    } finally {
      setBusyAction(null);
    }
  }

  function getDraft(document: BackendKnowledgeDocument): DocumentDraft {
    return drafts[document.id] || { title: document.title, description: document.description };
  }

  function beginEdit(document: BackendKnowledgeDocument) {
    setDrafts((current) => ({
      ...current,
      [document.id]: { title: document.title, description: document.description }
    }));
  }

  function updateDraft(documentId: number, field: keyof DocumentDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [documentId]: { ...(current[documentId] || { title: "", description: "" }), [field]: value }
    }));
  }

  async function saveDocument(document: BackendKnowledgeDocument) {
    const draft = getDraft(document);
    if (!draft.title.trim()) {
      notify("文档名称不能为空。", "error");
      return;
    }
    try {
      setBusyAction(`save-${document.id}`);
      const updated = await updateBackendKnowledgeDocument(accountId!, document.id, {
        title: draft.title.trim(),
        description: draft.description.trim()
      });
      setDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
      setDrafts((current) => {
        const next = { ...current };
        delete next[document.id];
        return next;
      });
      notify("文档信息已更新。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "更新知识库文档失败。", "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function replaceDocument(document: BackendKnowledgeDocument, file: File | null) {
    if (!file || !accountId) return;
    try {
      await validateMarkdownFile(file);
      if (!window.confirm(`确定用“${file.name}”替换文档“${document.title}”吗？\n\n新版本索引完成后才会删除旧版本。`)) return;
      const draft = getDraft(document);
      setBusyAction(`replace-${document.id}`);
      const updated = await replaceBackendKnowledgeDocumentFile(accountId, document.id, file, {
        title: draft.title.trim() || document.title,
        description: draft.description.trim()
      });
      setDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
      notify("文档已替换，正在等待新版本索引完成。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "替换知识库文档失败。", "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteDocument(document: BackendKnowledgeDocument) {
    if (!accountId || !window.confirm(`确定删除文档“${document.title}”吗？\n\n删除后不会参与后续知识库检索。`)) return;
    try {
      setBusyAction(`delete-${document.id}`);
      await deleteBackendKnowledgeDocument(accountId, document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      notify("知识库文档已删除。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除知识库文档失败。", "error");
    } finally {
      setBusyAction(null);
    }
  }

  if (!selected) {
    return <div className="mx-auto max-w-[1480px] rounded border border-dashed border-ink/20 bg-white/60 p-8 text-center text-sm text-ink/60">请先选择一个账号，再管理该账号的知识库。</div>;
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5">
      <div className="panel flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-teal" />
            <h2 className="section-title">知识库</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
            当前账号：{selected.name}。上传真实业务资料后，系统会在生成一周计划前按需检索；原始资料不会展示给浏览器端。
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/50">仅支持 UTF-8 `.md` 文件，单个文件不超过 2 MB，单个账号最多 50 份。</p>
        </div>
        <button type="button" className="secondary-button shrink-0" onClick={() => void loadDocuments()} disabled={loading || busyAction !== null}>
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          刷新状态
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="panel">
          <div className="mb-4">
            <h3 className="section-title">上传 Markdown</h3>
            <p className="mt-1 text-sm text-ink/60">首次上传时会自动创建当前账号专属的 Dify 知识库。</p>
          </div>
          <div className="space-y-3">
            <label className="field">
              <span>文件</span>
              <input ref={uploadInputRef} type="file" accept=".md,text/markdown" onChange={(event) => selectUploadFile(event.target.files?.[0] || null)} />
            </label>
            {uploadFile && (
              <div className="flex items-center justify-between gap-3 rounded border border-teal/20 bg-teal/5 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-teal">{uploadFile.name} · {(uploadFile.size / 1024).toFixed(1)} KB</span>
                <button type="button" className="icon-button h-8 w-8 shrink-0" title="移除文件" onClick={() => { setUploadFile(null); if (uploadInputRef.current) uploadInputRef.current.value = ""; }}>
                  <X size={15} />
                </button>
              </div>
            )}
            <label className="field">
              <span>文档名称</span>
              <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：门店招牌菜与服务说明" />
            </label>
            <label className="field">
              <span>说明</span>
              <textarea value={uploadDescription} onChange={(event) => setUploadDescription(event.target.value)} rows={5} placeholder="说明这份资料包含哪些业务事实和适用范围" className="!h-auto resize-y py-3 leading-6" />
            </label>
            <button type="button" className="primary-button w-full justify-center" onClick={() => void uploadDocument()} disabled={busyAction !== null || !uploadFile}>
              {busyAction === "upload" ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
              {busyAction === "upload" ? "正在上传并索引..." : "上传到当前账号知识库"}
            </button>
          </div>
        </section>

        <section className="panel min-w-0">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="section-title">文档与索引状态</h3>
              <p className="mt-1 text-sm text-ink/60">索引完成后才会参与后续检索；失败原因会显示在对应文档下方。</p>
            </div>
            <span className="shrink-0 rounded bg-ink/5 px-2.5 py-1 text-xs text-ink/55">{documents.length} / 50</span>
          </div>
          {loadError && (
            <div className="mb-3 flex items-start gap-2 rounded border border-coral/25 bg-coral/5 p-3 text-sm text-coral">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}
          {loading && !documents.length ? (
            <div className="flex items-center justify-center gap-2 rounded border border-dashed border-ink/15 bg-ink/5 p-8 text-sm text-ink/55"><LoaderCircle size={17} className="animate-spin" />正在加载文档...</div>
          ) : documents.length ? (
            <div className="space-y-3">
              {documents.map((document) => {
                const status = documentStatus(document.status);
                const draft = drafts[document.id];
                const isBusy = busyAction?.endsWith(`-${document.id}`) || false;
                return (
                  <article key={document.id} className="rounded border border-ink/10 bg-white p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        {draft ? (
                          <div className="grid gap-2">
                            <input value={draft.title} onChange={(event) => updateDraft(document.id, "title", event.target.value)} className="h-10 rounded border border-ink/15 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/15" aria-label="文档名称" />
                            <textarea value={draft.description} onChange={(event) => updateDraft(document.id, "description", event.target.value)} rows={2} className="rounded border border-ink/15 px-3 py-2 text-sm leading-6 outline-none focus:border-teal focus:ring-2 focus:ring-teal/15" aria-label="文档说明" />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate font-medium">{document.title || document.originalFilename}</h4>
                              <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${status.className}`}>{status.icon}{status.label}</span>
                            </div>
                            <p className="mt-1 text-xs text-ink/50">原文件：{document.originalFilename}</p>
                            {document.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65">{document.description}</p>}
                          </>
                        )}
                        {document.status.toLowerCase() === "failed" && document.errorMessage && (
                          <div className="mt-2 rounded bg-coral/5 px-3 py-2 text-xs leading-5 text-coral">索引失败原因：{document.errorMessage}</div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50">
                          <span>{formatDocumentSize(document.contentChars)}</span>
                          <span>更新于 {formatDocumentDate(document.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        {draft ? (
                          <>
                            <button type="button" className="secondary-button h-9 px-3" onClick={() => void saveDocument(document)} disabled={isBusy}><CheckCircle2 size={15} />保存</button>
                            <button type="button" className="icon-button h-9 w-9" title="取消编辑" onClick={() => setDrafts((current) => { const next = { ...current }; delete next[document.id]; return next; })} disabled={isBusy}><X size={15} /></button>
                          </>
                        ) : (
                          <button type="button" className="secondary-button h-9 px-3" onClick={() => beginEdit(document)} disabled={busyAction !== null}><Pencil size={15} />编辑信息</button>
                        )}
                        <label className="secondary-button h-9 cursor-pointer px-3">
                          {isBusy && busyAction === `replace-${document.id}` ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}
                          替换文件
                          <input type="file" accept=".md,text/markdown" className="hidden" disabled={busyAction !== null} onChange={(event) => { const file = event.target.files?.[0] || null; event.currentTarget.value = ""; void replaceDocument(document, file); }} />
                        </label>
                        <button type="button" className="inline-flex h-9 items-center gap-2 rounded border border-coral/30 bg-white px-3 text-sm font-medium text-coral transition hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void deleteDocument(document)} disabled={busyAction !== null}><Trash2 size={15} />删除</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded border border-dashed border-ink/20 bg-ink/5 p-8 text-center text-sm text-ink/55">当前账号还没有知识库文档，先上传一份 UTF-8 Markdown 资料。</div>
          )}
        </section>
      </div>
    </div>
  );
}
