"use client";

import { useState } from "react";
import { ImageIcon, Music2 } from "lucide-react";
import type { LoginResponse } from "@/lib/api";
import { PlatformMusicLibraryPanel } from "@/app/components/PlatformMusicLibraryPanel";
import { StoryCharacterLibraryPanel } from "@/app/components/StoryCharacterLibraryPanel";

type FeedbackTone = "success" | "error";

export function PlatformAssetLibraryPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: FeedbackTone) => void;
}) {
  const [section, setSection] = useState<"story" | "music">("story");

  return <div className="space-y-5">
    <div className="panel"><div className="flex flex-wrap items-center gap-2 border-b border-ink/10 pb-3"><button type="button" onClick={() => setSection("story")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${section === "story" ? "bg-teal text-white" : "bg-ink/5 text-ink/70"}`}><ImageIcon size={16} /> 故事角色与模板</button><button type="button" onClick={() => setSection("music")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${section === "music" ? "bg-teal text-white" : "bg-ink/5 text-ink/70"}`}><Music2 size={16} /> 平台配乐</button></div></div>
    {section === "story" ? <StoryCharacterLibraryPanel currentUser={currentUser} notify={notify} /> : <PlatformMusicLibraryPanel currentUser={currentUser} notify={notify} />}
  </div>;
}
