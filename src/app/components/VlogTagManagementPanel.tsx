"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, Layers3, LoaderCircle, Pencil, Plus, RefreshCw, Save, Search, ShieldCheck, Tags, Trash2, X } from "lucide-react";
import { isPlatformAdmin, type LoginResponse } from "@/lib/api";
import type { VlogTagCatalog, VlogTagDimension, VlogTemplateTag } from "@/lib/featuredVlogTags";
import { createVlogTag, createVlogTagDimension, deleteVlogTag, deleteVlogTagDimension, fetchVlogTagCatalog, updateVlogTag, updateVlogTagDimension } from "@/lib/vlogTagCatalog";

type Form = { kind: "dimension"; item?: VlogTagDimension } | { kind: "tag"; item?: VlogTemplateTag };
type Scope = "all" | "unassigned" | number;

function CatalogDialog({ title, context, busy, onClose, children }: {
  title: string;
  context: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLInputElement>('input[name="catalogName"]')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} aria-modal="true" aria-labelledby="vlog-catalog-dialog-title" aria-describedby="vlog-catalog-dialog-context"
    className="fixed inset-0 !m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-ink/10 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/45"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="flex items-start justify-between gap-4 border-b border-ink/10 p-5">
      <div><h3 id="vlog-catalog-dialog-title" className="text-lg font-semibold">{title}</h3><p id="vlog-catalog-dialog-context" className="mt-1 text-sm text-ink/55">{context}</p></div>
      <button type="button" disabled={busy} onClick={onClose} className="icon-button shrink-0" aria-label="关闭编辑"><X size={16} /></button>
    </div>
    {children}
  </dialog>;
}

