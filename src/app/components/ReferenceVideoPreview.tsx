"use client";

import { ExternalLink, Video } from "lucide-react";
import type { ReferenceVideo } from "@/lib/referenceVideos";

export function ReferenceVideoPreview({ video }: { video: ReferenceVideo }) {
  return <div className="space-y-2 rounded-lg border border-teal/15 bg-teal/5 p-3">
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-teal"><Video size={15} className="shrink-0" /><span className="truncate">{video.name}</span></span>
      <a href={video.videoUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-teal hover:underline"><ExternalLink size={13} /> 打开视频</a>
    </div>
    <video key={video.videoUrl} controls playsInline preload="none" src={video.videoUrl} aria-label={`参考视频：${video.name}`} className="max-h-72 w-full rounded bg-ink/5" />
    {video.description && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink/65">{video.description}</p>}
  </div>;
}
