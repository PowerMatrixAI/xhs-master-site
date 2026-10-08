"use client";

import type { LoginResponse } from "@/lib/api";
import { StoryCharacterLibraryPanel } from "@/app/components/StoryCharacterLibraryPanel";

type FeedbackTone = "success" | "error";

export function PlatformAssetLibraryPanel({ currentUser, notify }: {
  currentUser: LoginResponse | null;
  notify: (message: string, tone: FeedbackTone) => void;
}) {
  return <StoryCharacterLibraryPanel currentUser={currentUser} notify={notify} />;
}