export function VlogTagManagementPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: "success" | "error") => void;
}) {
  const admin = isPlatformAdmin(currentUser);
  const [catalog, setCatalog] = useState<VlogTagCatalog>({ dimensions: [], unassignedTags: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [dimensionSearch, setDimensionSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [dimensionId, setDimensionId] = useState("");

  const load = useCallback(async () => {
    if (!admin) { setLoading(false); return null; }
    setLoading(true); setError("");
    try {
      const next = await fetchVlogTagCatalog();
      setCatalog(next);
      return next;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取标签设置失败。"); return null; }
    finally { setLoading(false); }
  }, [admin]);
  useEffect(() => { void load(); }, [load]);

  const activeDimension = catalog.dimensions.find((item) => item.id === scope);
  const activeScope: Scope = typeof scope === "number" && !activeDimension ? "all" : scope;
  const scopeName = activeDimension?.name || (activeScope === "unassigned" ? "未分类" : "全部标签");
  const allTags = [...catalog.dimensions.flatMap((item) => item.tags), ...catalog.unassignedTags];
  const scopedTags = activeScope === "all" ? allTags : activeScope === "unassigned" ? catalog.unassignedTags : activeDimension?.tags || [];
  const query = search.trim().toLocaleLowerCase();
  const filteredTags = scopedTags.filter((tag) => !query || tag.name.toLocaleLowerCase().includes(query) || (tag.dimensionName || "未分类").toLocaleLowerCase().includes(query));
  const pageCount = Math.max(1, Math.ceil(filteredTags.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleTags = filteredTags.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleDimensions = catalog.dimensions.filter((item) => item.name.toLocaleLowerCase().includes(dimensionSearch.trim().toLocaleLowerCase()));

  function selectScope(next: Scope) {
    setScope(next); setSearch(""); setPage(1);
  }

  function open(next: Form, parentId?: number) {
    setForm(next); setFormError(""); setName(next.item?.name || ""); setSortOrder(String(next.item?.sortOrder || 0));
    setDimensionId(String(next.kind === "tag" ? next.item?.dimensionId || parentId || activeDimension?.id || catalog.dimensions[0]?.id || "" : ""));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !admin || saving) return;
    setFormError("");
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName || Array.from(cleanName).length > 30) { setFormError("名称需为1至30字。"); return; }
    const order = Number(sortOrder);
    if (!sortOrder.trim() || !Number.isInteger(order) || order < 0 || order > 10000) { setFormError("排序需为0至10000的整数。"); return; }
    if (form.kind === "tag" && !catalog.dimensions.some((item) => item.id === Number(dimensionId))) { setFormError("请选择标签所属维度。"); return; }
    const peers = form.kind === "dimension" ? catalog.dimensions : catalog.dimensions.find((item) => item.id === Number(dimensionId))?.tags || [];
    if (peers.some((item) => item.id !== form.item?.id && item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) { setFormError("名称已存在，请使用其他名称。"); return; }
    setSaving(true);
    try {
      const input = { name: cleanName, sortOrder: order };
      let saved: unknown;
      if (form.kind === "dimension") {
        saved = form.item ? await updateVlogTagDimension({ ...input, id: form.item.id, version: form.item.version }) : await createVlogTagDimension(input);
      } else {
        const tagInput = { ...input, dimensionId: Number(dimensionId) };
        saved = form.item ? await updateVlogTag({ ...tagInput, id: form.item.id, version: form.item.version }) : await createVlogTag(tagInput);
      }
      const fresh = await load();
      const savedId = saved && typeof saved === "object" && "id" in saved ? Number(saved.id) : form.item?.id;
      setSearch(""); setDimensionSearch("");
      if (form.kind === "tag") {
        setScope(Number(dimensionId));
        const tags = fresh?.dimensions.find((item) => item.id === Number(dimensionId))?.tags || [];
        const index = tags.findIndex((tag) => savedId ? tag.id === savedId : tag.name === cleanName);
        setPage(index < 0 ? 1 : Math.floor(index / pageSize) + 1);
      } else {
        const dimension = fresh?.dimensions.find((item) => savedId ? item.id === savedId : item.name === cleanName);
        if (dimension) setScope(dimension.id);
        setPage(1);
      }
      setForm(null);
      notify(form.item ? "标签设置已修改。" : "标签设置已新增。", "success");
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "保存失败，请刷新后重试。"); }
    finally { setSaving(false); }
  }

  async function removeDimension(item: VlogTagDimension) {
    if (item.tags.length) { notify("该维度下还有标签，请先移动或删除标签。", "error"); return; }
    if (!window.confirm(`确定删除标签维度“${item.name}”吗？用户筛选界面将不再显示此维度。`)) return;
    setSaving(true);
    try { await deleteVlogTagDimension(item); selectScope("all"); notify("标签维度已删除。", "success"); await load(); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "删除维度失败。", "error"); }
    finally { setSaving(false); }
  }

  async function removeTag(item: VlogTemplateTag) {
    if (!window.confirm(`确定删除标签“${item.name}”吗？该标签会从所有关联模板中移除，模板本身保留。`)) return;
    setSaving(true);
    try { await deleteVlogTag(item); notify("标签已删除，关联模板已同步更新。", "success"); await load(); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "删除标签失败。", "error"); }
    finally { setSaving(false); }
  }

  if (!admin) return <div className="panel text-sm text-coral">当前账号没有平台管理权限。</div>;

  function directoryItem(value: Scope, label: string, count: number, icon: React.ReactNode) {
    return <button key={value} type="button" disabled={saving} aria-current={activeScope === value ? "page" : undefined} aria-label={`查看${label}`} onClick={() => selectScope(value)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${activeScope === value ? "bg-teal/10 font-semibold text-teal" : "text-ink/65 hover:bg-ink/5"}`}>
      {icon}<span className="min-w-0 flex-1 break-words">{label}</span><span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${activeScope === value ? "bg-white/80 text-teal" : "bg-ink/5 text-ink/45"}`}>{count}</span>
    </button>;
  }

  return <div className="space-y-5">
    <div className="panel flex flex-wrap items-center justify-between gap-4">
      <div><div className="flex items-center gap-2"><h2 className="section-title">标签管理</h2><span className="inline-flex items-center gap-1 rounded bg-teal/10 px-2 py-1 text-xs text-teal"><ShieldCheck size={14} /> 平台管理</span></div><p className="mt-2 text-sm text-ink/55">按维度维护 Vlog 模板标签，也可在“全部标签”中搜索并定位。</p></div>
      <button type="button" onClick={() => void load()} disabled={loading || saving} className="secondary-button"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> 刷新</button>
    </div>
    {error && <div role="alert" className="panel flex items-center justify-between gap-3 text-sm text-coral"><span>{error}</span><button type="button" disabled={loading || saving} onClick={() => void load()} className="secondary-button">重试</button></div>}
    <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="panel space-y-4 lg:sticky lg:top-5" aria-label="标签维度目录">
        <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={16} /> 标签维度</h3><button type="button" onClick={() => open({ kind: "dimension" })} disabled={loading || saving} className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline"><Plus size={14} /> 新增维度</button></div>
        <label className="field lg:hidden"><span>当前维度</span><select aria-label="选择要管理的维度" value={activeScope} onChange={(event) => { const value = event.target.value; selectScope(value === "all" || value === "unassigned" ? value : Number(value)); }}><option value="all">全部标签（{allTags.length}）</option>{catalog.dimensions.map((dimension) => <option key={dimension.id} value={dimension.id}>{dimension.name}（{dimension.tags.length}）</option>)}<option value="unassigned">未分类（{catalog.unassignedTags.length}）</option></select></label>
        <label className="hidden items-center gap-2 rounded-lg border border-ink/10 bg-white/70 px-2.5 lg:flex"><Search size={14} className="shrink-0 text-ink/40" /><input aria-label="查找维度" value={dimensionSearch} onChange={(event) => setDimensionSearch(event.target.value)} placeholder="查找维度" className="w-full min-w-0 bg-transparent py-2 text-xs outline-none" /></label>
        <nav className="hidden max-h-[calc(100dvh-20rem)] space-y-1 overflow-y-auto lg:block">
          {directoryItem("all", "全部标签", allTags.length, <Tags size={15} className="shrink-0" />)}
          <div className="my-2 border-t border-ink/10" />
          {visibleDimensions.map((dimension) => directoryItem(dimension.id, dimension.name, dimension.tags.length, <FolderOpen size={15} className="shrink-0" />))}
          {!visibleDimensions.length && <p className="px-3 py-2 text-xs text-ink/45">{dimensionSearch ? "没有匹配的维度" : loading ? "正在加载维度..." : "暂无维度，请先新增"}</p>}
          <div className="my-2 border-t border-ink/10" />
          {directoryItem("unassigned", "未分类", catalog.unassignedTags.length, <FolderOpen size={15} className="shrink-0" />)}
        </nav>
        <p className="border-t border-ink/10 pt-3 text-xs leading-5 text-ink/40">{catalog.dimensions.length} 个维度 · {allTags.length} 个标签</p>
      </aside>
      <section className="panel overflow-hidden p-0" aria-label={`${scopeName}标签列表`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 p-5">
          <div><p className="mb-1 text-xs text-ink/40">标签管理 / {scopeName}</p><h3 className="flex items-center gap-2 text-lg font-semibold">{scopeName}<span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-normal text-ink/50">{scopedTags.length}</span></h3></div>
          <div className="flex flex-wrap gap-2">
            {activeDimension && <><button type="button" disabled={saving || loading} onClick={() => open({ kind: "dimension", item: activeDimension })} className="secondary-button" aria-label={`编辑维度 ${activeDimension.name}`}><Pencil size={14} /> 编辑维度</button><button type="button" disabled={saving || loading} onClick={() => void removeDimension(activeDimension)} className="icon-button text-coral" aria-label={`删除维度 ${activeDimension.name}`} title="删除维度"><Trash2 size={15} /></button></>}
            {activeScope !== "unassigned" && <button type="button" onClick={() => open({ kind: "tag" })} disabled={loading || saving || !catalog.dimensions.length} className="primary-button"><Plus size={15} /> 新增标签</button>}
          </div>
        </div>
        <div className="space-y-3 border-b border-ink/10 px-5 py-4">
          {activeScope === "unassigned" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">这些旧标签尚未归类。点击“编辑”选择所属维度，原模板关联会保留。</p>}
          <label className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 focus-within:border-teal/50"><Search size={16} className="shrink-0 text-ink/40" /><input aria-label="搜索标签" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={activeScope === "all" ? "搜索标签名称或所属维度" : `搜索${scopeName}下的标签`} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />{search && <button type="button" onClick={() => { setSearch(""); setPage(1); }} className="text-ink/45" aria-label="清除标签搜索"><X size={15} /></button>}</label>
          <p className="text-xs text-ink/45" role="status">{query ? `找到 ${filteredTags.length} 个标签` : `共 ${scopedTags.length} 个标签`}{query && activeScope !== "all" && <button type="button" onClick={() => { setScope("all"); setPage(1); }} className="ml-3 text-teal hover:underline">在全部标签中搜索</button>}</p>
        </div>
        <div className="max-h-[65dvh] overflow-auto">
          <table className="w-full text-left text-sm" aria-label="标签列表">
            <thead className="sticky top-0 z-10 bg-[#f4f8f7] text-xs text-ink/50"><tr><th scope="col" className="px-5 py-3 font-medium">标签名称</th><th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell">所属维度</th><th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">排序</th><th scope="col" className="px-5 py-3 text-right font-medium">操作</th></tr></thead>
            <tbody className="divide-y divide-ink/5">{visibleTags.map((tag) => <tr key={tag.id} className="transition hover:bg-teal/[0.025]"><td className="max-w-64 break-words px-5 py-3.5 font-medium text-ink/80">{tag.name}<span className="mt-1 block text-xs font-normal text-ink/45 sm:hidden">{tag.dimensionName || "未分类"}</span></td><td className="hidden px-3 py-3.5 sm:table-cell"><span className={`inline-flex rounded px-2 py-1 text-xs ${tag.dimensionId ? "bg-teal/10 text-teal" : "bg-amber-50 text-amber-800"}`}>{tag.dimensionName || "未分类"}</span></td><td className="hidden px-3 py-3.5 tabular-nums text-ink/50 md:table-cell">{tag.sortOrder}</td><td className="whitespace-nowrap px-5 py-3.5 text-right"><div className="inline-flex gap-3"><button type="button" disabled={saving || loading} onClick={() => open({ kind: "tag", item: tag })} className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline" aria-label={`编辑标签 ${tag.name}`}><Pencil size={13} /> 编辑</button><button type="button" disabled={saving || loading} onClick={() => void removeTag(tag)} className="inline-flex items-center gap-1 text-xs text-coral hover:underline" aria-label={`删除标签 ${tag.name}`}><Trash2 size={13} /> 删除</button></div></td></tr>)}</tbody>
          </table>
          {!visibleTags.length && <div className="space-y-2 px-5 py-14 text-center"><Tags size={28} className="mx-auto text-ink/20" /><p className="text-sm text-ink/55">{loading ? "正在读取标签..." : query ? "没有找到匹配的标签" : activeScope === "unassigned" ? "没有待分类的标签" : "当前还没有标签"}</p><p className="text-xs text-ink/40">{query ? "可调整关键词，或选择左侧“全部标签”扩大查找范围。" : activeScope === "unassigned" ? "所有标签都已归入对应维度。" : "从右上角新增标签，选择所属维度即可。"}</p></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 bg-white/60 px-5 py-3">
          <label className="flex items-center gap-2 text-xs text-ink/50">每页<select aria-label="每页标签数量" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded border border-ink/10 bg-white px-2 py-1.5 text-ink">{[20, 50, 100].map((size) => <option key={size} value={size}>{size} 条</option>)}</select></label>
          <div className="flex items-center gap-3 text-xs text-ink/55"><span>{filteredTags.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredTags.length)} / ${filteredTags.length}` : "0 条"}</span><button type="button" aria-label="上一页标签" disabled={currentPage <= 1 || loading || saving} onClick={() => setPage(currentPage - 1)} className="icon-button h-8 w-8 disabled:opacity-30"><ChevronLeft size={15} /></button><span className="tabular-nums">{currentPage} / {pageCount}</span><button type="button" aria-label="下一页标签" disabled={currentPage >= pageCount || loading || saving} onClick={() => setPage(currentPage + 1)} className="icon-button h-8 w-8 disabled:opacity-30"><ChevronRight size={15} /></button></div>
        </div>
      </section>
    </div>
    {form && <CatalogDialog title={`${form.item ? "编辑" : "新增"}${form.kind === "dimension" ? "标签维度" : "标签"}`} context={form.kind === "tag" ? `所属维度：${catalog.dimensions.find((item) => item.id === Number(dimensionId))?.name || "请选择维度"}` : "维度将显示在目录和用户的模板筛选中"} busy={saving} onClose={() => setForm(null)}>
      <form onSubmit={submit}><fieldset disabled={saving} className="space-y-4 p-5">
        <label className="field"><span>{form.kind === "dimension" ? "维度名称" : "标签名称"}</span><input name="catalogName" value={name} onChange={(event) => setName(event.target.value)} placeholder={form.kind === "dimension" ? "例如：展示对象" : "输入标签名称"} /></label>
        {form.kind === "tag" && <label className="field"><span>所属维度</span><select value={dimensionId} onChange={(event) => setDimensionId(event.target.value)} aria-label="标签所属维度"><option value="">请选择维度</option>{catalog.dimensions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label className="field"><span>排序</span><input type="number" min={0} max={10000} step={1} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /><span>数值越小越靠前，默认为 0。</span></label>
        <p className="text-xs leading-5 text-ink/45">名称最多30字，同一维度下不能重名。{form.kind === "tag" && "改名或移动后，关联模板会同步更新。"}</p>
        {formError && <p role="alert" className="rounded-lg bg-coral/5 p-3 text-sm text-coral">{formError}</p>}
        <div className="flex justify-end gap-2 border-t border-ink/10 pt-4"><button type="button" onClick={() => setForm(null)} className="secondary-button">取消</button><button type="submit" className="primary-button">{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} {saving ? "正在保存..." : "保存"}</button></div>
      </fieldset></form>
    </CatalogDialog>}
  </div>;
}
