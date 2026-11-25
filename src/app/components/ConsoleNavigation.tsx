"use client";
import { useEffect, useState } from "react";
import { Building2, Clapperboard, Bot, Library, BookOpen, Settings2, ShieldCheck, ChevronDown, type LucideIcon } from "lucide-react";

export function ConsoleNavigation({ active, onSelect, admin, platform }: {
  active: string; onSelect: (id: string) => void; admin: boolean; platform: ReadonlyArray<readonly [string, string, unknown]>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("xhs-navigation-groups") || "{}");
      setExpanded({ ...saved, "Agent运营": saved["Agent运营"] ?? saved["账号运营"] ?? false });
    } catch {}
    setReady(true);
  }, []);
  const groups = [
    { name: "内容生产", icon: Clapperboard, items: [["productionVideos", "视频方案"], ["productionImages", "图片方案"], ["mediaTasks", "生成任务"]] },
    { name: "Agent运营", icon: Bot, items: [["dashboard","工作台"],["weekly","本周内容"],["videos","视频方案"],["images","图片方案"],["prompts","笔记草稿"],["interactions","发布后互动"],["reports","专家复盘"]] },
    { name: "高级设置", icon: Settings2, items: [["reference","参考研究"],["strategy","策划案"]] },
    { name: "平台管理", icon: ShieldCheck, items: platform.map(([id,label]) => [id,label]) }
  ];
  useEffect(() => {
    const group = groups.find(g => g.items.some(([id]) => id === active));
    if (ready && group) setExpanded(old => ({ ...old, [group.name]: true }));
  }, [active, ready]);
  useEffect(() => { if (ready) localStorage.setItem("xhs-navigation-groups", JSON.stringify(expanded)); }, [expanded, ready]);
  const link = (id: string, label: string, Icon?: LucideIcon) => <button key={id} type="button" onClick={() => onSelect(id)} aria-current={active === id ? "page" : undefined} className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${active === id ? "bg-teal/10 font-semibold text-teal" : "text-ink/70 hover:bg-white/80 hover:text-ink"}`}>
    {Icon ? <Icon size={18} strokeWidth={1.7} className="shrink-0" aria-hidden /> : <span className={`ml-1 h-1.5 w-1.5 shrink-0 rounded-full ${active === id ? "bg-teal" : "bg-ink/20"}`} aria-hidden />}
    <span className="flex-1">{label}</span>
    {(id === "videos" || id === "productionVideos") && <span className="sidebar-hot-badge">Hot</span>}
  </button>;
  const group = (index: number) => {
    const item = groups[index];
    const Icon = item.icon;
    const selected = item.items.some(([id]) => id === active);
    return <div key={item.name}>
      <button type="button" className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/80 ${selected ? "font-semibold text-teal" : "text-ink/70"}`} aria-expanded={!!expanded[item.name]} onClick={() => setExpanded(old => ({ ...old, [item.name]: !old[item.name] }))}>
        <Icon size={18} strokeWidth={1.7} className="shrink-0" aria-hidden />
        <span className="flex-1">{item.name}</span>
        <ChevronDown size={15} aria-hidden className={`transition-transform ${expanded[item.name] ? "rotate-180" : ""}`} />
      </button>
      {expanded[item.name] && <div className="mb-2 ml-5 mt-1 space-y-0.5 border-l border-teal/15 pl-2">{item.items.map(([id,label]) => link(id,label))}</div>}
    </div>;
  };
  return <nav aria-label="主导航" className="space-y-1">{link("accounts","客户账号",Building2)}{group(0)}{group(1)}{link("assets","素材库",Library)}{link("knowledgeBase","知识库",BookOpen)}<div className="mx-3 my-3 border-t border-ink/10" />{group(2)}{admin && group(3)}</nav>;
}
