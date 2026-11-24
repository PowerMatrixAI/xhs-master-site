"use client";
import { useEffect, useState } from "react";

export function ConsoleNavigation({ active, onSelect, admin, platform }: {
  active: string; onSelect: (id: string) => void; admin: boolean; platform: ReadonlyArray<readonly [string, string, unknown]>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setExpanded(JSON.parse(localStorage.getItem("xhs-navigation-groups") || "{}")); } catch {}
    setReady(true);
  }, []);
  const groups = [
    { name: "内容生产", items: [["productionVideos", "视频方案"], ["mediaTasks", "生成任务"]] },
    { name: "账号运营", items: [["dashboard","工作台"],["weekly","本周内容"],["videos","视频方案"],["images","图片方案"],["prompts","笔记草稿"],["interactions","发布后互动"],["reports","专家复盘"]] },
    { name: "高级设置", items: [["reference","参考研究"],["strategy","策划案"]] },
    { name: "平台管理", items: platform.map(([id,label]) => [id,label]) }
  ];
  useEffect(() => {
    const group = groups.find(g => g.items.some(([id]) => id === active));
    if (ready && group) setExpanded(old => ({ ...old, [group.name]: true }));
  }, [active, ready]);
  useEffect(() => { if (ready) localStorage.setItem("xhs-navigation-groups", JSON.stringify(expanded)); }, [expanded, ready]);
  const link = (id: string, label: string) => <button key={id} type="button" onClick={() => onSelect(id)} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${active === id ? "bg-teal/15 font-semibold text-teal" : "text-ink/75 hover:bg-white/70"}`}>{label}{(id === "videos" || id === "productionVideos") && <span className="sidebar-hot-badge">Hot</span>}</button>;
  const group = (index: number) => <div key={groups[index].name} className="py-1">
    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold" aria-expanded={!!expanded[groups[index].name]} onClick={() => setExpanded(old => ({ ...old, [groups[index].name]: !old[groups[index].name] }))}><span aria-hidden>{expanded[groups[index].name] ? "▾" : "▸"}</span>{groups[index].name}</button>
    {expanded[groups[index].name] && <div className="pl-3">{groups[index].items.map(([id,label]) => link(id,label))}</div>}
  </div>;
  return <nav className="space-y-1">{link("accounts","客户账号")}{group(0)}{group(1)}{link("assets","素材库")}{link("knowledgeBase","知识库")}{group(2)}{admin && group(3)}</nav>;
}
