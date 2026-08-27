"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  CircleCheck,
  CircleX,
  Clipboard,
  Database,
  Download,
  FileText,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  Library,
  LoaderCircle,
  LogOut,
  MessageCircle,
  NotebookPen,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Expand,
  ImageOff,
  Trash2,
  Upload,
  Video,
  Wand2,
  X,
} from "lucide-react";
import {
  createBackendAccount,
  fetchBackendAccountDetail,
  deleteBackendAccount,
  fetchBackendAccounts,
  logout,
  getToken,
  getUser,
  saveBackendAssets,
  saveBackendNoteTask,
  saveBackendPostReviewResult,
  saveBackendWeeklyPlan,
  retrieveBackendKnowledgeSnapshot,
  setBackendExpertRulesEnabled,
  updateBackendAccount,
  authenticatedFetch,
  buildProxyHeaders,
  type BackendAccountDetail,
  type BackendAsset,
  type BackendNoteTask,
  type BackendPostReview,
  type BackendWeeklyPlan,
  type LoginResponse
} from "@/lib/api";
import { generateStrategyWithBrowserLlm, generateWeeklyTasksWithBrowserLlm } from "@/lib/browserStrategyLlm";
import { loadBrowserWorkspace, saveBrowserWorkspace } from "@/lib/browserWorkspace";
import { accountTypeTemplates } from "@/data/accountTypeTemplates";
import { clampWeeklyFrequency, normalizeWeeklyTaskMedia } from "@/lib/weeklyPlan";
import { collectRecentWeeklyTopicGroups } from "@/lib/weeklyTopicHistory";
import {
  combineWeeklyPlanningObjectives,
  getWeeklyPlanningObjectives,
  selectedWeeklyPlanningObjectives,
  type WeeklyPlanningObjective
} from "@/lib/weeklyPlanningObjectives";
import { isExpertRuleEnabled } from "@/lib/expertLearning";
import { KnowledgeBasePanel } from "@/app/components/KnowledgeBasePanel";
import type React from "react";
import clsx from "clsx";

type Template = {
  id: number;
  typeKey: string;
  name: string;
  defaultColumns: string;
  weeklyRatio: string;
};

type Account = {
  id: number;
  name: string;
  accountParam: string;
  accountType: string;
  stage: string;
  personaBase: string;
  city: string;
  targetUsers: string;
  painPoints: string;
  contentDirections: string;
  businessGoals: string;
  monetization: string;
  referenceAccounts: string;
  materialCondition: string;
  taboos: string;
  profilePath: string;
  assetsPath: string;
  strategy?: { markdown: string; positioning: string; execGuide: string } | null;
  profile?: { content: string; version: number; path: string } | null;
  referenceResearches?: ReferenceResearch[];
  imageStyleStudies?: ImageStyleStudy[];
  interactionPlans?: InteractionPlan[];
  postReviews?: PostReview[];
  expertRules?: ExpertRule[];
  industryKnowledgeResearches?: IndustryKnowledgeResearch[];
  assets: Asset[];
  weeklyPlans: WeeklyPlan[];
};

type ReferenceResearch = {
  id: number;
  searchKeywords: string;
  commandJson: string;
  researchPrompt: string;
  rawResults: string;
  selectedAccounts: string;
  summaryMarkdown: string;
  contentFeatures: string;
  personaInsights: string;
  strategyInsights: string;
  writingStyleInsights: string;
  status: string;
};

type ImageStyleStudy = {
  id: number;
  searchKeywords: string;
  commandJson: string;
  researchPrompt: string;
  rawResults: string;
  summaryMarkdown: string;
  styleBriefJson: string;
  status: string;
};

type InteractionPlan = {
  id: number;
  noteTaskId: number | null;
  searchKeywords: string;
  commandJson: string;
  discoveryPrompt: string;
  commentPrompt: string;
  rawResults: string;
  targetUsersMarkdown: string;
  commentDraftsMarkdown: string;
  status: string;
};

type PostReview = {
  id: number;
  noteTaskId: number | null;
  input: BackendPostReview["input"];
  summary: string;
  evidenceAssessment: string;
  aiModel: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

type ExpertRule = {
  id: number;
  accountType: string;
  module: string;
  rule: string;
  source: string;
  status: string;
  enabled?: boolean;
  positiveExample?: string;
  negativeExample?: string;
  reason?: string;
  applicableWhen?: string;
  notApplicableWhen?: string;
  nextTest?: string;
  createdAt: string;
  updatedAt?: string;
};

type IndustryKnowledgeResearch = {
  id: number;
  topic: string;
  searchScope: string;
  commandJson: string;
  researchPrompt: string;
  rawResults: string;
  summaryMarkdown: string;
  status: string;
  createdAt: string;
};

type Asset = {
  id: number;
  filePath: string;
  fileUrl?: string | null;
  fileType: string;
  sourceType: string;
  location?: string;
  shotAt?: string;
  tags: string;
  suitableTypes: string;
  coverReady: boolean;
  used: boolean;
  authorizationState?: string;
  riskNotes: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  hash?: string;
};

type WeeklyPlan = {
  id: number;
  weekStart: string;
  theme: string;
  goal: string;
  frequency: number;
  ratio: string;
  testHypothesis: string;
  commercializationMove: string;
  interactionGoal: string;
  availableAssets: string;
  taboos: string;
  status?: string;
  knowledgeSnapshotId?: string;
  noteTasks: NoteTask[];
};

type NoteTask = {
  id: number;
  type: "image_text" | "video_text";
  publishAt: string;
  contentType: string;
  contentGoal: string;
  topicTitle: string;
  targetUser: string;
  painPoint: string;
  coreView: string;
  writingStyleName: string;
  writingStyleReference: string;
  requiredMaterials: string;
  recommendedAssets: string;
  coverCopyDirection: string;
  commentHook: string;
  expectedGoal: string;
  status: string;
  knowledgeSourceKeys?: string[];
  bodyDraft?: string;
  plan?: string;
};

type PromptResult = {
  openclawTask?: { content: string; title: string };
  prompt: { content: string; title: string };
  imagePrompt?: { content: string; title: string; path: string };
  commands: Array<{ category: string; command: string; description: string; safetyNote: string }>;
};

type DraftVariant = {
  id: "playful" | "lively" | "balanced";
  label: string;
  title: string;
  body: string;
};

type ImagePromptResult = {
  openclawTask?: { content: string; title: string };
  imagePrompt: { content: string; title: string; path: string };
  referenceStyle: string;
  commands: Array<{ category: string; command: string; description: string; safetyNote: string }>;
};

type VideoPromptResult = {
  openclawTask: { content: string; title: string };
  videoPrompt: { content: string; title: string };
  ai?: { used: boolean; calls: number };
};

type BatchImagePostsResult = {
  planningPrompt: { content: string; title: string; path: string };
  commands: Array<{ category: string; command: string; description: string; safetyNote: string }>;
};

type SingleImageSourceMode = "ai_auto_select" | "remote_images" | "ai_generate" | "mixed";

const DEFAULT_REAL_IMAGE_REFINEMENT_REQUIREMENT = "保留真实主体、空间结构和业务事实，只做自然光、构图、色彩、清晰度和必要背景整理的保守精修。";
const DEFAULT_AI_ASSISTANT_REQUIREMENT = "根据笔记目标、内容、方向生成所需要的画面或完整信息卡。";
const DEFAULT_MIXED_AI_ASSISTANT_REQUIREMENT = "根据笔记目标、内容、方向生成所需要的画面或完整信息卡，用于补足素材库图片未覆盖的内容。";

type SingleImagePromptOptions = {
  openclawImagePaths?: string;
  selectedAssets?: Asset[];
  candidateAssets?: Asset[];
  imageSourceMode?: SingleImageSourceMode;
  noteContent?: string;
  singleGoal?: string;
  imageCount?: string;
  autoImageCount?: string;
  aiImageCount?: string;
  realImageRefinementRequirement?: string;
  aiAssistantRequirement?: string;
  removeWatermarks?: boolean;
};

type GenerationControls = {
  manageLoading?: boolean;
  showSuccessToast?: boolean;
  loadingAction?: string;
};

type ImagePromptGeneration = {
  result: ImagePromptResult;
  savedTask: NoteTask;
};

type FeedbackTone = "success" | "error";

type FeedbackDialog = {
  message: string;
  tone: FeedbackTone;
};

const mainTabs = [
  ["dashboard", "工作台", LayoutDashboard],
  ["accounts", "客户账号", ShieldCheck],
  ["weekly", "本周内容", CalendarDays],
  ["images", "图片方案", ImageIcon],
  ["videos", "视频方案", Video],
  ["prompts", "笔记草稿", Wand2],
  ["assets", "素材库", Library],
  ["knowledgeBase", "知识库", Database],
  ["interactions", "发布后互动", MessageCircle],
  ["reports", "专家复盘", Activity],
  ["learning", "行业学习", BookOpen]
] as const;

const advancedTabs = [
  ["reference", "参考研究", Search],
  ["strategy", "策划案", Sparkles],
  ["agents", "配置文件", FileText],
  ["health", "系统状态", Gauge]
] as const;

const tabs = [...mainTabs, ...advancedTabs] as const;

const sourceTypes = [
  "真实素材",
  "文旅素材",
  "民俗/非遗素材",
  "活动现场",
  "导览/票务截图",
  "空间/房型实拍",
  "菜品实拍",
  "环境实拍",
  "路线图/轨迹截图",
  "现场实拍",
  "装备实拍",
  "产品实拍",
  "菜单/价格表",
  "品牌授权",
  "顾客/同行授权",
  "AI 图生图",
  "网络参考"
];
function accountUiMode(accountType?: string) {
  if (["hiking_diary", "outdoor_travel", "mountain_route", "city_walk_nature", "overseas_hiking"].includes(accountType || "")) return "outdoor";
  if (["restaurant", "cafe_bakery", "hotpot_bbq_latenight", "bar_lightmeal"].includes(accountType || "")) return "food";
  if (accountType === "folk_custom_heritage") return "heritage";
  if (accountType === "homestay_hotel_camp") return "stay";
  if (accountType === "museum_exhibition_study") return "museum";
  if (accountType === "regional_product_cultural_creative") return "product";
  if (accountType === "wedding_planning") return "service";
  if (accountType === "local_life_service") return "service";
  return "culture_tourism";
}

function isHikingUiType(accountType?: string) {
  return accountUiMode(accountType) === "outdoor";
}

async function readJsonResponse<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 300) || "服务返回了无效响应。");
  }
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function fileNameFromRemoteUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const raw = pathname.split("/").filter(Boolean).pop() || url;
    return decodeURIComponent(raw);
  } catch {
    return url;
  }
}

function guessRemoteFileType(url: string) {
  const lower = url.toLowerCase();
  if (/\.(png)(?:$|\?)/.test(lower)) return "image/png";
  if (/\.(gif)(?:$|\?)/.test(lower)) return "image/gif";
  if (/\.(webp)(?:$|\?)/.test(lower)) return "image/webp";
  if (/\.(avif)(?:$|\?)/.test(lower)) return "image/avif";
  return "image/jpeg";
}

function collectRemoteImageUrls(form: FormData) {
  return Array.from(new Set(form.getAll("selectedAssetUrls").map((item) => String(item || "").trim()).filter(Boolean)));
}

function summarizeFiles(files: File[]) {
  return {
    count: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0)
  };
}

function mergeFiles(current: File[], incoming: File[]) {
  const seen = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
  const merged = [...current];
  for (const file of incoming) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(file);
    }
  }
  return merged;
}

function isRemoteImageAsset(asset: Asset) {
  if (!asset.fileUrl) return false;
  const type = (asset.fileType || "").toLowerCase();
  return type === "image"
    || type.startsWith("image/")
    || /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(asset.fileUrl);
}

function isRemoteVideoAsset(asset: Asset) {
  if (!asset.fileUrl) return false;
  const type = (asset.fileType || "").toLowerCase();
  return type === "video" || type.startsWith("video/") || /\.(?:mp4|mov|m4v|webm)(?:$|\?)/i.test(asset.fileUrl);
}

function inferQuickImageCount(requiredMaterials: string) {
  const matched = requiredMaterials.match(/(\d+)\s*张/);
  const parsed = matched ? Number.parseInt(matched[1], 10) : 5;
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : 5, 9));
}

function normalizeReviewPublishedAt(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
  if (/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)$/.test(normalized)) {
    return normalized;
  }
  throw new Error("发布时间格式不正确，请使用 YYYY-MM-DD、YYYY-MM-DD HH:mm 或完整 RFC3339 时间。");
}

function RemoteAssetPicker(props: {
  assets: Asset[];
  pickerLabel: string;
  pickerHelp: string;
  orderable?: boolean;
}) {
  const pickerId = useId().replace(/:/g, "");
  const [hoverPreview, setHoverPreview] = useState<{ asset: Asset; left: number; top: number } | null>(null);
  const [pinnedPreview, setPinnedPreview] = useState<Asset | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!pinnedPreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pinnedPreview]);
  const remoteAssets = props.assets.filter(isRemoteImageAsset);
  const availableUrlKey = remoteAssets.map((asset) => asset.fileUrl).join("\n");
  const orderedAssets = selectedUrls
    .map((url) => remoteAssets.find((asset) => asset.fileUrl === url))
    .filter((asset): asset is Asset => Boolean(asset));

  useEffect(() => {
    const availableUrls = new Set(availableUrlKey.split("\n").filter(Boolean));
    setSelectedUrls((current) => current.filter((url) => availableUrls.has(url)));
  }, [availableUrlKey]);

  function showHoverPreview(event: React.MouseEvent, asset: Asset) {
    const previewSize = 320;
    const gap = 16;
    setHoverPreview({
      asset,
      left: Math.max(gap, Math.min(event.clientX + gap, window.innerWidth - previewSize - gap)),
      top: Math.max(gap, Math.min(event.clientY + gap, window.innerHeight - previewSize - gap))
    });
  }

  function markImageFailed(url: string) {
    setFailedUrls((current) => {
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }

  function assetLabel(asset: Asset) {
    return asset.tags?.trim() || asset.filePath || "素材库图片";
  }

  function toggleOrderedAsset(url: string, checked: boolean) {
    setSelectedUrls((current) => checked
      ? current.includes(url) ? current : [...current, url]
      : current.filter((item) => item !== url));
  }

  function moveOrderedAsset(index: number, offset: -1 | 1) {
    setSelectedUrls((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded border border-ink/10 bg-white p-3">
      <div>
        <div className="text-sm font-medium">{props.pickerLabel}</div>
        <div className="mt-1 text-xs leading-5 text-ink/55">{props.pickerHelp}</div>
      </div>
      {remoteAssets.length ? (
        <div className="grid max-h-56 min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-x-hidden overflow-y-auto rounded border border-ink/10 bg-ink/5 p-2">
          {remoteAssets.map((asset) => {
            const url = asset.fileUrl || "";
            const failed = failedUrls.has(url);
            const selectedIndex = selectedUrls.indexOf(url);
            const checkboxId = `${pickerId}-asset-${asset.id}-${url.slice(-12).replace(/[^a-z0-9]/gi, "")}`;
            return (
              <div key={`${asset.id}-${url}`} className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded border border-transparent bg-white p-2 transition has-[:checked]:border-teal/40 has-[:checked]:bg-teal/5">
                <input
                  id={checkboxId}
                  name={props.orderable ? undefined : "selectedAssetUrls"}
                  type="checkbox"
                  value={url}
                  checked={props.orderable ? selectedIndex >= 0 : undefined}
                  onChange={props.orderable ? (event) => toggleOrderedAsset(url, event.target.checked) : undefined}
                  className="shrink-0"
                />
                <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-ink/10 bg-ink/5"
                    onMouseEnter={(event) => showHoverPreview(event, asset)}
                    onMouseLeave={() => setHoverPreview(null)}
                  >
                    {failed ? (
                      <ImageOff size={20} className="text-ink/35" aria-label="图片无法预览" />
                    ) : (
                      // Dynamic object-storage URLs are intentionally rendered without Next Image optimization.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={assetLabel(asset)}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={() => markImageFailed(url)}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{asset.filePath}</span>
                    {asset.tags?.trim() && <span className="mt-0.5 block truncate text-xs text-ink/55">{asset.tags}</span>}
                    <span className="mt-0.5 block truncate text-xs text-teal">{url}</span>
                  </span>
                </label>
                <button
                  type="button"
                  title="查看大图"
                  aria-label={`查看大图：${assetLabel(asset)}`}
                  onClick={() => setPinnedPreview(asset)}
                  disabled={failed}
                  className="icon-button shrink-0"
                >
                  <Expand size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded border border-dashed border-ink/15 bg-ink/5 px-3 py-4 text-sm text-ink/55">
          当前账号还没有可选素材，请先上传图片。
        </div>
      )}

      {props.orderable && orderedAssets.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded border border-teal/25 bg-teal/5">
          <div className="flex items-center justify-between gap-3 border-b border-teal/15 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-teal">已选图片顺序</div>
              <div className="mt-0.5 text-xs text-ink/55">第一张作为封面；使用箭头调整最终图集顺序。</div>
            </div>
            <div className="shrink-0 text-xs text-ink/55">共 {orderedAssets.length} 张</div>
          </div>
          <div className="max-h-64 overflow-y-auto bg-white">
            {orderedAssets.map((asset, index) => {
              const url = asset.fileUrl || "";
              const failed = failedUrls.has(url);
              return (
                <div key={`ordered-${asset.id}-${url}`} className="flex min-w-0 items-center gap-3 border-b border-ink/10 px-3 py-2 last:border-b-0">
                  <div className="flex w-6 shrink-0 justify-center text-sm font-semibold text-ink/70">{index + 1}</div>
                  <button
                    type="button"
                    title="查看大图"
                    aria-label={`查看第 ${index + 1} 张大图：${assetLabel(asset)}`}
                    onClick={() => setPinnedPreview(asset)}
                    disabled={failed}
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-ink/10 bg-ink/5"
                  >
                    {failed ? (
                      <ImageOff size={18} className="text-ink/35" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={assetLabel(asset)} className="h-full w-full object-cover" onError={() => markImageFailed(url)} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{asset.tags?.trim() || asset.filePath}</div>
                      {index === 0 && <span className="shrink-0 text-xs font-medium text-teal">封面</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink/50">{asset.filePath}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" title="上移" aria-label={`上移第 ${index + 1} 张图片`} disabled={index === 0} onClick={() => moveOrderedAsset(index, -1)} className="icon-button">
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" title="下移" aria-label={`下移第 ${index + 1} 张图片`} disabled={index === orderedAssets.length - 1} onClick={() => moveOrderedAsset(index, 1)} className="icon-button">
                      <ArrowDown size={15} />
                    </button>
                    <button type="button" title="移出" aria-label={`移出第 ${index + 1} 张图片`} onClick={() => toggleOrderedAsset(url, false)} className="icon-button">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedUrls.map((url) => <input key={`ordered-input-${url}`} type="hidden" name="selectedAssetUrls" value={url} />)}
        </div>
      )}

      {hoverPreview && !failedUrls.has(hoverPreview.asset.fileUrl || "") && (
        <div
          className="pointer-events-none fixed z-50 flex h-80 w-80 items-center justify-center overflow-hidden rounded-md border border-ink/15 bg-white p-2 shadow-panel"
          style={{ left: hoverPreview.left, top: hoverPreview.top }}
          role="tooltip"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hoverPreview.asset.fileUrl || ""}
            alt={assetLabel(hoverPreview.asset)}
            className="max-h-full max-w-full object-contain"
            onError={() => markImageFailed(hoverPreview.asset.fileUrl || "")}
          />
        </div>
      )}

      {pinnedPreview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`素材预览：${assetLabel(pinnedPreview)}`}
          onClick={() => setPinnedPreview(null)}
        >
          <div className="w-full max-w-3xl rounded-md bg-white p-4 shadow-panel" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{pinnedPreview.filePath}</div>
                {pinnedPreview.tags?.trim() && <div className="mt-1 truncate text-xs text-ink/55">{pinnedPreview.tags}</div>}
              </div>
              <button type="button" title="关闭预览" aria-label="关闭预览" onClick={() => setPinnedPreview(null)} className="icon-button shrink-0">
                <X size={17} />
              </button>
            </div>
            <div className="flex max-h-[72vh] min-h-64 items-center justify-center overflow-hidden rounded border border-ink/10 bg-ink/5">
              {failedUrls.has(pinnedPreview.fileUrl || "") ? (
                <div className="flex flex-col items-center gap-2 text-sm text-ink/45">
                  <ImageOff size={28} />
                  图片无法预览
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pinnedPreview.fileUrl || ""}
                  alt={assetLabel(pinnedPreview)}
                  className="max-h-[72vh] max-w-full object-contain"
                  onError={() => markImageFailed(pinnedPreview.fileUrl || "")}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function assetUiCopy(accountType?: string) {
  const mode = accountUiMode(accountType);
  const copies = {
    culture_tourism: {
      folderPlaceholder: "/Users/wanglujie/Desktop/文旅项目素材",
      source: "文旅素材",
      tags: "例如：古镇, 活动现场, 导览图, 交通票务",
      suitable: "例如：目的地种草 / 游览动线 / 活动转化 / 交通票务",
      risk: "例如：开放时间、票价、活动日期和游客肖像需确认",
      singleTags: "例如：景区入口, 街区, 活动现场, 导览图, 停车",
      singleSuitable: "例如：目的地封面 / 动线攻略 / 票务信息卡 / 拍照机位",
      singleRisk: "开放状态需确认 / 活动日期需核验 / 游客肖像需授权",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型文旅图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/文旅项目/本篇笔记",
      imagePathsPlaceholder: "例如：\n古镇入口.jpg\n节庆活动现场.jpg\n导览图.png\n票务截图.jpg"
    },
    heritage: {
      folderPlaceholder: "/Users/wanglujie/Desktop/民俗非遗素材",
      source: "民俗/非遗素材",
      tags: "例如：非遗, 手作, 活动现场, 传承人授权",
      suitable: "例如：工艺故事 / 体验预约 / 节庆活动 / 研学转化",
      risk: "例如：传承人肖像、作品来源和文化禁忌需确认",
      singleTags: "例如：工艺细节, 作品, 传承人, 手作流程, 节庆",
      singleSuitable: "例如：非遗封面 / 制作流程 / 体验预约 / 文化科普",
      singleRisk: "肖像需授权 / 作品来源需确认 / 不做猎奇化表达",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型民俗/非遗图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/民俗非遗/本篇笔记",
      imagePathsPlaceholder: "例如：\n蓝染工艺细节.jpg\n手作流程.jpg\n活动现场.jpg\n预约信息.png"
    },
    stay: {
      folderPlaceholder: "/Users/wanglujie/Desktop/民宿酒店素材",
      source: "空间/房型实拍",
      tags: "例如：房型, 窗景, 公共区, 周边体验",
      suitable: "例如：房型空间 / 周边体验 / 价格预订 / FAQ",
      risk: "例如：房态、价格、退改和宠物政策需确认",
      singleTags: "例如：大床房, 窗景, 早餐, 停车, 营地",
      singleSuitable: "例如：房型封面 / 设施说明 / 周边攻略 / 价格卡",
      singleRisk: "房态需确认 / AI 不得改变房型和景观",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型住宿/营地图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/民宿酒店/本篇笔记",
      imagePathsPlaceholder: "例如：\n房间窗景.jpg\n公共区.jpg\n早餐.jpg\n价格政策.png"
    },
    food: {
      folderPlaceholder: "/Users/wanglujie/Desktop/长歌行菜品图",
      source: "菜品实拍",
      tags: "例如：长歌行, 清蒸鲈鱼, 竹林土鸡, 包间, 门头, 停车场入口",
      suitable: "例如：主推菜封面 / 菜品细节 / 套餐组合 / 环境图 / 交通指南漫画",
      risk: "例如：客户原图；文件名需用菜品名/环境名；交通、价格和活动需确认",
      singleTags: "例如：清蒸鲈鱼, 竹林土鸡, 包间, 门头, 停车场入口, 活动套餐",
      singleSuitable: "例如：单菜品种草 / 营销活动 / 当地特色 / 环境交通 / 交通漫画卡",
      singleRisk: "价格需确认 / 菜品名需匹配文件名 / AI 图生图不得改变真实出品 / 交通需核验",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型餐饮图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/门店名/本篇笔记",
      imagePathsPlaceholder: "例如：\n清蒸鲈鱼.jpg\n竹林土鸡.jpg\n包间.jpg\n大厅.jpg\n门头.jpg\n停车场入口.jpg"
    },
    outdoor: {
      folderPlaceholder: "/Users/wanglujie/Desktop/X的徒步日记路线图",
      source: "现场实拍",
      tags: "例如：X的徒步日记, 轨迹图, 现场图",
      suitable: "例如：路线攻略 / 封面 / 关键路况 / 装备复盘",
      risk: "例如：真实路线素材，出发信息需人工确认",
      singleTags: "例如：路线图, 轨迹, 山脊, 岔路, 补给, 封面",
      singleSuitable: "例如：路线攻略 / 路况提醒 / 装备复盘",
      singleRisk: "开放状态需确认 / AI 图生图 / 轨迹数据需核验",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型户外路线图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/X的徒步日记/本篇笔记",
      imagePathsPlaceholder: "例如：\n路线图-标毅线.png\n山脊路况.jpg\n轨迹截图.jpg"
    },
    museum: {
      folderPlaceholder: "/Users/wanglujie/Desktop/展馆研学素材",
      source: "文旅素材",
      tags: "例如：展览, 展厅, 展品授权, 预约票务",
      suitable: "例如：展览看点 / 观展动线 / 研学转化 / 票务信息",
      risk: "例如：拍摄规则、展期、票务和展品版权需确认",
      singleTags: "例如：展品, 展厅, 导览图, 票务, 亲子研学",
      singleSuitable: "例如：展览封面 / 展品故事 / 观展动线 / 预约卡",
      singleRisk: "展期需确认 / 展品版权需授权 / 拍摄规则需核验",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型展馆/研学图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/展馆研学/本篇笔记",
      imagePathsPlaceholder: "例如：\n展厅入口.jpg\n重点展品.jpg\n导览图.png\n预约票务.jpg"
    },
    product: {
      folderPlaceholder: "/Users/wanglujie/Desktop/特产文创素材",
      source: "产品实拍",
      tags: "例如：特产, 文创, 包装, 产地, 礼盒",
      suitable: "例如：产品种草 / 工艺故事 / 礼盒转化 / 规格价格",
      risk: "例如：产地、规格、价格、库存和资质需确认",
      singleTags: "例如：产品, 包装, 原料, 产地, 礼盒",
      singleSuitable: "例如：产品封面 / 产地故事 / 规格价格 / FAQ",
      singleRisk: "产地需确认 / 不夸大功效 / 包装规格不得改变",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型特产/文创图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/特产文创/本篇笔记",
      imagePathsPlaceholder: "例如：\n产品包装.jpg\n产地原料.jpg\n礼盒.jpg\n规格价格.png"
    },
    service: {
      folderPlaceholder: "/Users/wanglujie/Desktop/本地服务素材",
      source: "真实素材",
      tags: "例如：服务流程, 门店空间, 设备, 授权案例",
      suitable: "例如：服务项目 / 流程说明 / 价格预约 / FAQ",
      risk: "例如：案例授权、隐私、资质和价格需确认",
      singleTags: "例如：流程, 设备, 空间, 资质, 案例授权",
      singleSuitable: "例如：服务封面 / 流程图 / 价格卡 / FAQ",
      singleRisk: "案例需授权 / 不夸大效果 / 隐私需处理",
      stylePlaceholder: "粘贴 xiaohongshu_auto_op 对同类型本地服务图片风格的搜索和分析结果",
      assetsDirPlaceholder: "/path/to/assets/本地服务/本篇笔记",
      imagePathsPlaceholder: "例如：\n门店空间.jpg\n服务流程.jpg\n设备资质.jpg\n价格表.png"
    }
  };
  return copies[mode];
}

function weeklyUiCopy(accountType?: string) {
  const mode = accountUiMode(accountType);
  const copies = {
    culture_tourism: {
      ratio: "目的地种草2 / 动线攻略1 / 活动转化1",
      test: "例：真实目的地图 + 动线信息是否比单纯风景图更容易被收藏。",
      conversion: "例：轻量提到票务、活动报名、游线产品或服务咨询。",
      interaction: "例：引导用户留言出行日期、同行人、交通方式和想看的体验。",
      assets: "可粘贴目的地图、活动现场图、导览图、票务截图路径；或写：缺动线图/缺票务信息。"
    },
    heritage: {
      ratio: "工艺故事2 / 活动体验1 / 预约转化1",
      test: "例：真实工艺细节 + 体验流程是否比单纯作品图更容易被收藏。",
      conversion: "例：轻量提到体验预约、研学课程、节庆活动或文创购买。",
      interaction: "例：引导用户留言想体验的工艺、出行日期、是否亲子/研学。",
      assets: "可粘贴工艺细节、作品、活动现场、授权人物图路径；或写：缺授权图/缺预约信息。"
    },
    stay: {
      ratio: "房型空间2 / 周边体验1 / 价格问答1",
      test: "例：真实房型 + 周边玩法是否比单纯美图更容易带来咨询。",
      conversion: "例：轻量提到订房、套餐、团建或亲子活动。",
      interaction: "例：引导用户留言日期、人数、预算、亲子/宠物/停车需求。",
      assets: "可粘贴房间、窗景、公共区、早餐、周边体验图路径；或写：缺价格/缺房态。"
    },
    food: {
      ratio: "单菜品2 / 营销活动1 / 当地特色1 / 环境交通1",
      test: "例：用真实菜品文件名自动匹配图文，是否比人工挑图更稳定。",
      conversion: "例：轻量提到团购、预约、套餐、活动期限或到店路线。",
      interaction: "例：引导用户留言想吃哪道菜、人数、预算、忌口、停车交通问题。",
      assets: "先把图片整理到素材库；文件名建议体现菜品名或环境名，方便后续自动识别。"
    },
    outdoor: {
      ratio: "路线日记2 / 攻略收藏1 / 装备复盘1",
      test: "例：路线图 + 现场图是否比单纯风景图更容易被收藏。",
      conversion: "例：轻量提到路线合集、装备清单、资料包或社群。",
      interaction: "例：引导用户留言体力基础、出发季节、交通和装备问题。",
      assets: "可粘贴路线图、轨迹截图、现场图路径；或写：缺轨迹图/缺路况图。"
    },
    museum: {
      ratio: "展览看点2 / 研学攻略1 / 票务问答1",
      test: "例：真实展品图 + 观展动线是否比单张海报更容易收藏。",
      conversion: "例：轻量提到票务预约、讲解服务、研学课程或文创。",
      interaction: "例：引导用户留言观展时间、孩子年龄、是否需要讲解。",
      assets: "可粘贴展品授权图、展厅图、导览图、票务截图路径；或写：缺展期/缺拍摄规则。"
    },
    product: {
      ratio: "产品种草2 / 工艺故事1 / 礼盒转化1",
      test: "例：真实产品图 + 规格价格卡是否比氛围图更容易带来咨询。",
      conversion: "例：轻量提到购买方式、团购、伴手礼或文旅联动。",
      interaction: "例：引导用户留言用途、预算、口味偏好和送礼对象。",
      assets: "可粘贴产品图、包装图、产地图、价格规格图路径；或写：缺产地/缺规格。"
    },
    service: {
      ratio: "服务项目2 / 案例过程1 / 价格问答1",
      test: "例：真实服务流程 + 价格边界是否比案例图更容易建立信任。",
      conversion: "例：轻量提到预约、套餐、会员或本地咨询。",
      interaction: "例：引导用户留言预算、时间、顾虑和是否需要预约。",
      assets: "可粘贴门店空间、服务流程、设备资质、授权案例路径；或写：缺授权/缺价格。"
    }
  };
  return copies[mode];
}

function weeklyFocusCopy(accountType?: string) {
  const mode = accountUiMode(accountType);
  const copies = {
    culture_tourism: {
      label: "本周是否有特殊活动 / 目的地要推荐？",
      placeholder: "例如：周末夜游活动 / 暑期亲子套票 / 新开放的古街区；没有就留空，系统会自动排一周计划。",
      help: "留空时按文旅目的地的自动计划执行。"
    },
    heritage: {
      label: "本周是否有特殊民俗活动 / 非遗体验要推荐？",
      placeholder: "例如：蓝染体验课 / 周末民俗节 / 亲子手作活动；没有就留空，系统会自动排一周计划。",
      help: "留空时按民俗/非遗的自动计划执行。"
    },
    stay: {
      label: "本周是否有特殊房型 / 套餐 / 周边活动？",
      placeholder: "例如：亲子房暑期套餐 / 露营烧烤夜 / 周末双人房优惠；没有就留空。",
      help: "留空时按住宿/营地的自动计划执行。"
    },
    food: {
      label: "本周是否有特殊活动 / 主推菜 / 当地特色要推荐？",
      placeholder: "例如：本周主推清蒸鲈鱼；周末双人套餐；安吉本地竹林土鸡；没有就留空，系统会自动排计划。",
      help: "填写后，本周内容会优先围绕这个菜品、活动或当地特色生成；留空则按自动计划执行。"
    },
    outdoor: {
      label: "本周是否有特殊路线 / 活动要推荐？",
      placeholder: "例如：周末新手轻徒步路线 / 海岸线活动 / 端午路线合集；没有就留空。",
      help: "留空时按户外路线的自动计划执行。"
    },
    museum: {
      label: "本周是否有特殊展览 / 研学活动要推荐？",
      placeholder: "例如：新展开展 / 周末亲子讲解 / 暑期研学课；没有就留空。",
      help: "留空时按展馆研学的自动计划执行。"
    },
    product: {
      label: "本周是否有特殊产品 / 礼盒要推荐？",
      placeholder: "例如：端午伴手礼 / 新款文创冰箱贴 / 地域特产礼盒；没有就留空。",
      help: "留空时按产品/文创的自动计划执行。"
    },
    service: {
      label: "本周是否有特殊服务 / 套餐要推荐？",
      placeholder: "例如：暑期体验课 / 新客套餐 / 周末预约名额；没有就留空。",
      help: "留空时按本地服务的自动计划执行。"
    }
  };
  return copies[mode];
}

function emptyAccountForm(templates: Template[]) {
  return {
    name: "",
    accountParam: "",
    accountType: templates[0]?.typeKey || "restaurant",
    stage: "冷启动",
    personaBase: "",
    city: "",
    targetUsers: "",
    painPoints: "",
    contentDirections: "",
    businessGoals: "",
    monetization: "",
    referenceAccounts: "",
    materialCondition: "",
    taboos: ""
  };
}

function accountTypeDefaults(accountType: string, template?: Template) {
  const columns = template ? safeJsonArray(template.defaultColumns).join("、") : "";
  const common = {
    targetUsers: "有明确需求、正在比较选择、希望先看真实案例和价格边界的用户",
    painPoints: "不知道是否靠谱、价格是否透明、案例是否真实、怎么预约、效果是否能落地",
    contentDirections: columns || "真实案例、服务流程、价格问答、用户顾虑、素材展示",
    businessGoals: "提升收藏、增加咨询、建立信任、促进预约或到店转化",
    monetization: "咨询转化、预约服务、套餐成交、私域跟进",
    materialCondition: "门店/现场图、服务过程图、案例图、产品图、环境图、价格或活动信息图"
  };

  if (accountType === "restaurant") {
    return {
      targetUsers: "本地到店用户、游客、家庭聚餐用户、朋友聚会用户、想找特色餐厅的用户",
      painPoints: "不知道点什么、价格是否清楚、环境是否适合、停车交通是否方便、活动规则是否真实",
      contentDirections: "招牌菜种草、套餐场景、门店环境、菜单上新、在地风味、停车交通、顾客问答",
      businessGoals: "增加到店咨询、提升团购/套餐转化、推广主推菜、提升收藏和评论",
      monetization: "团购转化、预约到店、套餐售卖、节日活动、私域会员",
      materialCondition: "菜品图、菜单/价格表、包间/大厅图、门头图、停车场入口图、活动海报"
    };
  }

  if (accountType === "local_life_service") {
    return {
      targetUsers: "有明确本地服务需求、正在比较门店、希望先看真实案例和价格边界的用户",
      painPoints: "预算不透明、案例是否真实、现场效果是否落地、流程是否省心、服务是否靠谱",
      contentDirections: "真实案例、服务流程、风格细节、预算避坑、门店空间、预约问答、客户顾虑",
      businessGoals: "增加咨询、提升预约、展示案例、建立信任、促进到店沟通",
      monetization: "服务咨询、套餐预约、到店沟通、定制方案、私域跟进",
      materialCondition: "真实案例图、服务过程图、场地/门店环境图、客户授权图、价格套餐图、短视频素材"
    };
  }

  if (accountType === "wedding_planning") {
    return {
      targetUsers: "准备结婚的新人、正在比较婚礼服务的客户、重视审美风格的用户、需要预算透明的用户、本地到店咨询用户、老客转介绍用户",
      painPoints: "预算不透明、案例是否真实、现场效果是否落地、流程是否省心、婚礼风格是否适合自己、档期和价格是否清楚",
      contentDirections: "真实婚礼案例、婚礼服务流程、风格细节拆解、预算避坑、场地/门店空间、预约问答、客户顾虑",
      businessGoals: "增加咨询、提升预约、展示真实婚礼案例、建立信任、促进到店沟通、沉淀私域跟进",
      monetization: "婚礼服务咨询、套餐预约、到店沟通、定制方案、私域跟进",
      materialCondition: "真实婚礼案例图、婚礼服务过程图、场地/门店环境图、客户授权图、价格套餐图、短视频素材、资质/证书图"
    };
  }

  if (accountType === "cultural_tourism_destination") {
    return {
      targetUsers: "周末游客、亲子家庭、研学机构、城市微度假用户、外地旅行用户",
      painPoints: "值不值得去、怎么玩、交通票务是否方便、开放时间是否准确、是否适合亲子或拍照",
      contentDirections: "目的地动线、核心看点、活动现场、拍照机位、交通票务、避坑问答",
      businessGoals: "提升收藏、增加咨询、促进票务/活动/路线转化",
      monetization: "票务、活动报名、线路产品、研学团建、本地商户转化",
      materialCondition: "现场图、导览图、票务截图、活动海报、交通图、服务信息图"
    };
  }

  if (accountType === "hiking_diary") {
    return {
      targetUsers: "想找靠谱路线的新手户外用户、进阶徒步用户、周末出行用户",
      painPoints: "不知道路线难度、距离爬升、交通补给、季节窗口、是否适合自己",
      contentDirections: "路线日记、路线攻略、风景图集、装备复盘、交通补给、安全提醒",
      businessGoals: "提升收藏、增加路线咨询、沉淀关注和路线资料需求",
      monetization: "路线资料包、社群活动、装备合作、旅行咨询",
      materialCondition: "路线图、轨迹截图、真实现场图、关键路况图、装备图、交通补给截图"
    };
  }

  return common;
}

function accountChoiceOptions(accountType: string) {
  const common = {
    targetUsers: ["正在比较选择的用户", "希望先看真实案例的用户", "关注价格边界的用户", "本地到店咨询用户", "新客户"],
    businessGoals: ["提升收藏", "增加咨询", "建立信任", "促进预约", "促进到店转化", "沉淀私域"],
    materialCondition: ["门店/现场图", "服务过程图", "真实案例图", "产品图", "环境图", "价格或活动信息图"],
    taboos: ["不虚报价格/优惠", "不虚构资质", "不夸大服务效果", "不使用未授权素材"]
  };

  if (accountType === "restaurant") {
    return {
      targetUsers: ["本地到店用户", "游客", "家庭聚餐用户", "朋友聚会用户", "团建/宴请用户", "想找特色餐厅的用户"],
      businessGoals: ["增加到店咨询", "提升团购转化", "推广主推菜", "推广套餐", "提升收藏", "增加评论互动"],
      materialCondition: ["菜品图", "菜单/价格表", "包间图", "大厅图", "门头图", "停车场入口图", "活动海报"],
      taboos: ["不虚报价格和优惠", "不乱写营业时间和停车信息", "不夸大食材等级"]
    };
  }

  if (accountType === "local_life_service") {
    return {
      targetUsers: ["准备结婚的新人", "正在比较服务的客户", "重视审美风格的用户", "需要预算透明的用户", "本地到店咨询用户", "老客转介绍用户"],
      businessGoals: ["增加咨询", "提升预约", "展示真实案例", "建立信任", "推广套餐/活动", "促进到店沟通"],
      materialCondition: ["真实案例图", "服务过程图", "门店/场地环境图", "客户授权图", "价格套餐图", "短视频素材", "资质/证书图"],
      taboos: ["不虚报价格和档期", "不虚构资质", "不夸大服务效果", "不泄露客户隐私"]
    };
  }

  if (accountType === "wedding_planning") {
    return {
      targetUsers: ["准备结婚的新人", "正在比较婚礼服务的客户", "重视审美风格的用户", "需要预算透明的用户", "本地到店咨询用户", "老客转介绍用户"],
      businessGoals: ["增加咨询", "提升预约", "展示真实婚礼案例", "建立信任", "促进到店沟通", "沉淀私域跟进"],
      materialCondition: ["真实婚礼案例图", "婚礼服务过程图", "场地/门店环境图", "客户授权图", "价格套餐图", "短视频素材", "资质/证书图"],
      taboos: ["不虚报价格和档期", "不虚构场地/套餐/资质", "不夸大落地效果", "不泄露客户隐私"]
    };
  }

  if (accountType === "cultural_tourism_destination") {
    return {
      targetUsers: ["周末游客", "亲子家庭", "研学机构", "城市微度假用户", "外地旅行用户", "拍照打卡用户"],
      businessGoals: ["提升收藏", "增加咨询", "促进票务转化", "促进活动报名", "推广路线", "提升目的地认知"],
      materialCondition: ["现场图", "导览图", "票务截图", "活动海报", "交通图", "服务信息图", "游客授权图"],
      taboos: ["不乱写开放状态", "不虚报票价和活动时间", "不虚构交通和路线信息", "不使用未授权游客肖像"]
    };
  }

  if (accountType === "hiking_diary") {
    return {
      targetUsers: ["新手户外用户", "进阶徒步用户", "周末出行用户", "想找靠谱路线的用户", "亲子户外用户", "装备党"],
      businessGoals: ["提升收藏", "增加路线咨询", "沉淀关注", "推广路线资料", "建立专业信任", "促进社群活动"],
      materialCondition: ["路线图", "轨迹截图", "真实现场图", "关键路况图", "装备图", "交通补给截图", "天气/开放状态截图"],
      taboos: ["不虚报路线数据", "不乱写天气和开放状态", "不淡化安全风险", "不改变真实路况"]
    };
  }

  return common;
}

function autoAccountParam(name: string, accountType: string, count = 0) {
  const latin = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  if (latin) return latin;
  const normalizedName = name.toLowerCase();
  const prefix =
    accountType === "wedding_planning" || /婚礼|婚庆|婚纱|wedding/.test(normalizedName)
      ? "wedding"
      : accountType === "local_life_service"
        ? "service"
        : accountType.split("_")[0] || "brand";
  return `${prefix}-${String(count + 1).padStart(2, "0")}`;
}

function isGeneratedAccountParam(value: string) {
  return /^[a-z][a-z0-9-]*-\d{2}$/.test(value.trim());
}

function switchAccountTypeForm(form: ReturnType<typeof emptyAccountForm>, templates: Template[], nextType: string) {
  return {
    ...form,
    accountType: nextType,
    accountParam: !form.accountParam.trim() || isGeneratedAccountParam(form.accountParam) ? "" : form.accountParam
  };
}

function hydrateAccountForm(form: ReturnType<typeof emptyAccountForm>, templates: Template[], count = 0) {
  return {
    ...form,
    accountParam: form.accountParam.trim() || autoAccountParam(form.name, form.accountType, count)
  };
}

function buildLocalTemplates(): Template[] {
  return accountTypeTemplates.map((template, index) => ({
    id: index + 1,
    typeKey: template.typeKey,
    name: template.name,
    defaultColumns: JSON.stringify(template.defaultColumns),
    weeklyRatio: JSON.stringify(template.weeklyRatio)
  }));
}

function createClientId() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function slugifyClientName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || `account-${createClientId()}`;
}

function buildLocalAccount(
  form: ReturnType<typeof hydrateAccountForm>,
  templates: Template[],
  count: number
): Account {
  const id = createClientId();
  const template = templates.find((item) => item.typeKey === form.accountType);
  const slug = slugifyClientName(form.name || `account-${count + 1}`);
  const profilePath = `profiles/${slug}/AGENTS.md`;
  const assetsPath = `assets/${slug}`;
  const typeName = template?.name || form.accountType;
  const positioning = `${form.name}｜${typeName}`;
  const profileContent = `# ${form.name} AGENTS\n\n- 账号类型：${typeName}\n- 账号参数：${form.accountParam}\n- 城市：${form.city || "待补充"}\n- 用户：${form.targetUsers}\n- 痛点：${form.painPoints}\n- 方向：${form.contentDirections}\n- 禁忌：${form.taboos}\n`;

  return {
    id,
    name: form.name,
    accountParam: form.accountParam,
    accountType: form.accountType,
    stage: form.stage,
    personaBase: form.personaBase,
    city: form.city,
    targetUsers: form.targetUsers,
    painPoints: form.painPoints,
    contentDirections: form.contentDirections,
    businessGoals: form.businessGoals,
    monetization: form.monetization,
    referenceAccounts: form.referenceAccounts,
    materialCondition: form.materialCondition,
    taboos: form.taboos,
    profilePath,
    assetsPath,
    strategy: {
      markdown: `# ${form.name} 策划案\n\n- 账号定位：${positioning}\n- 目标：${form.businessGoals}\n- 变现：${form.monetization}\n`,
      positioning,
      execGuide: "浏览器本地模式：只生成方案，不自动发布。"
    },
    profile: {
      content: profileContent,
      version: 1,
      path: profilePath
    },
    referenceResearches: [],
    imageStyleStudies: [],
    interactionPlans: [],
    postReviews: [],
    expertRules: [],
    industryKnowledgeResearches: [],
    assets: [],
    weeklyPlans: []
  };
}

function mapBackendAccountToUiAccount(account: BackendAccountDetail): Account {
  const assets = (account.assets || []).map((asset) => mapBackendAssetToUiAsset(asset));
  const weeklyPlans = (account.weeklyPlans || []).map((plan) => ({
    id: plan.id || Date.now(),
    weekStart: plan.weekStart,
    theme: plan.theme,
    goal: plan.goal,
    frequency: plan.frequency,
    ratio: plan.ratio || "",
    testHypothesis: plan.testHypothesis,
    commercializationMove: plan.commercializationMove,
    interactionGoal: plan.interactionGoal,
    availableAssets: plan.availableAssets,
    taboos: plan.taboos,
    status: plan.status || "draft",
    knowledgeSnapshotId: plan.knowledgeSnapshotId || "",
    noteTasks: normalizeWeeklyTaskMedia((plan.noteTasks || []).map((task) => ({
      id: task.id || Date.now(),
      publishAt: task.publishAt || "",
      contentType: task.contentType || "",
      contentGoal: task.contentGoal || "",
      topicTitle: task.topicTitle || "",
      targetUser: task.targetUser || "",
      painPoint: task.painPoint || "",
      coreView: task.coreView || "",
      writingStyleName: task.writingStyleName || "",
      writingStyleReference: task.writingStyleReference || "",
      type: task.type === "video_text" ? "video_text" as const : "image_text" as const,
      requiredMaterials: task.requiredMaterials || "",
      recommendedAssets: task.recommendedAssets || "",
      coverCopyDirection: task.coverCopyDirection || "",
      commentHook: task.commentHook || "",
      expectedGoal: task.expectedGoal || "",
      status: task.status || "待生成",
      knowledgeSourceKeys: task.knowledgeSourceKeys || [],
      bodyDraft: task.bodyDraft || "",
      plan: task.plan || ""
    })), (plan.noteTasks || []).filter((task) => task.type === "video_text").length)
  }));
  return {
    id: account.id,
    name: account.name,
    accountParam: account.accountParam,
    accountType: account.accountType,
    stage: account.stage,
    personaBase: account.personaBase,
    city: account.city,
    targetUsers: account.targetUsers,
    painPoints: account.painPoints,
    contentDirections: account.contentDirections,
    businessGoals: account.businessGoals,
    monetization: account.monetization,
    referenceAccounts: account.referenceAccounts,
    materialCondition: account.materialCondition,
    taboos: account.taboos,
    profilePath: account.profilePath || "",
    assetsPath: account.assetsPath || "",
    strategy: account.strategyMarkdown
      ? {
          markdown: account.strategyMarkdown,
          positioning: account.strategyPositioning || `${account.name}｜${account.accountType}`,
          execGuide: account.strategyExecGuide || ""
        }
      : null,
    profile: account.profilePath
      ? { content: account.profileContent || "", version: account.profileVersion || 1, path: account.profilePath }
      : null,
    referenceResearches: [],
    imageStyleStudies: [],
    interactionPlans: [],
    postReviews: (account.postReviews || []).map((review) => ({ ...review })),
    expertRules: (account.expertRules || []).map((rule) => ({ ...rule })),
    industryKnowledgeResearches: [],
    assets,
    weeklyPlans
  };
}

function buildBackendFallbackStrategyMarkdown(account: Pick<Account, "name" | "accountType" | "businessGoals" | "contentDirections">) {
  return `# ${account.name || "该账号"} 账号运营策划方案

## 账号定位
${account.name || "该账号"}｜${account.accountType || "通用账号"}

## 目标
${account.businessGoals || "提升收藏、咨询和转化"}

## 内容方向
${account.contentDirections || "真实素材、用户痛点、服务信息、风险边界"}

## 风险边界
只生成方案，不自动发布；正文允许进行创作性演绎，账号操作和素材路径仍按系统安全模式执行。`;
}

function toBackendAsset(asset: Asset): BackendAsset {
  return {
    id: asset.id,
    filePath: asset.filePath,
    fileUrl: asset.fileUrl || "",
    fileType: asset.fileType,
    sourceType: asset.sourceType,
    location: asset.location || "",
    shotAt: asset.shotAt || "",
    tags: asset.tags || "",
    suitableTypes: asset.suitableTypes || "",
    coverReady: Boolean(asset.coverReady),
    used: Boolean(asset.used),
    authorizationState: asset.authorizationState || "",
    riskNotes: asset.riskNotes || "",
    width: asset.width || 0,
    height: asset.height || 0,
    sizeBytes: asset.sizeBytes || 0,
    hash: asset.hash || ""
  };
}

function mapBackendAssetToUiAsset(asset: BackendAsset, fallback?: Partial<Asset>): Asset {
  return {
    id: asset.id,
    filePath: asset.filePath,
    fileUrl: asset.fileUrl || fallback?.fileUrl || "",
    fileType: asset.fileType,
    sourceType: asset.sourceType,
    location: asset.location || "",
    shotAt: asset.shotAt || "",
    tags: asset.tags || "",
    suitableTypes: asset.suitableTypes || "",
    coverReady: Boolean(asset.coverReady),
    used: Boolean(asset.used),
    authorizationState: asset.authorizationState || fallback?.authorizationState || "",
    riskNotes: asset.riskNotes || "",
    width: asset.width || 0,
    height: asset.height || 0,
    sizeBytes: asset.sizeBytes || 0,
    hash: asset.hash || ""
  };
}

function toBackendNoteTask(task: NoteTask): BackendNoteTask {
  const knowledgeSourceKeys = task.knowledgeSourceKeys?.filter(Boolean) || [];
  return {
    id: task.id,
    type: task.type,
    publishAt: task.publishAt,
    contentType: task.contentType,
    contentGoal: task.contentGoal,
    topicTitle: task.topicTitle,
    targetUser: task.targetUser,
    painPoint: task.painPoint,
    coreView: task.coreView,
    writingStyleName: task.writingStyleName,
    writingStyleReference: task.writingStyleReference,
    bodyStructure: "",
    requiredMaterials: task.requiredMaterials,
    recommendedAssets: task.recommendedAssets,
    coverCopyDirection: task.coverCopyDirection,
    commentHook: task.commentHook,
    expectedGoal: task.expectedGoal,
    status: task.status,
    ...(knowledgeSourceKeys.length ? { knowledgeSourceKeys } : {}),
    bodyDraft: task.bodyDraft || "",
    plan: task.plan || ""
  };
}

function toBackendWeeklyPlan(plan: WeeklyPlan): BackendWeeklyPlan {
  return {
    weekStart: plan.weekStart,
    theme: plan.theme,
    goal: plan.goal,
    frequency: plan.frequency,
    ratio: plan.ratio,
    testHypothesis: plan.testHypothesis,
    commercializationMove: plan.commercializationMove,
    interactionGoal: plan.interactionGoal,
    availableAssets: plan.availableAssets,
    taboos: plan.taboos,
    status: plan.status || "draft",
    ...(plan.knowledgeSnapshotId ? { knowledgeSnapshotId: plan.knowledgeSnapshotId } : {}),
    noteTasks: plan.noteTasks.map((task) => {
      const backendTask = toBackendNoteTask(task);
      delete backendTask.id;
      return backendTask;
    })
  };
}

function needsAiStrategy(account: Account) {
  const markdown = account.strategy?.markdown?.trim();
  if (!markdown) return true;
  return markdown === buildBackendFallbackStrategyMarkdown(account).trim();
}

function mergeBackendAccountWithLocalState(account: Account, local?: Account): Account {
  if (!local) return account;

  return {
    ...account,
    referenceResearches: local.referenceResearches?.length ? local.referenceResearches : account.referenceResearches,
    imageStyleStudies: local.imageStyleStudies?.length ? local.imageStyleStudies : account.imageStyleStudies,
    interactionPlans: local.interactionPlans?.length ? local.interactionPlans : account.interactionPlans,
    postReviews: account.postReviews,
    expertRules: account.expertRules,
    industryKnowledgeResearches: local.industryKnowledgeResearches?.length
      ? local.industryKnowledgeResearches
      : account.industryKnowledgeResearches,
    assets: account.assets,
    weeklyPlans: account.weeklyPlans
  };
}

const ASYNC_ROUTE_POLL_INTERVAL_MS = 30_000;
const ASYNC_ROUTE_MAX_POLL_ATTEMPTS = 20;

async function readApiJsonResponse(response: Response, fallbackMessage: string): Promise<Record<string, any>> {
  const responseText = await response.text();
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const statusLabel = `HTTP ${response.status}`;

  if (!responseText.trim()) {
    throw new Error(`${fallbackMessage}（${statusLabel}，服务返回了空响应，可能是网关超时或连接中断）。`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error(`${fallbackMessage}（${statusLabel}，服务返回了非 JSON 响应，可能是网关错误）。`);
  }

  try {
    return JSON.parse(responseText) as Record<string, any>;
  } catch {
    throw new Error(`${fallbackMessage}（${statusLabel}，服务返回的 JSON 无法解析）。`);
  }
}

async function waitForNextAsyncRoutePoll(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function XhsMasterApp() {
  const localTemplates = useMemo(() => buildLocalTemplates(), []);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>("dashboard");
  const [accountForm, setAccountForm] = useState(emptyAccountForm([]));
  const [profileContent, setProfileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [toast, setToast] = useState<FeedbackDialog | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyNoticeTimerRef = useRef<number | null>(null);
  const [currentUser, setCurrentUser] = useState<LoginResponse | null>(null);
  const [promptResults, setPromptResults] = useState<Record<number, PromptResult>>({});
  // 三版文案仅保存在当前页面会话中，不同步到浏览器工作区或后端。
  const [draftVariants, setDraftVariants] = useState<Record<number, DraftVariant[]>>({});
  const [imagePromptResults, setImagePromptResults] = useState<Record<number, ImagePromptResult>>({});
  const [videoPromptResults, setVideoPromptResults] = useState<Record<number, VideoPromptResult>>({});
  const [batchImagePostResults, setBatchImagePostResults] = useState<Record<number, BatchImagePostsResult>>({});
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [manifest, setManifest] = useState<{ content: string; validation: string; path: string } | null>(null);
  const [referenceDraft, setReferenceDraft] = useState<{
    accountId?: number;
    research?: ReferenceResearch;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    researchPrompt?: string;
    summary?: { summaryMarkdown: string; contentFeatures: string; personaInsights: string; strategyInsights: string; writingStyleInsights: string };
  }>({});
  const [imageStyleDraft, setImageStyleDraft] = useState<{
    study?: ImageStyleStudy;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    researchPrompt?: string;
    summary?: { summaryMarkdown: string; styleBrief: string[] };
  }>({});
  const [interactionDraft, setInteractionDraft] = useState<{
    plan?: InteractionPlan;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    discoveryPrompt?: string;
    commentPrompt?: string;
    summary?: { targetUsersMarkdown: string; commentDraftsMarkdown: string };
  }>({});
  const [industryLearningDraft, setIndustryLearningDraft] = useState<{
    research?: IndustryKnowledgeResearch;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    researchPrompt?: string;
  }>({});
  const [browserReady, setBrowserReady] = useState(false);

  const selected = useMemo(() => accounts.find((account) => account.id === selectedId) ?? accounts[0], [accounts, selectedId]);
  const latestPlan = selected?.weeklyPlans?.[0];
  const selectedNote = latestPlan?.noteTasks?.find((task) => task.id === selectedNoteId) ?? latestPlan?.noteTasks?.[0];

  useEffect(() => {
    const hasToken = Boolean(getToken());
    setCurrentUser(getUser());
    setTemplates(localTemplates);
    loadBrowserWorkspace()
      .then((snapshot) => {
        if (!hasToken) {
          setAccounts((snapshot.accounts as Account[]) || []);
          setSelectedId(typeof snapshot.selectedId === "number" ? snapshot.selectedId : null);
        } else {
          setAccounts([]);
          setSelectedId(null);
        }
        setTemplates((snapshot.templates as Template[])?.length ? (snapshot.templates as Template[]) : localTemplates);
        setPromptResults((snapshot.promptResults as Record<number, PromptResult>) || {});
        setImagePromptResults((snapshot.imagePromptResults as Record<number, ImagePromptResult>) || {});
        setVideoPromptResults((snapshot.videoPromptResults as Record<number, VideoPromptResult>) || {});
        setBatchImagePostResults((snapshot.batchImagePostResults as Record<number, BatchImagePostsResult>) || {});
        setReferenceDraft((snapshot.referenceDraft as typeof referenceDraft) || {});
        setImageStyleDraft((snapshot.imageStyleDraft as typeof imageStyleDraft) || {});
        setInteractionDraft((snapshot.interactionDraft as typeof interactionDraft) || {});
        setIndustryLearningDraft((snapshot.industryLearningDraft as typeof industryLearningDraft) || {});
        return snapshot;
      })
      .then(async (snapshot) => {
        if (!hasToken) return;
        const backendAccounts = await fetchBackendAccounts().catch(() => []);
        if (!backendAccounts.length) {
          setAccounts([]);
          setSelectedId(null);
          setSelectedNoteId(null);
          setProfileContent("");
          return;
        }

        const localAccountMap = new Map((((snapshot.accounts as Account[]) || [])).map((account) => [account.id, account]));
        const mappedAccounts = backendAccounts.map((account) =>
          mergeBackendAccountWithLocalState(mapBackendAccountToUiAccount(account), localAccountMap.get(account.id))
        );
        setAccounts(mappedAccounts);
        if (!snapshot?.selectedId && mappedAccounts[0]) {
          setSelectedId(mappedAccounts[0].id);
        }
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : "加载账号列表失败。", "error");
      })
      .finally(() => setBrowserReady(true));
  }, [localTemplates]);

  useEffect(() => {
    if (!browserReady) return;
    saveBrowserWorkspace({
      accounts,
      templates,
      selectedId,
      promptResults,
      imagePromptResults,
      videoPromptResults,
      batchImagePostResults,
      referenceDraft,
      imageStyleDraft,
      interactionDraft,
      industryLearningDraft
    }).catch(() => {
      // 工作区缓存写失败时不打断当前操作，仅在后续用户动作中继续使用内存态。
    });
  }, [
    browserReady,
    accounts,
    templates,
    selectedId,
    promptResults,
    imagePromptResults,
    videoPromptResults,
    batchImagePostResults,
    referenceDraft,
    imageStyleDraft,
    interactionDraft,
    industryLearningDraft
  ]);

  useEffect(() => {
    if (templates.length && !accountForm.accountType) setAccountForm(emptyAccountForm(templates));
  }, [templates, accountForm.accountType]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    if (copyNoticeTimerRef.current !== null) window.clearTimeout(copyNoticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (selected?.profile?.content) setProfileContent(selected.profile.content);
    if (selected && selectedId === null) setSelectedId(selected.id);
    if (latestPlan?.noteTasks?.[0] && !selectedNoteId) setSelectedNoteId(latestPlan.noteTasks[0].id);
  }, [selected, selectedId, latestPlan, selectedNoteId]);

  async function refresh() {
    const snapshot = await loadBrowserWorkspace();
    const nextTemplates = (snapshot.templates as Template[])?.length ? (snapshot.templates as Template[]) : localTemplates;
    const localAccounts = (snapshot.accounts as Account[]) || [];
    let nextAccounts = localAccounts;

    if (getToken()) {
      const backendAccounts = await fetchBackendAccounts().catch(() => null);
      if (backendAccounts) {
        const localAccountMap = new Map(localAccounts.map((account) => [account.id, account]));
        nextAccounts = backendAccounts.map((account) =>
          mergeBackendAccountWithLocalState(mapBackendAccountToUiAccount(account), localAccountMap.get(account.id))
        );
      }
    }

    setAccounts(nextAccounts);
    setTemplates(nextTemplates);
    setSelectedId((current) => {
      if (!nextAccounts.length) return null;
      if (current && nextAccounts.some((account) => account.id === current)) return current;
      return nextAccounts[0].id;
    });
    if (nextTemplates?.length) setAccountForm((current) => (current.accountType ? current : emptyAccountForm(nextTemplates)));
    return nextAccounts;
  }

  function replaceAccount(nextAccount: Account) {
    setAccounts((current) => current.map((account) => (account.id === nextAccount.id ? nextAccount : account)));
  }

  function updateSelectedAccount(mutator: (account: Account) => Account) {
    if (!selected) return;
    setAccounts((current) => current.map((account) => (account.id === selected.id ? mutator(account) : account)));
  }

  async function waitForAsyncRouteResult<T>(url: string, uuid: string) {
    for (let attempt = 0; attempt < ASYNC_ROUTE_MAX_POLL_ATTEMPTS; attempt += 1) {
      await waitForNextAsyncRoutePoll(ASYNC_ROUTE_POLL_INTERVAL_MS);
      const res = await authenticatedFetch(`${url}?uuid=${encodeURIComponent(uuid)}`, {
        method: "GET",
        headers: { "content-type": "application/json" },
        cache: "no-store"
      });
      const data = await readApiJsonResponse(res, "任务结果查询失败");
      if (!res.ok) {
        throw new Error(data.error || "任务结果查询失败。");
      }
      if (data.status === "completed") {
        return data.result as T;
      }
      if (data.status === "failed") {
        throw new Error(data.error || "任务执行失败。");
      }
      if (data.status !== "pending") {
        throw new Error("任务状态异常。");
      }
    }

    throw new Error("处理超时，请稍后重试。");
  }

  async function generateAndPersistStrategy(account: Account) {
    const result = await generateStrategyWithBrowserLlm(account);

    await updateBackendAccount({
      id: account.id,
      strategyMarkdown: result.data.markdown,
      profileContent: result.data.agentsMdContent
    });

    return result as {
      usedLlm: boolean;
      error?: string | null;
      data: { markdown: string; positioning: string; execGuide: string; agentsMdContent: string };
    };
  }

  async function createAccount() {
    setLoading(true);
    try {
      const payload = hydrateAccountForm(accountForm, templates, accounts.length);
      const created = await createBackendAccount(payload);
      const createdDetail = await fetchBackendAccountDetail(created.id);
      const createdAccount = mapBackendAccountToUiAccount(createdDetail);
      const strategyResult = await generateAndPersistStrategy(createdAccount);
      const nextAccounts = await refresh();
      const persistedAccount = nextAccounts.find((account) => account.id === created.id) ?? createdAccount;

      setSelectedId(created.id);
      setActiveTab("strategy");
      setAccountForm(emptyAccountForm(templates));
      if (persistedAccount.profile?.content) {
        setProfileContent(persistedAccount.profile.content);
      }
      showToast(
        strategyResult.usedLlm ? "账号已创建，AI 策划案已生成。" : strategyResult.error || "账号已创建，并已生成默认策划案。",
        strategyResult.usedLlm || !strategyResult.error ? "success" : "error"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "创建失败", "error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (!selected) return;
    const confirmed = window.confirm(
      `确定删除账号「${selected.name}」吗？\n\n相关策划案、计划、草稿和素材记录也会一起移除。`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteBackendAccount(selected.id);
      const remaining = accounts.filter((account) => account.id !== selected.id);
      const nextAccountId = remaining[0]?.id ?? null;
      setAccounts(remaining);
      setSelectedId(nextAccountId);
      setProfileContent("");
      await refresh();
      setSelectedNoteId(null);
      setPromptResults({});
      setImagePromptResults({});
      setBatchImagePostResults({});
      setReferenceDraft({});
      setImageStyleDraft({});
      setInteractionDraft({});
      setIndustryLearningDraft({});
      setActiveTab(nextAccountId ? "dashboard" : "accounts");
      showToast("账号已删除。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除账号失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!selected) return;
    setLoading(true);
    updateSelectedAccount((account) => ({
      ...account,
      profile: account.profile
        ? { ...account.profile, content: profileContent, version: (account.profile.version || 0) + 1 }
        : { content: profileContent, version: 1, path: account.profilePath }
    }));
    setLoading(false);
    showToast("配置文件已保存。", "success");
  }

  async function uploadAsset(form: HTMLFormElement, files: File[], clearFiles?: () => void) {
    if (!selected) return;
    const formData = new FormData(form);
    if (!files.length) {
      showToast("请先选择要上传的图片。", "error");
      return;
    }
    try {
      setLoading(true);
      setLoadingAction("uploadAsset");
      const sourceType = String(formData.get("sourceType") || "真实素材");
      const tags = String(formData.get("tags") || "");
      const suitableTypes = String(formData.get("suitableTypes") || "");
      const coverReady = formData.get("coverReady") === "true";
      const riskNotes = String(formData.get("riskNotes") || "");

      let uploadedAssets: Asset[] = [];
      if (files.length) {
        const token = getToken();
        const user = getUser();
        if (!token || !user) {
          throw new Error("登录状态失效，请重新登录后再上传。");
        }

        const uploadForm = new FormData();
        uploadForm.set("accountId", String(selected.id));
        uploadForm.set("sourceType", sourceType);
        uploadForm.set("tags", tags);
        uploadForm.set("suitableTypes", suitableTypes);
        uploadForm.set("riskNotes", riskNotes);
        if (coverReady) uploadForm.set("coverReady", "true");
        for (const file of files) uploadForm.append("files", file);

        const uploadRes = await authenticatedFetch("/api/assets/upload", {
          method: "POST",
          headers: buildProxyHeaders(),
          body: uploadForm
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "上传图片失败。");
        }
        uploadedAssets = uploadData.assets || [];
      }
      const nextAssets = [
        ...uploadedAssets.map((asset) => ({
          ...asset,
          sourceType: asset.sourceType || sourceType,
          tags: asset.tags || tags,
          suitableTypes: asset.suitableTypes || suitableTypes,
          coverReady: typeof asset.coverReady === "boolean" ? asset.coverReady : coverReady,
          riskNotes: asset.riskNotes || riskNotes
        }))
      ];
      const savedAssets = await saveBackendAssets(selected.id, nextAssets.map((asset) => toBackendAsset(asset as Asset)));
      const mappedSavedAssets = savedAssets.map((asset, index) =>
        mapBackendAssetToUiAsset(asset, nextAssets[index] as Partial<Asset> | undefined)
      );

      updateSelectedAccount((account) => ({
        ...account,
        assets: [
          ...mappedSavedAssets.filter((asset) => !account.assets.some((current) => current.filePath === asset.filePath)),
          ...account.assets
        ]
      }));
      form.reset();
      clearFiles?.();
      showToast(`已上传 ${mappedSavedAssets.length} 个素材。`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "上传素材失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function generateManifest() {
    if (!selected) return;
    const res = await authenticatedFetch("/api/assets/manifest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: selected, assets: selected.assets })
    });
    const data = await res.json();
    setManifest(data);
    showToast("素材清单已生成。", "success");
  }

  async function generateWeeklyPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries()) as Record<string, FormDataEntryValue>;
    const frequency = clampWeeklyFrequency(payload.frequency);
    const videoCount = Math.max(0, Math.min(Number.parseInt(String(payload.videoCount || "0"), 10) || 0, frequency));
    const ratio = "";
    payload.frequency = String(frequency);
    payload.ratio = ratio;
    const weeklyFocus = String(payload.weeklyFocus || "").trim();
    const selectedObjectiveIds = String(payload.selectedObjectiveIds || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const selectedObjectives = selectedWeeklyPlanningObjectives(selected.accountType, selectedObjectiveIds);
    if (weeklyFocus) {
      payload.theme = `${String(payload.theme || "本周主题")}｜本周重点：${weeklyFocus}`;
      payload.goal = `${String(payload.goal || "验证内容方向并积累可复用素材")}；优先围绕本周重点「${weeklyFocus}」安排内容。`;
    }
    setLoading(true);
    setLoadingAction("generateWeeklyPlan");
    try {
      const knowledgeQueries = weeklyFocus
        ? [`${weeklyFocus}；业务事实、特点、可表达细节、不可虚构边界`]
        : selectedObjectives.map((objective) => objective.knowledgeRetrievalQuery).filter(Boolean);
      let knowledgeSnapshotId = "";
      if (knowledgeQueries.length) {
        try {
          const snapshot = await retrieveBackendKnowledgeSnapshot(selected.id, knowledgeQueries);
          if (snapshot?.hasReferences && snapshot.status.toLowerCase() === "ready") {
            knowledgeSnapshotId = snapshot.snapshotId;
          }
        } catch (error) {
          console.warn("[knowledge-base] retrieval skipped", error);
        }
      }
      const plan = {
        id: Date.now(),
        accountId: selected.id,
        weekStart: String(payload.weekStart || new Date().toISOString().slice(0, 10)),
        theme: String(payload.theme || "本周主题"),
        goal: String(payload.goal || "验证内容方向并积累可复用素材"),
        frequency,
        ratio,
        testHypothesis: String(payload.testHypothesis || ""),
        commercializationMove: String(payload.commercializationMove || ""),
        interactionGoal: String(payload.interactionGoal || ""),
        availableAssets: "",
        taboos: String(payload.taboos || ""),
        knowledgeSnapshotId,
        noteTasks: []
      };
      const weeklyPlanInput = {
        theme: plan.theme,
        goal: plan.goal,
        frequency: plan.frequency,
        videoCount,
        ratio: plan.ratio,
        testHypothesis: plan.testHypothesis,
        commercializationMove: plan.commercializationMove,
        interactionGoal: plan.interactionGoal,
        availableAssets: plan.availableAssets,
        taboos: plan.taboos
      };
      const recentTopicGroups = weeklyFocus
        ? []
        : collectRecentWeeklyTopicGroups(selected.weeklyPlans || [], plan.weekStart);
      const weeklyInput = {
        ...weeklyPlanInput,
        videoCount,
        weeklyFocus,
        selectedObjectives,
        recentTopicGroups
      };
      const llmResult = await generateWeeklyTasksWithBrowserLlm({
        account: selected,
        strategy: selected.strategy || null,
        weeklyPlan: { id: plan.id },
        weeklyInput,
        taskCount: frequency,
        knowledgeSnapshotId
      });
      const nextPlan = {
        ...plan,
        status: "draft",
        noteTasks: llmResult.data.map((task, index) => ({ ...task, id: Date.now() + index, bodyDraft: "", plan: "" }))
      };
      const savedPlan = await saveBackendWeeklyPlan(selected.id, toBackendWeeklyPlan(nextPlan));
      const mappedSavedPlan = mapBackendAccountToUiAccount({
        ...selected,
        strategyMarkdown: selected.strategy?.markdown || "",
        strategyPositioning: selected.strategy?.positioning || "",
        strategyExecGuide: selected.strategy?.execGuide || "",
        profileContent: selected.profile?.content || "",
        profileVersion: selected.profile?.version || 1,
        assets: selected.assets.map(toBackendAsset),
        weeklyPlans: [savedPlan]
      } as unknown as BackendAccountDetail).weeklyPlans[0];
      updateSelectedAccount((account) => ({
        ...account,
        weeklyPlans: [mappedSavedPlan, ...(account.weeklyPlans || []).filter((item) => item.id !== mappedSavedPlan.id)]
      }));
      setSelectedNoteId(mappedSavedPlan.noteTasks?.[0]?.id ?? null);
      setActiveTab("prompts");
      showToast("本周内容计划已生成。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成计划失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function changeNoteTaskType(task: NoteTask, type: NoteTask["type"]) {
    if (!selected || !latestPlan || task.type === type) return;
    if (task.plan?.trim() && !window.confirm("切换帖子类型会清空当前已生成的图片或视频方案，是否继续？")) return;
    setLoading(true);
    setLoadingAction(`changeTaskType-${task.id}`);
    try {
      const normalizedTask = normalizeWeeklyTaskMedia([{ ...task, type }], type === "video_text" ? 1 : 0)[0];
      const saved = await saveBackendNoteTask(selected.id, latestPlan.id, toBackendNoteTask({
        ...normalizedTask,
        requiredMaterials: type === "video_text" ? "视频笔记：可直接使用 1 个视频，或选择 2-6 张素材库图片生成视频。" : "图文笔记：按选题准备真实图片或 AI 辅助图。",
        plan: "",
        status: "待生成方案"
      }));
      updateSelectedAccount((account) => ({
        ...account,
        weeklyPlans: account.weeklyPlans.map((plan) => plan.id !== latestPlan.id ? plan : {
          ...plan,
          noteTasks: plan.noteTasks.map((item) => item.id === task.id ? { ...item, ...saved } : item)
        })
      }));
      setImagePromptResults((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setVideoPromptResults((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setPromptResults((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setDraftVariants((current) => { const next = { ...current }; delete next[task.id]; return next; });
      showToast(`已切换为${type === "video_text" ? "视频" : "图文"}笔记。`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "切换帖子类型失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function prepareReferenceResearch() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/reference-research`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare", account: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成爆款研究失败。");
      setReferenceDraft({ accountId: selected.id, research: data.research, commands: data.commands, researchPrompt: data.researchPrompt });
      setLoading(false);
      showToast("爆款研究已生成。", "success");
    } catch (error) {
      setLoading(false);
      showToast(error instanceof Error ? error.message : "生成爆款研究失败。", "error");
    }
  }

  async function saveReferenceResearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    setLoading(true);
    setLoadingAction("saveReferenceResearch");
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/reference-research`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-results",
          account: selected,
          researchId: referenceDraft.accountId === selected.id
            ? referenceDraft.research?.id || selected.referenceResearches?.[0]?.id
            : selected.referenceResearches?.[0]?.id,
          ...payload
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存参考账号研究失败。");
      const resolved = data.async && data.uuid
        ? await waitForAsyncRouteResult<{
          research: ReferenceResearch;
          summary: { summaryMarkdown: string; contentFeatures: string; personaInsights: string; strategyInsights: string; writingStyleInsights: string };
          account?: { referenceAccounts: string; strategy?: Account["strategy"]; profile?: Account["profile"] };
        }>(`/api/accounts/${selected.id}/reference-research`, data.uuid)
      : data;
      setReferenceDraft((current) => ({ ...current, accountId: selected.id, research: resolved.research, summary: resolved.summary }));
      if (resolved.account) {
        updateSelectedAccount((account) => ({
          ...account,
          referenceAccounts: resolved.account.referenceAccounts,
          strategy: resolved.account.strategy || account.strategy,
          profile: resolved.account.profile || account.profile,
          referenceResearches: [
            resolved.research,
            ...(account.referenceResearches || []).filter((item) => item.id !== resolved.research.id)
          ]
        }));
        await updateBackendAccount({
          id: selected.id,
          referenceAccounts: resolved.account.referenceAccounts,
          strategyMarkdown: resolved.account.strategy?.markdown || "",
          profileContent: resolved.account.profile?.content || ""
        });
      }
      setProfileContent(resolved.account?.profile?.content || profileContent);
      showToast("已基于爆款研究增强策划案和配置文件。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存参考账号研究失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function prepareImageStyleStudy() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/image-style-study`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare", account: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成图片风格研究包失败。");
      setImageStyleDraft({ study: data.study, commands: data.commands, researchPrompt: data.researchPrompt });
      showToast("图片风格研究已生成。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成图片风格研究包失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveImageStyleStudy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/image-style-study`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-results",
          studyId: imageStyleDraft.study?.id || selected.imageStyleStudies?.[0]?.id,
          account: selected,
          ...payload
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存图片风格研究失败。");
      const resolved = data.async && data.uuid
        ? await waitForAsyncRouteResult<{
            study: ImageStyleStudy;
            summary: { summaryMarkdown: string; styleBrief: string[] };
            warning?: string;
          }>(`/api/accounts/${selected.id}/image-style-study`, data.uuid)
        : data;
      setImageStyleDraft((current) => ({ ...current, study: resolved.study, summary: resolved.summary }));
      updateSelectedAccount((account) => ({
        ...account,
        imageStyleStudies: [resolved.study, ...(account.imageStyleStudies || []).filter((item) => item.id !== resolved.study.id)]
      }));
      showToast(resolved.warning || "图片风格研究已总结，后续图片方案会自动引用。", resolved.warning ? "error" : "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存图片风格研究失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function prepareInteractionPlan(noteTaskId?: number | null, options?: { publishedNoteUrl?: string; interactionGoal?: string }) {
    if (!selected) return;
    setLoading(true);
    setLoadingAction("prepareInteractionPlan");
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/interaction-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          account: selected,
          noteTask: selectedNote || null,
          noteTaskId: noteTaskId || selectedNote?.id || null,
          publishedNoteUrl: options?.publishedNoteUrl || "",
          interactionGoal: options?.interactionGoal || ""
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成目标用户互动研究包失败。");
      setInteractionDraft({
        plan: data.plan,
        commands: data.commands,
        discoveryPrompt: data.openclawTask || data.discoveryPrompt,
        commentPrompt: data.commentPrompt
      });
      updateSelectedAccount((account) => ({
        ...account,
        interactionPlans: [data.plan, ...(account.interactionPlans || []).filter((item) => item.id !== data.plan.id)]
      }));
      showToast("智能体互动执行指令已生成。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成目标用户互动研究包失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function saveInteractionResults(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/interaction-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-results",
          account: selected,
          noteTask: selectedNote || null,
          planId: interactionDraft.plan?.id || selected.interactionPlans?.[0]?.id,
          noteTaskId: selectedNote?.id || null,
          ...payload
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存目标用户互动结果失败。");
      const resolved = data.async && data.uuid
        ? await waitForAsyncRouteResult<{
            plan: InteractionPlan;
            summary: { targetUsersMarkdown: string; commentDraftsMarkdown: string };
            warning?: string;
          }>(`/api/accounts/${selected.id}/interaction-plan`, data.uuid)
        : data;
      setInteractionDraft((current) => ({ ...current, plan: resolved.plan, summary: resolved.summary }));
      updateSelectedAccount((account) => ({
        ...account,
        interactionPlans: [resolved.plan, ...(account.interactionPlans || []).filter((item) => item.id !== resolved.plan.id)]
      }));
      showToast(resolved.warning || "目标用户互动策略已生成。", resolved.warning ? "error" : "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存目标用户互动结果失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function generateDraftVariants(task: NoteTask, controls: GenerationControls = {}): Promise<DraftVariant[] | null> {
    if (!selected || !latestPlan) return null;
    if (!task.plan?.trim()) {
      showToast(task.type === "video_text" ? "请先生成视频方案，再生成三个版本。" : "请先生成单篇图片方案，再生成三个版本。", "error");
      return null;
    }
    const manageLoading = controls.manageLoading ?? true;
    if (manageLoading) setLoading(true);
    setLoadingAction(controls.loadingAction || "generateDraftVariants");
    try {
      let accountForPrompt = selected;
      try {
        const latestAccount = mapBackendAccountToUiAccount(await fetchBackendAccountDetail(selected.id));
        accountForPrompt = mergeBackendAccountWithLocalState(latestAccount, selected);
        updateSelectedAccount(() => accountForPrompt);
      } catch {
        // 账号详情刷新失败时，继续使用当前客户端状态生成文案。
      }
      const res = await authenticatedFetch(`/api/note-tasks/${task.id}/draft-variants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: accountForPrompt, noteTask: task, weeklyPlan: latestPlan })
      });
      const data = await readApiJsonResponse(res, "生成三个版本失败");
      if (!res.ok) throw new Error(data.error || "后端 AI 未能生成三个版本。");
      const resolved = data.async && data.uuid
        ? await waitForAsyncRouteResult<{ variants: DraftVariant[] }>(`/api/note-tasks/${task.id}/draft-variants`, data.uuid)
        : data as { variants?: DraftVariant[] };
      const variants = Array.isArray(resolved.variants) ? resolved.variants : [];
      if (variants.length !== 3) throw new Error("后端 AI 未返回完整的三个版本。");
      setDraftVariants((current) => ({ ...current, [task.id]: variants }));
      if (controls.showSuccessToast ?? true) showToast("已生成三个标题和正文版本，请选择喜欢的版本。", "success");
      return variants;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成三个版本失败。", "error");
      return null;
    } finally {
      if (manageLoading) {
        setLoading(false);
        setLoadingAction(null);
      }
    }
  }

  async function generatePrompt(task: NoteTask, selectedDraft: DraftVariant, controls: GenerationControls = {}): Promise<PromptResult | null> {
    if (!selected || !latestPlan) return null;
    if (!task.plan?.trim()) {
      showToast(task.type === "video_text" ? "请先生成视频方案，再生成视频草稿箱指令。" : "请先生成单篇图片方案，再生成图文草稿箱指令。", "error");
      return null;
    }
    const manageLoading = controls.manageLoading ?? true;
    if (manageLoading) setLoading(true);
    setLoadingAction(controls.loadingAction || "generatePrompt");
    try {
      let accountForPrompt = selected;
      try {
        const latestAccount = mapBackendAccountToUiAccount(await fetchBackendAccountDetail(selected.id));
        accountForPrompt = mergeBackendAccountWithLocalState(latestAccount, selected);
        updateSelectedAccount(() => accountForPrompt);
      } catch {
        // 账号详情刷新失败时，继续使用当前客户端状态生成任务。
      }
      const res = await authenticatedFetch(`/api/note-tasks/${task.id}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: accountForPrompt, noteTask: task, weeklyPlan: latestPlan, selectedDraft })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成图文草稿箱任务失败。");
      setPromptResults((current) => ({ ...current, [task.id]: data }));
      updateSelectedAccount((account) => ({
        ...account,
        weeklyPlans: account.weeklyPlans.map((plan) =>
          plan.id !== latestPlan.id
            ? plan
            : {
                ...plan,
                noteTasks: plan.noteTasks.map((item) => (item.id === task.id ? { ...item, status: "已生成草稿箱指令" } : item))
          }
        )
      }));
      if (controls.showSuccessToast ?? true) showToast("草稿箱任务已生成，智能体将原样使用所选标题和正文。", "success");
      return data as PromptResult;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成图文草稿箱任务失败。", "error");
      return null;
    } finally {
      if (manageLoading) {
        setLoading(false);
        setLoadingAction(null);
      }
    }
  }

  async function generateImagePrompt(
    task: NoteTask,
    options?: SingleImagePromptOptions,
    controls: GenerationControls = {}
  ): Promise<ImagePromptGeneration | null> {
    if (!selected || !latestPlan) return null;
    const manageLoading = controls.manageLoading ?? true;
    if (manageLoading) setLoading(true);
    setLoadingAction(controls.loadingAction || "generateImagePrompt");
    try {
      const res = await authenticatedFetch(`/api/note-tasks/${task.id}/image-prompt`, {
        method: "POST",
        headers: { "content-type": "application/json", ...buildProxyHeaders() },
        body: JSON.stringify({
          ...(options || {}),
          account: selected,
          noteTask: task,
          knowledgeSnapshotId: latestPlan.knowledgeSnapshotId || "",
          knowledgeSourceKeys: task.knowledgeSourceKeys || []
        })
      });
      const data = await readApiJsonResponse(res, "创建图片方案任务失败");
      if (!res.ok) throw new Error(data.error || "生成图片方案失败。");
      const resolved = data.async && data.uuid
        ? await waitForAsyncRouteResult<ImagePromptResult>(`/api/note-tasks/${task.id}/image-prompt`, data.uuid)
        : data as ImagePromptResult;
      setImagePromptResults((current) => ({ ...current, [task.id]: resolved }));
      const savedTask = await saveBackendNoteTask(
        selected.id,
        latestPlan.id,
        toBackendNoteTask({
          ...task,
          plan: resolved.imagePrompt?.content || task.plan || "",
          status: task.status || "已生成图片方案"
        })
      );
      const savedUiTask: NoteTask = { ...task, ...savedTask, id: savedTask.id || task.id };
      updateSelectedAccount((account) => ({
        ...account,
        weeklyPlans: account.weeklyPlans.map((plan) =>
          plan.id !== latestPlan.id
            ? plan
            : {
                ...plan,
                noteTasks: plan.noteTasks.map((item) =>
                  item.id === task.id
                    ? {
                        ...item,
                        ...savedUiTask
                      }
                    : item
                )
              }
        )
      }));
      if (controls.showSuccessToast ?? true) showToast("图片方案和执行命令已生成。", "success");
      return { result: resolved, savedTask: savedUiTask };
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成图片方案失败。", "error");
      return null;
    } finally {
      if (manageLoading) {
        setLoading(false);
        setLoadingAction(null);
      }
    }
  }

  async function generateVideoPrompt(task: NoteTask, mode: "direct_video" | "image_to_video", assets: Asset[]) {
    if (!selected || !latestPlan || task.type !== "video_text") return;
    setLoading(true);
    setLoadingAction("generateVideoPrompt");
    try {
      const res = await authenticatedFetch(`/api/note-tasks/${task.id}/video-prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: selected,
          noteTask: task,
          mode,
          assets,
          knowledgeSnapshotId: latestPlan.knowledgeSnapshotId || "",
          knowledgeSourceKeys: task.knowledgeSourceKeys || []
        })
      });
      const data = await readApiJsonResponse(res, "创建视频方案任务失败");
      if (!res.ok) throw new Error(data.error || "生成视频方案失败。");
      const resolved = data.async && data.uuid
        ? await waitForAsyncRouteResult<VideoPromptResult>(`/api/note-tasks/${task.id}/video-prompt`, data.uuid)
        : data as VideoPromptResult;
      setVideoPromptResults((current) => ({ ...current, [task.id]: resolved }));
      const savedTask = await saveBackendNoteTask(selected.id, latestPlan.id, toBackendNoteTask({
        ...task,
        plan: resolved.videoPrompt.content,
        status: "已生成视频方案"
      }));
      updateSelectedAccount((account) => ({
        ...account,
        weeklyPlans: account.weeklyPlans.map((plan) => plan.id !== latestPlan.id ? plan : {
          ...plan,
          noteTasks: plan.noteTasks.map((item) => item.id === task.id ? { ...item, ...savedTask } : item)
        })
      }));
      showToast(mode === "direct_video" ? "直接视频任务已生成。" : "图片转视频方案已生成。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成视频方案失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function uploadVideoAsset(file: File): Promise<Asset | null> {
    if (!selected) return null;
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      showToast("登录状态失效，请重新登录后再上传。", "error");
      return null;
    }
    setLoading(true);
    setLoadingAction("uploadVideoAsset");
    try {
      const form = new FormData();
      form.set("accountId", String(selected.id));
      form.set("sourceType", "真实素材");
      form.append("files", file);
      const res = await authenticatedFetch("/api/assets/upload", {
        method: "POST",
        headers: {
          "Xhs-Sign": token,
          "Xhs-Person": String(user.uid),
          "Xhs-Time": Math.floor(Date.now() / 1000).toString(),
          "Xhs-Request-Id": `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          "Xhs-Test": "1"
        },
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.assets?.[0]) throw new Error(data.error || "上传视频失败。");
      const uploaded = data.assets[0] as Asset;
      const saved = await saveBackendAssets(selected.id, [toBackendAsset(uploaded), ...selected.assets.map(toBackendAsset)]);
      const nextAssets = saved.map((asset) => mapBackendAssetToUiAsset(asset));
      updateSelectedAccount((account) => ({ ...account, assets: nextAssets }));
      showToast("视频已上传并登记到素材库。", "success");
      return nextAssets.find((asset) => asset.fileUrl === uploaded.fileUrl || asset.filePath === uploaded.filePath) || uploaded;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "上传视频失败。", "error");
      return null;
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function generateDashboardContentTasks(
    task: NoteTask,
    options: { removeWatermarks?: boolean } = {}
  ) {
    if (!selected || !latestPlan) return;
    const hasMediaPlan = Boolean(task.plan?.trim());
    const hasVariants = Boolean(draftVariants[task.id]?.length);

    if (hasVariants) {
      setSelectedNoteId(task.id);
      setActiveTab("prompts");
      showToast("请在笔记草稿中选择一个文案版本，再复制草稿箱指令。", "error");
      return;
    }

    if (task.type === "video_text" && !hasMediaPlan) {
      setSelectedNoteId(task.id);
      setActiveTab("videos");
      showToast("视频任务需要先选择视频来源，请在视频方案中继续。", "error");
      return;
    }

    setLoading(true);
    try {
      let latestTask = task;
      if (task.type !== "video_text" && !hasMediaPlan) {
        const imageCount = inferQuickImageCount(task.requiredMaterials || "");
        const candidateAssets = (selected.assets || []).filter(
          (asset) => isRemoteImageAsset(asset) && /^https?:\/\//i.test(asset.fileUrl || "")
        );
        if (candidateAssets.length < imageCount) {
          showToast(`当前素材库只有 ${candidateAssets.length} 张可用图片，快捷生成需要 ${imageCount} 张。请前往图片方案调整。`, "error");
          return;
        }

        const imageGeneration = await generateImagePrompt(
          task,
          {
            imageSourceMode: "ai_auto_select",
            noteContent: task.coreView,
            singleGoal: "围绕这篇笔记主题和可用事实，生成封面、图集顺序、图上文字和风险核验。",
            imageCount: String(imageCount),
            candidateAssets,
            removeWatermarks: Boolean(options.removeWatermarks)
          },
          {
            manageLoading: false,
            showSuccessToast: false,
            loadingAction: "dashboardImagePrompt"
          }
        );
        if (!imageGeneration) return;
        latestTask = imageGeneration.savedTask;
      }

      const variants = await generateDraftVariants(latestTask, {
        manageLoading: false,
        showSuccessToast: false,
        loadingAction: "dashboardDraftVariants"
      });
      if (!variants) return;
      setSelectedNoteId(latestTask.id);
      setActiveTab("prompts");
      showToast("图片方案和三个文案版本已生成，请选择喜欢的版本复制草稿箱任务。", "success");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function generateBatchImagePosts(options?: { weeks?: string; openclawImagePaths?: string; planningGoal?: string }) {
    if (!selected) return;
    setLoading(true);
    setLoadingAction("generateBatchImagePosts");
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/batch-image-posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(options || {}),
          account: selected
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成批量图片帖子失败。");
      setBatchImagePostResults((current) => ({ ...current, [selected.id]: data }));
      showToast("批量图片帖子任务已生成。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成批量图片帖子失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function generatePostReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
      const form = new FormData(event.currentTarget);
      setLoading(true);
      setLoadingAction("generatePostReview");
      try {
        const plannedTitle = selectedNote?.topicTitle || "";
        const input = {
          postTitle: String(form.get("postTitle") || "").trim() || plannedTitle,
        postUrl: String(form.get("postUrl") || ""),
        publishedAt: normalizeReviewPublishedAt(String(form.get("publishedAt") || "")),
        actualContent: String(form.get("actualContent") || ""),
        metrics: String(form.get("metrics") || ""),
        comments: String(form.get("comments") || ""),
        expertFeedback: String(form.get("expertFeedback") || ""),
        editComparison: String(form.get("editComparison") || ""),
        subjective: String(form.get("subjective") || ""),
        distillGoal: String(form.get("distillGoal") || "")
      };
      if (![input.actualContent, input.metrics, input.comments, input.expertFeedback, input.editComparison, input.subjective].some((value) => value.trim())) {
        throw new Error("请至少填写实际发布内容、表现数据、用户反馈、专家点评、修改对比或主观观察中的一项。");
      }
      const noteTaskId = Number(form.get("noteTaskId") || selectedNote?.id || 0) || undefined;
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/post-reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: selected,
          noteTask: selectedNote || null,
          noteTaskId,
          ...input
        })
      });
      const data = await readApiJsonResponse(res, "执行专家复盘失败");
      if (!res.ok) throw new Error(data.error || "生成单帖复盘失败。");
      const result = data.async && data.uuid
        ? await waitForAsyncRouteResult<{
            summary: string;
            evidenceAssessment: string;
            aiModel: string;
            rules: Array<{
              module: string;
              rule: string;
              positiveExample: string;
              negativeExample: string;
              reason: string;
              source: string;
              applicableWhen: string;
              notApplicableWhen: string;
              nextTest: string;
            }>;
          }>(`/api/accounts/${selected.id}/post-reviews`, String(data.uuid))
        : data;
      const saved = await saveBackendPostReviewResult({
        accountId: selected.id,
        ...(noteTaskId ? { noteTaskId } : {}),
        input,
        summary: result.summary,
        evidenceAssessment: result.evidenceAssessment,
        aiModel: result.aiModel,
        rules: (result.rules || []).slice(0, 5)
      });
      const savedRules = saved.rules || [];
      updateSelectedAccount((account) => ({
        ...account,
        postReviews: [saved.postReview, ...(account.postReviews || []).filter((item) => item.id !== saved.postReview.id)],
        // saveResult 按接口约定返回当前账号的完整规则库，不能与旧的本地状态再合并。
        expertRules: savedRules
      }));
      showToast(
        savedRules.length > 15
          ? `专家复盘已保存，但服务端返回 ${savedRules.length} 条规则，超过同账号 15 条上限；请检查服务端 saveResult 的限额与合并逻辑。`
          : `专家复盘已完成，本次最多提交 5 条候选规则；当前规则库共 ${savedRules.length} 条。`,
        savedRules.length > 15 ? "error" : "success"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "生成单帖复盘失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function saveExpertRuleSelection(enabledRuleIds: number[]) {
    if (!selected) return;
    if (enabledRuleIds.length > 5) {
      showToast("每个账号最多启用 5 条规则。", "error");
      return;
    }
    setLoading(true);
    setLoadingAction("saveExpertRuleSelection");
    try {
      const rules = await setBackendExpertRulesEnabled(selected.id, enabledRuleIds);
      updateSelectedAccount((account) => ({ ...account, expertRules: rules }));
      showToast(enabledRuleIds.length ? `已启用 ${enabledRuleIds.length} 条规则。` : "已关闭全部规则。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存规则选择失败。", "error");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function prepareIndustryLearning(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    showToast("该功能即将上线，敬请期待", "error");
  }

  async function saveIndustryLearning(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/accounts/${selected.id}/industry-learning`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-results",
          account: selected,
          researchId: industryLearningDraft.research?.id || selected.industryKnowledgeResearches?.[0]?.id,
          topic: form.get("topic"),
          searchScope: form.get("searchScope"),
          rawResults: form.get("rawResults"),
          summaryMarkdown: form.get("summaryMarkdown")
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存行业学习失败。");
      setIndustryLearningDraft((current) => ({ ...current, research: data.research }));
      updateSelectedAccount((account) => ({
        ...account,
        industryKnowledgeResearches: [
          data.research,
          ...(account.industryKnowledgeResearches || []).filter((item) => item.id !== data.research.id)
        ]
      }));
      showToast("行业学习材料已保存。", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存行业学习失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadHealth() {
    const res = await authenticatedFetch("/api/system-health", { cache: "no-store" });
    setHealth(await readJsonResponse(res, { status: "error", checks: [], summary: "系统状态接口返回异常。" }));
  }

  function showToast(message: string, tone: FeedbackTone) {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setToast({ message, tone });
    if (tone === "success") {
      feedbackTimerRef.current = window.setTimeout(() => {
        setToast((current) => current?.message === message && current.tone === "success" ? null : current);
        feedbackTimerRef.current = null;
      }, 3000);
    }
  }

  function dismissToast() {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    setToast(null);
  }

  function copyWithTextarea(text: string) {
    const textarea = document.createElement("textarea");
    const activeElement = document.activeElement as HTMLElement | null;
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    try {
      // focus() is important for Safari/iOS and for browsers that reject a
      // copy command unless the selection belongs to the active element.
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      return document.execCommand("copy");
    } finally {
      textarea.remove();
      if (activeElement && activeElement.isConnected) {
        activeElement.focus({ preventScroll: true });
      }
    }
  }

  function showCopyNotice(message: string) {
    if (copyNoticeTimerRef.current !== null) window.clearTimeout(copyNoticeTimerRef.current);
    setCopyNotice(message);
    copyNoticeTimerRef.current = window.setTimeout(() => {
      setCopyNotice((current) => current === message ? null : current);
      copyNoticeTimerRef.current = null;
    }, 2200);
  }

  async function copy(text: string) {
    if (!text.trim()) {
      showToast("当前没有可复制的内容。", "error");
      return;
    }

    // Try the synchronous fallback first so the browser's user-activation
    // token is still available if the Clipboard API is blocked. This fixes
    // browsers where an async clipboard rejection makes a later fallback
    // `execCommand` call fail as well.
    try {
      if (copyWithTextarea(text)) {
        showCopyNotice("已复制到剪贴板。");
        return;
      }
    } catch {
      // Continue with the modern API when the legacy command is unavailable.
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showCopyNotice("已复制到剪贴板。");
        return;
      }
    } catch {
      // Report one consistent error below after both methods have failed.
    }

    showToast("复制失败，请检查浏览器剪贴板权限。", "error");
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-ink/10 bg-white/80 px-4 py-5 shadow-panel backdrop-blur lg:block">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/xhs-master-logo.png"
              alt="小红书运营策划大师 Logo"
              width={200}
              height={200}
              priority
              className="h-10 w-10 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 text-base font-semibold leading-5">小红书运营策划大师</div>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal">
            <ShieldCheck size={14} /> 只生成方案，不自动发布
          </div>
        </div>
        <nav className="space-y-1">
          {mainTabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
              }}
              className={clsx(
                "flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition",
                activeTab === id ? "bg-ink text-white" : "hover:bg-ink/5"
              )}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
          <details className="pt-2">
            <summary className="cursor-pointer rounded px-3 py-2 text-xs font-medium text-ink/55 transition hover:bg-ink/5">
              高级设置
            </summary>
            <div className="mt-1 space-y-1">
              {advancedTabs.map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(id);
                    if (id === "health") loadHealth();
                  }}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition",
                    activeTab === id ? "bg-ink text-white" : "hover:bg-ink/5"
                  )}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
          </details>
        </nav>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/90 px-4 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm text-ink/60">小红书运营策划大师</div>
              <h1 className="text-2xl font-semibold">{selected?.name || "创建第一个账号"}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selected?.id ?? ""}
                onChange={(event) => setSelectedId(Number(event.target.value))}
                className="h-10 rounded border border-ink/15 bg-white px-3 text-sm"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} / {account.accountParam}
                  </option>
                ))}
              </select>
              <button title="刷新" type="button" onClick={refresh} className="icon-button">
                <Activity size={17} />
              </button>
              {currentUser && (
                <div className="flex items-center gap-2 rounded border border-ink/10 bg-white px-3 py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal/15 text-xs font-medium text-teal">
                    {currentUser.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="text-sm font-medium">{currentUser.name}</span>
                  <button
                    type="button"
                    title="登出"
                    onClick={logout}
                    className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-ink/50 transition hover:bg-coral/10 hover:text-coral"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
            {mainTabs.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={clsx("shrink-0 rounded px-3 py-2 text-sm", activeTab === id ? "bg-ink text-white" : "bg-white")}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <section className="px-4 py-6 lg:px-8">
          {copyNotice && (
            <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end" role="status" aria-live="polite">
              <div className="inline-flex items-center gap-2 rounded border border-teal/20 bg-white px-4 py-3 text-sm font-medium text-teal shadow-panel">
                <CircleCheck size={18} aria-hidden="true" />
                <span>{copyNotice}</span>
              </div>
            </div>
          )}
          {toast && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" role="presentation">
              <div className="w-full max-w-md rounded-md border border-ink/10 bg-white p-5 shadow-panel" role="alertdialog" aria-modal="true" aria-live="assertive">
                <div className="flex items-start gap-3">
                  {toast.tone === "success" ? (
                    <CircleCheck className="mt-0.5 shrink-0 text-teal" size={28} aria-hidden="true" />
                  ) : (
                    <CircleX className="mt-0.5 shrink-0 text-coral" size={28} aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold">{toast.tone === "success" ? "操作完成" : "操作提示"}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink/70">{toast.message}</p>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button type="button" className="primary-button" autoFocus onClick={dismissToast}>确认</button>
                </div>
              </div>
            </div>
          )}
          {activeTab === "dashboard" && (
            <Dashboard
              selected={selected}
              plan={latestPlan}
              selectedNoteId={selectedNote?.id ?? null}
              setSelectedNoteId={setSelectedNoteId}
              promptResults={promptResults}
              draftVariants={draftVariants}
              imagePromptResults={imagePromptResults}
              generateContentTasks={generateDashboardContentTasks}
              copy={copy}
              setActiveTab={setActiveTab}
              deleteAccount={deleteAccount}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "accounts" && (
            <AccountsPanel
              templates={templates}
              accountForm={accountForm}
              setAccountForm={setAccountForm}
              createAccount={createAccount}
              loading={loading}
            />
          )}
          {activeTab === "reference" && (
            <ReferenceResearchPanel
              selected={selected}
              draft={referenceDraft}
              prepareReferenceResearch={prepareReferenceResearch}
              saveReferenceResearch={saveReferenceResearch}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === "strategy" && <StrategyPanel selected={selected} copy={copy} />}
          {activeTab === "agents" && (
            <AgentsPanel
              selected={selected}
              profileContent={profileContent}
              setProfileContent={setProfileContent}
              saveProfile={saveProfile}
              copy={copy}
            />
          )}
          {activeTab === "assets" && (
            <AssetsPanel
              selected={selected}
              uploadAsset={uploadAsset}
              generateManifest={generateManifest}
              manifest={manifest}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "knowledgeBase" && <KnowledgeBasePanel selected={selected} notify={showToast} />}
          {activeTab === "weekly" && <WeeklyPanel selected={selected} generateWeeklyPlan={generateWeeklyPlan} changeNoteTaskType={changeNoteTaskType} loading={loading} loadingAction={loadingAction} />}
          {activeTab === "images" && (
            <ImagesPanel
              selected={selected}
              plan={latestPlan}
              selectedNoteId={selectedNote?.id ?? null}
              setSelectedNoteId={setSelectedNoteId}
              onAssetsAdded={(assets) =>
                updateSelectedAccount((account) => ({
                  ...account,
                  assets: [
                    ...assets.filter((asset) => !account.assets.some((current) => current.fileUrl && current.fileUrl === asset.fileUrl)),
                    ...account.assets
                  ]
                }))
              }
              imageStyleDraft={imageStyleDraft}
              prepareImageStyleStudy={prepareImageStyleStudy}
              saveImageStyleStudy={saveImageStyleStudy}
              imagePromptResults={imagePromptResults}
              generateImagePrompt={generateImagePrompt}
              batchImagePostResult={selected ? batchImagePostResults[selected.id] : null}
              generateBatchImagePosts={generateBatchImagePosts}
              showBatchImagePostsComingSoon={() => showToast("该功能即将上线，敬请期待", "error")}
              notify={showToast}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "videos" && (
            <VideosPanel
              selected={selected}
              plan={latestPlan}
              selectedNoteId={selectedNote?.id ?? null}
              setSelectedNoteId={setSelectedNoteId}
              results={videoPromptResults}
              generateVideoPrompt={generateVideoPrompt}
              uploadVideoAsset={uploadVideoAsset}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "prompts" && (
            <PromptsPanel
              plan={latestPlan}
              selectedNoteId={selectedNote?.id ?? null}
              setSelectedNoteId={setSelectedNoteId}
              promptResults={promptResults}
              draftVariants={draftVariants}
              generateDraftVariants={generateDraftVariants}
              generatePrompt={generatePrompt}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "interactions" && (
            <InteractionsPanel
              selected={selected}
              latestPlan={latestPlan}
              selectedNoteId={selectedNote?.id ?? null}
              setSelectedNoteId={setSelectedNoteId}
              draft={interactionDraft}
              prepareInteractionPlan={prepareInteractionPlan}
              saveInteractionResults={saveInteractionResults}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "reports" && (
            <ReportsPanel
              selected={selected}
              latestPlan={latestPlan}
              selectedNoteId={selectedNote?.id ?? null}
              setSelectedNoteId={setSelectedNoteId}
              generatePostReview={generatePostReview}
              saveExpertRuleSelection={saveExpertRuleSelection}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "learning" && (
            <IndustryLearningPanel
              selected={selected}
              draft={industryLearningDraft}
              prepareIndustryLearning={prepareIndustryLearning}
              saveIndustryLearning={saveIndustryLearning}
              copy={copy}
              loading={loading}
              loadingAction={loadingAction}
            />
          )}
          {activeTab === "health" && <HealthPanel health={health} loadHealth={loadHealth} />}
        </section>
      </main>
    </div>
  );
}

function Dashboard({
  selected,
  plan,
  selectedNoteId,
  setSelectedNoteId,
  promptResults,
  draftVariants,
  imagePromptResults,
  generateContentTasks,
  copy,
  setActiveTab,
  deleteAccount,
  loading,
  loadingAction
}: {
  selected?: Account;
  plan?: WeeklyPlan;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number) => void;
  promptResults: Record<number, PromptResult>;
  draftVariants: Record<number, DraftVariant[]>;
  imagePromptResults: Record<number, ImagePromptResult>;
  generateContentTasks: (task: NoteTask, options?: { removeWatermarks?: boolean }) => Promise<void>;
  copy: (text: string) => void;
  setActiveTab: (tab: any) => void;
  deleteAccount: () => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const cards = [
    ["账号策划", selected?.strategy ? "已可用" : "待创建", "strategy"],
    ["本周内容", `${selected?.weeklyPlans?.[0]?.noteTasks?.length ?? 0} 篇`, "weekly"],
    ["图片方案", selected?.weeklyPlans?.[0]?.noteTasks?.length ? "可生成" : "待计划", "images"],
    ["视频方案", selected?.weeklyPlans?.[0]?.noteTasks?.some((task) => task.type === "video_text") ? "可生成" : "待视频计划", "videos"],
    ["笔记草稿", selected?.weeklyPlans?.[0]?.noteTasks?.length ? "可生成" : "待计划", "prompts"],
    ["素材库", `${selected?.assets?.length ?? 0} 个`, "assets"],
    ["发布后互动", selected?.interactionPlans?.[0]?.status || "可选", "interactions"]
  ];
  const optionalCards = [
    ["爆款研究", selected?.referenceResearches?.[0]?.status || "可选增强", "reference"],
    ["配置文件", selected?.profile ? `v${selected.profile.version}` : "自动生成", "agents"]
  ];
  const currentNote = plan?.noteTasks.find((task) => task.id === selectedNoteId) ?? plan?.noteTasks?.[0];
  const currentImageResult = currentNote ? imagePromptResults[currentNote.id] : null;
  const currentPromptResult = currentNote ? promptResults[currentNote.id] : null;
  const currentDraftVariants = currentNote ? draftVariants[currentNote.id] || [] : [];
  const isVideoTask = currentNote?.type === "video_text";
  const imageTaskContent = currentImageResult?.openclawTask?.content || currentImageResult?.imagePrompt?.content || currentNote?.plan || "";
  const draftTaskContent = currentPromptResult?.openclawTask?.content || currentPromptResult?.prompt?.content || "";
  const hasImagePlan = Boolean(currentNote?.plan?.trim() || imageTaskContent);
  const hasDraftVariants = currentDraftVariants.length === 3;
  const hasDraftTask = Boolean(draftTaskContent);
  const isQuickGenerating = loadingAction === "dashboardImagePrompt" || loadingAction === "dashboardDraftVariants";
  const generateButtonText = !hasImagePlan
    ? isVideoTask ? "前往视频方案" : "生成图片方案 + 3 个文案版本"
    : hasDraftVariants
      ? "选择文案版本"
      : "生成 3 个标题正文版本";
  const generateLoadingText = loadingAction === "dashboardDraftVariants"
    ? "正在生成 3 个文案版本..."
    : "正在生成图片方案...";

  function openImageSetup() {
    if (currentNote) setSelectedNoteId(currentNote.id);
    setActiveTab(isVideoTask ? "videos" : "images");
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5">
      <div className="panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="section-title">账号运营工作台</h2>
          <p className="mt-1 text-sm text-ink/60">
            {selected ? `当前账号：${selected.name} / ${selected.accountParam}` : "还没有账号，先创建一个账号策划。"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setActiveTab("accounts")} className="primary-button w-full justify-center sm:w-auto">
            <Plus size={17} /> 新增账号
          </button>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={!selected || loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-coral/35 bg-white px-4 text-sm font-medium text-coral transition hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Trash2 size={17} /> 删除当前账号
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        {cards.map(([label, value, tab]) => (
          <button key={label} type="button" onClick={() => setActiveTab(tab)} className="panel text-left">
            <div className="text-sm text-ink/55">{label}</div>
            <div className="mt-3 text-2xl font-semibold">{value}</div>
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">可选增强</h2>
          <p className="mt-1 text-sm text-ink/60">
            创建账号后策划已经可用，可以直接进入素材、本周内容、图片方案和笔记草稿。爆款研究只在需要校准同行风格时再做。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {optionalCards.map(([label, value, tab]) => (
            <button key={label} type="button" onClick={() => setActiveTab(tab)} className="rounded border border-ink/10 bg-white p-3 text-left transition hover:border-teal/40 hover:bg-teal/5">
              <div className="text-sm text-ink/55">{label}</div>
              <div className="mt-1 text-lg font-semibold">{value}</div>
            </button>
          ))}
        </div>
      </div>
      <section className="space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title">本周内容 + 发布</h2>
            {plan?.noteTasks?.length ? (
              <span className="rounded bg-teal/10 px-2.5 py-1 text-xs font-medium text-teal">
                共 {plan.noteTasks.length} 篇
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink/60">先准备图片或视频方案，再选择一个标题正文版本，最后复制草稿箱指令交给智能体。</p>
        </div>

        {!selected ? (
          <div className="panel">
            <EmptyState text="还没有客户账号，请先创建账号并生成策划。" />
            <button type="button" onClick={() => setActiveTab("accounts")} className="primary-button mx-auto mt-4">
              <Plus size={17} /> 新增账号
            </button>
          </div>
        ) : !plan?.noteTasks?.length || !currentNote ? (
          <div className="panel">
            <EmptyState text="当前账号还没有本周内容，请先生成一周计划。" />
            <button type="button" onClick={() => setActiveTab("weekly")} className="primary-button mx-auto mt-4">
              <CalendarDays size={17} /> 前往本周内容
            </button>
          </div>
        ) : (
          <>
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
              <div className="panel min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">本周笔记</h3>
                    <p className="mt-1 text-sm text-ink/55">按发布时间查看并选择要处理的内容。</p>
                  </div>
                  <CalendarDays size={20} className="shrink-0 text-teal" />
                </div>
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {plan.noteTasks.map((task) => {
                    const taskImageContent = imagePromptResults[task.id]?.openclawTask?.content
                      || imagePromptResults[task.id]?.imagePrompt?.content;
                    const taskDraftContent = promptResults[task.id]?.openclawTask?.content
                      || promptResults[task.id]?.prompt?.content;
                    const taskHasImage = Boolean(task.plan?.trim() || taskImageContent);
                    const taskHasVariants = (draftVariants[task.id] || []).length === 3;
                    const taskHasDraft = Boolean(taskDraftContent);
                    const status = taskHasDraft ? "草稿指令已就绪" : taskHasVariants ? "待选择文案" : taskHasImage ? "待生成文案" : "待生成";
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedNoteId(task.id)}
                        className={clsx(
                          "w-full rounded border p-4 text-left transition",
                          task.id === currentNote.id
                            ? "border-teal bg-teal/10 ring-2 ring-teal/10"
                            : "border-ink/10 bg-white hover:border-teal/40"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={clsx(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                            task.id === currentNote.id ? "border-teal" : "border-ink/25"
                          )}>
                            {task.id === currentNote.id ? <span className="h-2.5 w-2.5 rounded-full bg-teal" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium leading-6">{task.topicTitle}</span>
                            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/55">
                              <span>{task.publishAt}</span>
                              <span>{task.contentType}</span>
                              <span>{task.expectedGoal || task.contentGoal}</span>
                            </span>
                          </span>
                          <span className={clsx(
                            "shrink-0 rounded px-2 py-1 text-xs font-medium",
                            taskHasDraft ? "bg-teal/10 text-teal" : taskHasVariants ? "bg-sky-50 text-sky-700" : taskHasImage ? "bg-amber-50 text-amber-700" : "bg-coral/10 text-coral"
                          )}>
                            {status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="panel min-w-0">
                <div className="border-b border-ink/10 pb-4">
                  <div className="text-sm font-medium text-ink/55">当前笔记</div>
                  <h3 className="mt-2 text-xl font-semibold leading-8">{currentNote.topicTitle}</h3>
                  <div className="mt-3 grid gap-2 text-sm text-ink/65 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={16} className="text-teal" />
                      <span>{currentNote.publishAt}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-teal" />
                      <span>{currentNote.contentGoal || currentNote.expectedGoal}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isVideoTask ? <Video size={16} className={hasImagePlan ? "text-teal" : "text-ink/35"} /> : <ImageIcon size={16} className={hasImagePlan ? "text-teal" : "text-ink/35"} />}
                      <span>{isVideoTask ? "视频" : "图片"}方案：{hasImagePlan ? "已生成" : "待生成"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <NotebookPen size={16} className={hasDraftTask || hasDraftVariants ? "text-teal" : "text-ink/35"} />
                      <span>文案版本：{hasDraftTask ? "已选定" : hasDraftVariants ? "待选择" : "待生成"}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void generateContentTasks(currentNote, { removeWatermarks: true })}
                  disabled={loading}
                  aria-busy={isQuickGenerating}
                  className="primary-button mt-5 w-full justify-center"
                >
                  <ActionButtonContent
                    loading={isQuickGenerating}
                    icon={<Sparkles size={17} />}
                    idleText={generateButtonText}
                    loadingText={generateLoadingText}
                  />
                </button>
                <p className="mt-2 text-xs leading-5 text-ink/55">
                  {!hasImagePlan && isVideoTask
                    ? "视频任务需要先选择直接视频或图片转视频模式，点击后将前往视频方案。"
                    : !hasImagePlan
                      ? "快捷生成默认使用 AI 自动选图并去除水印，完成图片方案后继续生成三个文案版本。"
                      : hasDraftVariants
                        ? "三个版本已生成，请选择一个版本后复制草稿箱指令。"
                        : `${isVideoTask ? "视频" : "图片"}方案已完成，现在可以直接生成三个标题正文版本。`}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => copy(imageTaskContent)}
                    disabled={!imageTaskContent || loading}
                    className="secondary-button w-full justify-center"
                  >
                    {isVideoTask ? <Video size={17} /> : <ImageIcon size={17} />} 复制{isVideoTask ? "视频" : "图片"}方案
                  </button>
                  {hasDraftTask ? (
                    <button
                      type="button"
                      onClick={() => copy(draftTaskContent)}
                      disabled={loading}
                      className="secondary-button w-full justify-center"
                    >
                      <FileText size={17} /> 复制草稿箱指令
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNoteId(currentNote.id);
                        setActiveTab("prompts");
                      }}
                      disabled={!hasDraftVariants || loading}
                      className="secondary-button w-full justify-center"
                    >
                      <NotebookPen size={17} /> 选择文案版本
                    </button>
                  )}
                </div>

                <button type="button" onClick={openImageSetup} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal hover:underline">
                  <ExternalLink size={16} /> 调整{isVideoTask ? "视频来源或图片顺序" : "图片来源、数量或精修要求"}
                </button>

                {hasImagePlan && hasDraftTask ? (
                  <div className="mt-5 rounded border border-teal/20 bg-teal/5 p-3 text-sm leading-6 text-teal">
                    两项任务已就绪。先把{isVideoTask ? "视频" : "图片"}方案交给智能体；素材完成后，再发送文字方案生成{isVideoTask ? "视频" : "图文"}笔记并保存到草稿箱。
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 rounded border border-ink/10 bg-white/60 p-3 text-sm text-ink/60 sm:grid-cols-4">
              {["1. 选择笔记", "2. 准备图片或视频方案", "3. 选择标题正文版本", "4. 复制指令并审核草稿"].map((item, index) => (
                <div key={item} className={clsx("flex items-center gap-2 px-2 py-1", index === 0 && "font-medium text-teal")}>
                  {item}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AccountsPanel(props: {
  templates: Template[];
  accountForm: ReturnType<typeof emptyAccountForm>;
  setAccountForm: (form: any) => void;
  createAccount: () => void;
  loading: boolean;
}) {
  const { templates, accountForm, setAccountForm, createAccount, loading } = props;
  const field = (key: keyof typeof accountForm, value: string) => setAccountForm({ ...accountForm, [key]: value });
  const switchAccountType = (accountType: string) => setAccountForm(switchAccountTypeForm(accountForm, templates, accountType));
  const choices = accountChoiceOptions(accountForm.accountType);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">快速创建客户账号</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/60">
              先填写客户的真实业务、目标用户、目标和素材情况。没有把握的内容可以留空，由 AI 根据已填写信息生成策划并标记待补充项。
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label="客户/账号名称" value={accountForm.name} onChange={(v) => field("name", v)} placeholder="例如 灼悦婚礼 / 长歌行 / X 的徒步日记" />
          <Input label="所在城市/区域" value={accountForm.city} onChange={(v) => field("city", v)} placeholder="例如 杭州 / 大理 / 上海静安" />
          <label className="field md:col-span-2">
            <span>客户类型</span>
            <select value={accountForm.accountType} onChange={(e) => switchAccountType(e.target.value)}>
              {templates.map((template) => (
                <option key={template.typeKey} value={template.typeKey}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <Textarea
            label="客户主要做什么"
            value={accountForm.personaBase}
            onChange={(v) => field("personaBase", v)}
            placeholder="一句话写清主营业务、核心服务或核心体验。例如：本地婚礼服务品牌，提供婚礼策划、现场布置和真实案例展示。"
            help="请尽量填写真实业务、服务范围或客户体验；不确定的内容可以留空。"
          />
          <MultiChoiceField
            label="想吸引谁"
            value={accountForm.targetUsers}
            onChange={(v) => field("targetUsers", v)}
            options={choices.targetUsers}
            placeholder="还有其他目标用户，可以写在这里"
          />
          <MultiChoiceField
            label="现在最想达成什么"
            value={accountForm.businessGoals}
            onChange={(v) => field("businessGoals", v)}
            options={choices.businessGoals}
            placeholder="还有其他目标，可以写在这里"
          />
          <MultiChoiceField
            label="已有素材"
            value={accountForm.materialCondition}
            onChange={(v) => field("materialCondition", v)}
            options={choices.materialCondition}
            placeholder="其他素材，例如航拍、直播切片、客户评价截图"
          />
          <MultiChoiceField
            label="不能乱写什么"
            value={accountForm.taboos}
            onChange={(v) => field("taboos", v)}
            options={choices.taboos}
            placeholder="其他禁忌或品牌红线"
            help="例如希望重点强化的表达风格、场景氛围、产品体验或需要避开的品牌表达。"
          />
        </div>

        <details className="mt-4 rounded border border-ink/10 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium">
            高级补充
            <span className="ml-2 text-xs font-normal text-ink/50">需要更精细时再展开</span>
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              label="内部账号代号"
              value={accountForm.accountParam}
              onChange={(v) => field("accountParam", v)}
              placeholder="可不填，系统会自动生成，例如 brand-01"
            />
            <label className="field">
              <span>账号阶段</span>
              <select value={accountForm.stage} onChange={(e) => field("stage", e.target.value)}>
                {["冷启动", "成长期", "商业化期"].map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <Textarea label="用户顾虑" value={accountForm.painPoints} onChange={(v) => field("painPoints", v)} placeholder="填写用户可能担心的问题，例如价格、效果、流程、交通或售后。" />
            <Textarea label="内容方向" value={accountForm.contentDirections} onChange={(v) => field("contentDirections", v)} placeholder="填写客户希望重点分享的主题；没有确定方向可以留空。" />
            <Textarea label="商业化方式" value={accountForm.monetization} onChange={(v) => field("monetization", v)} placeholder="填写已有的产品、服务或转化方式；没有确定方案可以留空。" />
            <Textarea label="参考账号" value={accountForm.referenceAccounts} onChange={(v) => field("referenceAccounts", v)} placeholder="账号名 / 主页链接 / 想参考的原因。不确定可以留空。" />
          </div>
        </details>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={createAccount} disabled={loading || !accountForm.name} className="primary-button">
            <Plus size={17} /> {loading ? "正在生成..." : "创建账号并生成策划"}
          </button>
          <span className="text-xs leading-5 text-ink/50">最少只填客户名称也能创建；填写主营业务和目标用户会更准。</span>
        </div>
      </div>
      <div className="panel">
        <h2 className="section-title">选择客户类型</h2>
        <p className="mt-1 text-sm text-ink/60">点选后，左侧占位示例和自动补全规则会跟着切换。</p>
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.typeKey}
              type="button"
              onClick={() => switchAccountType(template.typeKey)}
              className={clsx(
                "w-full rounded border bg-white p-3 text-left transition hover:border-teal/40 hover:bg-teal/5",
                accountForm.accountType === template.typeKey ? "border-teal/60 bg-teal/5 ring-2 ring-teal/15" : "border-ink/10"
              )}
            >
              <div className="font-medium">{template.name}</div>
              <div className="mt-1 text-xs text-ink/60">{safeJsonArray(template.defaultColumns).join(" / ")}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReferenceResearchPanel(props: {
  selected?: Account;
  draft: {
    accountId?: number;
    research?: ReferenceResearch;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    researchPrompt?: string;
    summary?: { summaryMarkdown: string; contentFeatures: string; personaInsights: string; strategyInsights: string; writingStyleInsights: string };
  };
  prepareReferenceResearch: () => void;
  saveReferenceResearch: (event: React.FormEvent<HTMLFormElement>) => void;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
  setActiveTab: (tab: any) => void;
}) {
  const { selected, draft, prepareReferenceResearch, saveReferenceResearch, copy, loading, loadingAction, setActiveTab } = props;
  if (!selected) return <EmptyState />;

  const scopedDraft = draft.accountId === selected.id ? draft : {};
  const latest = scopedDraft.research || selected.referenceResearches?.[0];
  const researchPrompt = scopedDraft.researchPrompt || latest?.researchPrompt || "";
  const rawSummaryMarkdown = scopedDraft.summary?.summaryMarkdown || latest?.summaryMarkdown || "";
  const writingStyleInsights = scopedDraft.summary?.writingStyleInsights || latest?.writingStyleInsights || "";
  const summaryMarkdown = [
    rawSummaryMarkdown,
    writingStyleInsights ? `## 爆款正文文风洞察\n\n${writingStyleInsights}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
  const researchTask = researchPrompt;
  const hasSearchPack = Boolean(researchPrompt);
  const hasSummary = Boolean(summaryMarkdown.trim());

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">爆款研究</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink/60">
              账号创建后策划已经可用；这页用于吸收全国同类型爆款风格、标题正文、图片顺序和作者定位。本地内容只作为落地差异补充，避免风格被所在城市局限。
            </p>
          </div>
          <button type="button" onClick={prepareReferenceResearch} disabled={loading} className="primary-button">
            <Search size={17} /> 生成爆款研究
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className={clsx("rounded border p-4", hasSearchPack ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">1. 搜索要求</div>
            <div className="mt-2 font-semibold">{hasSearchPack ? "已生成" : "待生成"}</div>
          <p className="mt-2 text-sm text-ink/60">复制一条研究任务给智能体，优先只读搜索全国同类型爆款。</p>
          </div>
          <div className={clsx("rounded border p-4", latest?.rawResults ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">2. 返回结果</div>
            <div className="mt-2 font-semibold">{latest?.rawResults ? "已粘贴" : "待粘贴"}</div>
            <p className="mt-2 text-sm text-ink/60">把帖子详情、作者主页和图片分析结果粘回右侧输入区。</p>
          </div>
          <div className={clsx("rounded border p-4", hasSummary ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">3. 增强策划</div>
            <div className="mt-2 font-semibold">{hasSummary ? "已增强" : "可选"}</div>
            <p className="mt-2 text-sm text-ink/60">大模型总结参考结果，用于增强策划、图片方案和正文草稿。</p>
          </div>
        </div>

      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">给智能体的爆款研究任务</h2>
              <p className="mt-1 text-sm text-ink/60">只需要复制下面这一条任务给智能体执行。</p>
            </div>
          </div>

          {!hasSearchPack ? (
            <EmptyState text="点击“生成爆款研究”后，这里会出现一条可复制给智能体的研究任务。" />
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-ink/10 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium">爆款研究任务</div>
                  <button type="button" onClick={() => copy(researchTask)} className="secondary-button">
                    <Clipboard size={16} /> 复制
                  </button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-ink p-3 text-xs leading-5 text-white">{researchTask}</pre>
                <p className="mt-2 text-xs text-coral">只读探索命令，不发布、不关注、不私信、不互动。</p>
              </div>
            </div>
          )}
        </div>

        <form className="panel" onSubmit={saveReferenceResearch}>
          <h2 className="section-title">粘贴参考结果，增强现有策划</h2>
          <p className="mt-1 text-sm text-ink/60">把智能体返回的研究报告粘进来，大模型会优先提炼全国爆款规律，并更新当前策划。本地结果只作为补充对照。</p>
          <div className="mt-4 grid gap-3">
            <label className="field">
              <span>智能体爆款研究报告</span>
              <textarea
                name="rawResults"
                defaultValue={latest?.rawResults || ""}
                rows={12}
                className="!h-[360px] resize-y py-3 leading-6"
                placeholder="粘贴 xhs-explore 返回的帖子详情、作者主页和图片分析报告"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={loading} aria-busy={loadingAction === "saveReferenceResearch"} className="primary-button">
              <ActionButtonContent
                loading={loadingAction === "saveReferenceResearch"}
                icon={<Sparkles size={17} />}
                idleText="保存研究并增强策划"
                loadingText="正在保存并增强策划..."
              />
            </button>
            <span className="text-xs text-ink/55">成功后会更新策划案和账号配置文件；不需要也可以跳过。</span>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">研究结论</h2>
            <p className="mt-1 text-sm text-ink/60">这里显示大模型总结后的可用结论，不再展示无关中间信息。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActiveTab("strategy")} className="secondary-button">
              <Sparkles size={16} /> 策划案
            </button>
            <button type="button" onClick={() => setActiveTab("agents")} className="secondary-button">
              <FileText size={16} /> 配置文件
            </button>
            <IconButton title="复制总结" onClick={() => copy(summaryMarkdown)} icon={<Clipboard size={17} />} />
            <IconButton title="导出 Markdown" onClick={() => downloadText(`${selected.name}-reference-research.md`, summaryMarkdown)} icon={<Download size={17} />} />
          </div>
        </div>
        {hasSummary ? (
          <MarkdownBox value={summaryMarkdown} />
        ) : (
          <EmptyState text="还没有参考结论。这是可选增强，不影响你继续生成本周内容、图片方案和笔记草稿。" />
        )}
      </div>
    </div>
  );
}
function stripStrategyResearchAndCommandSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      skipping = /研究.*命令|命令.*建议|研究建议|给.*(?:Agent|智能体|xiaohongshu_auto_op).*执行说明/i.test(heading[1]);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trim();
}

function StrategyPanel({ selected, copy }: { selected?: Account; copy: (text: string) => void }) {
  if (!selected) return <EmptyState />;
  const strategyMarkdown = stripStrategyResearchAndCommandSections(selected.strategy?.markdown || "");
  return (
    <div className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
            <h2 className="section-title">账号运营策划方案</h2>
          <p className="text-sm text-ink/60">{selected.strategy?.positioning}</p>
        </div>
        <div className="flex gap-2">
          <IconButton title="复制策划案" onClick={() => copy(strategyMarkdown)} icon={<Clipboard size={17} />} />
          <IconButton title="导出 Markdown" onClick={() => downloadText(`${selected.name}-strategy.md`, strategyMarkdown)} icon={<Download size={17} />} />
        </div>
      </div>
      <MarkdownBox value={strategyMarkdown || "暂无策划案，请先创建账号。"} />
    </div>
  );
}

function AgentsPanel(props: {
  selected?: Account;
  profileContent: string;
  setProfileContent: (value: string) => void;
  saveProfile: () => void;
  copy: (text: string) => void;
}) {
  const { selected, profileContent, setProfileContent, saveProfile, copy } = props;
  if (!selected) return <EmptyState />;
  return (
    <div className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">配置文件编辑器</h2>
          <p className="text-sm text-ink/60">{selected.profilePath}</p>
        </div>
        <div className="flex gap-2">
          <IconButton title="保存版本" onClick={saveProfile} icon={<Save size={17} />} />
          <IconButton title="复制" onClick={() => copy(profileContent)} icon={<Clipboard size={17} />} />
          <IconButton title="导出 Markdown" onClick={() => downloadText(`${selected.name}-AGENTS.md`, profileContent)} icon={<Download size={17} />} />
        </div>
      </div>
      <textarea className="code-textarea min-h-[620px]" value={profileContent} onChange={(event) => setProfileContent(event.target.value)} />
    </div>
  );
}

function AssetsPanel(props: {
  selected?: Account;
  uploadAsset: (form: HTMLFormElement, files: File[], clearFiles?: () => void) => void;
  generateManifest: () => void;
  manifest: { content: string; validation: string; path: string } | null;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const { selected, uploadAsset, generateManifest, manifest, copy, loading, loadingAction } = props;
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  if (!selected) return <EmptyState />;
  const copyText = assetUiCopy(selected.accountType);
  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">素材库</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/60">
              管理整个账号长期可复用的真实素材。只给某一篇笔记临时上传几张图时，去“图片方案 → 单篇精修 → 手动指定图片”更直接。
            </p>
          </div>
          <button type="button" onClick={generateManifest} className="secondary-button">
            <FileText size={17} /> 生成素材清单
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-ink/10 bg-white p-3">
              <div className="text-xs font-medium text-ink/55">已登记素材</div>
              <div className="mt-2 text-2xl font-semibold">{selected.assets.length}</div>
            <p className="mt-1 text-sm text-ink/60">账号级长期素材，会被批量生成和单篇精修的素材库多图选择优先参考。</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-3">
            <div className="text-xs font-medium text-ink/55">可预览素材</div>
            <div className="mt-2 text-sm font-semibold">{selected.assets.filter((asset) => asset.fileUrl).length} 个</div>
            <p className="mt-1 text-sm text-ink/60">上传后的素材会直接复用到批量选图和单篇精修。</p>
          </div>
        </div>
      </div>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          uploadAsset(event.currentTarget, uploadFiles, () => setUploadFiles([]));
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="section-title">上传素材</h2>
            <p className="text-sm text-ink/60">上传后会进入当前账号素材库。</p>
          </div>
          <button type="submit" disabled={loading} aria-busy={loadingAction === "uploadAsset"} className="primary-button">
            <ActionButtonContent
              loading={loadingAction === "uploadAsset"}
              icon={<Upload size={17} />}
              idleText="上传并登记素材"
              loadingText="正在上传并登记..."
            />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="field md:col-span-4">
            <span>上传图片</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files || []);
                setUploadFiles((current) => mergeFiles(current, nextFiles));
                event.currentTarget.value = "";
              }}
            />
            <span className="text-xs text-ink/50">支持一次多选，也可以连续追加。</span>
          </label>
          {uploadFiles.length > 0 && (
            <div className="rounded border border-teal/20 bg-teal/5 p-3 md:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-teal">
                  待上传 {summarizeFiles(uploadFiles).count} 个文件，合计 {formatFileSize(summarizeFiles(uploadFiles).totalBytes)}
                </div>
                <button
                  type="button"
                  className="text-xs text-ink/55 underline-offset-2 hover:underline"
                  onClick={() => setUploadFiles([])}
                >
                  清空本次选择
                </button>
              </div>
              <div className="mt-2 max-h-32 overflow-auto rounded bg-white/80 px-3 py-2 text-xs text-ink/65">
                {uploadFiles.map((file) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name} · {formatFileSize(file.size)}</div>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 rounded border border-ink/10 bg-white px-3 py-2 text-sm">
            <input name="coverReady" type="checkbox" value="true" /> 适合封面
          </label>
          <details className="rounded border border-ink/10 bg-white p-3 md:col-span-4">
            <summary className="cursor-pointer text-sm font-medium">高级信息（可选）</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="field">
                <span>来源类型</span>
                <select name="sourceType" defaultValue={copyText.source}>
                  {sourceTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <Input name="location" label="拍摄地点" />
              <Input name="shotAt" label="拍摄时间" />
              <Input name="tags" label="标签" placeholder={copyText.singleTags} />
              <Input name="suitableTypes" label="适合什么内容" placeholder={copyText.singleSuitable} />
              <Input name="riskNotes" label="核验/风险备注" placeholder={copyText.singleRisk} />
            </div>
          </details>
        </div>
      </form>

      <div className="panel">
        <div className="mb-4">
          <div>
            <h2 className="section-title">已登记素材</h2>
            <p className="mt-1 text-sm text-ink/60">生成素材清单后，系统会知道素材来源、适合内容、封面可用性和风险备注。</p>
          </div>
        </div>
        {!selected.assets.length ? (
          <EmptyState text="还没有素材，请先上传图片。" />
        ) : (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {selected.assets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded border border-ink/10 bg-white">
                {(() => {
                  const previewUrl = asset.fileUrl || (asset.filePath.startsWith("/") ? asset.filePath : "");
                  return (
                    <>
                <div className="flex aspect-video items-center justify-center bg-ink/5">
                  {asset.fileType.startsWith("image") && previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={asset.tags || "asset"} className="h-full w-full object-cover" />
                  ) : asset.fileType.startsWith("video") && previewUrl ? (
                    <video src={previewUrl} className="h-full w-full object-cover" controls />
                  ) : (
                    <div className="grid place-items-center gap-2 px-4 text-center text-xs text-ink/55">
                      <ImageIcon size={28} />
                      <span>{asset.fileUrl ? "素材可直接预览" : "当前素材缺少可访问图片链接"}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3 text-sm">
                  <div className="truncate font-medium">{asset.filePath}</div>
                  {asset.fileUrl && (
                    <a
                      href={asset.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate text-xs text-teal hover:underline"
                    >
                      <ExternalLink size={13} />
                      <span>{asset.fileUrl}</span>
                    </a>
                  )}
                  <div className="text-ink/60">{asset.sourceType}</div>
                  <div>{asset.tags || "未标注标签"}</div>
                  <div className="flex gap-2 text-xs">
                    <span className={clsx("rounded px-2 py-1", asset.coverReady ? "bg-teal/10 text-teal" : "bg-ink/5")}>封面 {asset.coverReady ? "是" : "否"}</span>
                    <span className={clsx("rounded px-2 py-1", asset.used ? "bg-coral/10 text-coral" : "bg-ink/5")}>已用 {asset.used ? "是" : "否"}</span>
                  </div>
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
        {manifest && (
          <div className="mt-5 rounded border border-ink/10 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">{manifest.validation}</div>
              <IconButton title="复制 manifest" onClick={() => copy(manifest.content)} icon={<Clipboard size={16} />} />
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{manifest.content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyPanel({
  selected,
  generateWeeklyPlan,
  changeNoteTaskType,
  loading,
  loadingAction
}: {
  selected?: Account;
  generateWeeklyPlan: (event: React.FormEvent<HTMLFormElement>) => void;
  changeNoteTaskType: (task: NoteTask, type: NoteTask["type"]) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const accountType = selected?.accountType || "restaurant";
  const presets = useMemo(() => getWeeklyPlanningObjectives(accountType), [accountType]);
  const [selectedPresetNames, setSelectedPresetNames] = useState<string[]>([]);
  const [weeklyFrequency, setWeeklyFrequency] = useState("4");
  const [weeklyVideoCount, setWeeklyVideoCount] = useState("1");
  useEffect(() => {
    setSelectedPresetNames(presets[0]?.name ? [presets[0].name] : []);
    setWeeklyFrequency("4");
    setWeeklyVideoCount("1");
  }, [presets]);

  if (!selected) return <EmptyState />;
  const selectedPresets = selectedPresetNames
    .map((name) => presets.find((preset) => preset.name === name))
    .filter((preset): preset is WeeklyPlanningObjective => Boolean(preset));
  const activePresets = selectedPresets.length ? selectedPresets : [presets[0]].filter(Boolean);
  const combinedPreset = combineWeeklyPlanningObjectives(activePresets);
  const latestResearch = selected.referenceResearches?.[0];
  const hasStrategy = Boolean(selected.strategy?.markdown);
  const hasResearch = Boolean(latestResearch?.summaryMarkdown);
  const assetCount = selected.assets?.length ?? 0;
  const focusCopy = weeklyFocusCopy(selected.accountType);
  const effectiveFrequency = clampWeeklyFrequency(weeklyFrequency, 4);
  const effectiveVideoCount = Math.max(0, Math.min(Number.parseInt(weeklyVideoCount, 10) || 0, effectiveFrequency));
  const togglePreset = (name: string) => {
    setSelectedPresetNames((current) => {
      if (current.includes(name)) {
        return current.length === 1 ? current : current.filter((item) => item !== name);
      }
      return [...current, name];
    });
  };

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">本周内容</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink/60">
              先选本周内容主题，再补充特殊活动、主推内容或重点。系统会生成本周每篇笔记的主题、事实边界和内容目标；图片将在后续图片方案阶段单独选择。
            </p>
          </div>
          <div className="rounded bg-teal/10 px-3 py-2 text-sm font-medium text-teal">安全模式：只生成计划</div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className={clsx("rounded border p-4", hasStrategy ? "border-teal/30 bg-teal/5" : "border-coral/30 bg-coral/5")}>
            <div className="text-xs font-medium text-ink/55">账号策划案</div>
            <div className="mt-2 font-semibold">{hasStrategy ? "已生成" : "缺少策划案"}</div>
            <p className="mt-2 text-sm text-ink/60">用于决定栏目、标题、转化路径和风险边界。</p>
          </div>
          <div className={clsx("rounded border p-4", hasResearch ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">竞品账号研究</div>
            <div className="mt-2 font-semibold">{hasResearch ? "已总结" : "可先补充"}</div>
            <p className="mt-2 text-sm text-ink/60">用于借鉴同类型爆款帖的作者定位、标题正文和图片风格，并避免同质化。</p>
          </div>
          <div className={clsx("rounded border p-4", assetCount ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">素材库</div>
            <div className="mt-2 font-semibold">{assetCount} 个素材</div>
            <p className="mt-2 text-sm text-ink/60">周计划不会读取素材库；生成每篇笔记的图片方案时再自动选图或由人工选择。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          className="panel"
          onSubmit={generateWeeklyPlan}
        >
          <div className="mb-4">
            <h2 className="section-title">本周目标设置</h2>
            <p className="mt-1 text-sm text-ink/60">不用懂运营术语。可以多选本周目标，再按需要改发布篇数。</p>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => togglePreset(preset.name)}
                className={clsx(
                  "rounded border bg-white p-3 text-left transition hover:border-teal/40 hover:bg-teal/5",
                  selectedPresetNames.includes(preset.name) ? "border-teal/60 bg-teal/5 ring-2 ring-teal/15" : "border-ink/10"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{preset.name}</div>
                  <span className={clsx("rounded px-2 py-1 text-xs", selectedPresetNames.includes(preset.name) ? "bg-teal text-white" : "bg-ink/5 text-ink/45")}>
                    {selectedPresetNames.includes(preset.name) ? "已选" : "可选"}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-5 text-ink/60">{preset.help}</div>
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-ink/10 bg-white p-3 md:col-span-2">
              <div className="text-sm font-medium">已选运营目标</div>
              <div className="mt-2 text-sm leading-6 text-ink/65">{activePresets.map((preset) => preset.name).join(" / ")}</div>
              <div className="mt-1 text-xs leading-5 text-ink/50">{combinedPreset.goal}</div>
            </div>
            <Input
              name="frequency"
              label="本周发几篇"
              type="number"
              min={1}
              max={7}
              step={1}
              value={weeklyFrequency}
              onChange={setWeeklyFrequency}
            />
            <Input
              name="videoCount"
              label="其中视频笔记"
              type="number"
              min={0}
              max={effectiveFrequency}
              step={1}
              value={String(effectiveVideoCount)}
              onChange={setWeeklyVideoCount}
              help={`图文 ${effectiveFrequency - effectiveVideoCount} 篇 / 视频 ${effectiveVideoCount} 篇`}
            />
          </div>

          <div className="mt-4 rounded border border-ink/10 bg-white p-3">
            <Textarea
              name="weeklyFocus"
              label={focusCopy.label}
              placeholder={focusCopy.placeholder}
              help={`${focusCopy.help} 填写后按本周指定内容生成；留空时会避开最近两周已生成计划的主题。`}
            />
            <input type="hidden" name="theme" value={combinedPreset.theme} readOnly />
            <input type="hidden" name="goal" value={combinedPreset.goal} readOnly />
            <input type="hidden" name="selectedObjectiveIds" value={activePresets.map((preset) => preset.id).join(",")} readOnly />
            <input type="hidden" name="taboos" defaultValue={selected.taboos} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={loading} aria-busy={loadingAction === "generateWeeklyPlan"} className="primary-button">
              <ActionButtonContent
                loading={loadingAction === "generateWeeklyPlan"}
                icon={<Sparkles size={17} />}
                idleText="生成一周计划"
                loadingText="正在生成一周计划..."
              />
            </button>
            <span className="text-xs text-ink/55">生成后会自动跳转到“笔记草稿”页。</span>
          </div>
        </form>

        <PlanPreview plan={selected.weeklyPlans?.[0]} changeNoteTaskType={changeNoteTaskType} loading={loading} />
      </div>
    </div>
  );
}

function PlanPreview({ plan, changeNoteTaskType, loading }: { plan?: WeeklyPlan; changeNoteTaskType: (task: NoteTask, type: NoteTask["type"]) => void; loading: boolean }) {
  if (!plan) {
    return (
      <div className="panel">
        <h2 className="section-title">计划预览</h2>
        <div className="mt-4">
          <EmptyState text="还没有一周计划。设置本周目标后点击生成，任务会显示在这里。" />
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">{plan.theme}</h2>
          <p className="mt-1 text-sm text-ink/60">{plan.goal}</p>
        </div>
        <IconButton title="导出 Markdown" onClick={() => downloadText(`weekly-plan-${plan.id}.md`, weeklyPlanMarkdown(plan))} icon={<Download size={17} />} />
      </div>
      <div className="space-y-3">
        {plan.noteTasks.map((task) => (
          <div key={task.id} className="rounded border border-ink/10 bg-white p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-ink px-2 py-1 text-xs text-white">{task.publishAt}</span>
              <span className="rounded bg-teal/10 px-2 py-1 text-xs text-teal">{task.contentType}</span>
              <select
                aria-label={`切换 ${task.topicTitle} 的帖子类型`}
                value={task.type}
                disabled={loading}
                onChange={(event) => changeNoteTaskType(task, event.target.value as NoteTask["type"])}
                className="h-7 rounded border border-ink/15 bg-white px-2 text-xs"
              >
                <option value="image_text">图文笔记</option>
                <option value="video_text">视频笔记</option>
              </select>
              <span className="rounded bg-coral/10 px-2 py-1 text-xs text-coral">{task.status}</span>
            </div>
            <div className="font-medium">{task.topicTitle}</div>
            {task.writingStyleName ? <div className="mt-1 text-xs text-teal">参考文风：{task.writingStyleName}</div> : null}
            <div className="mt-2 text-sm text-ink/65">{task.coreView}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function isWeddingUiAccount(account?: Account) {
  if (!account) return false;
  if (account.accountType === "wedding_planning") return true;
  return /婚礼|婚庆|婚宴|婚纱|婚摄|婚照|备婚|新娘|新郎|新人|婚礼策划|婚礼布置|宴会设计|仪式区|甜品台|迎宾区/.test(
    [account.name, account.personaBase, account.contentDirections, account.materialCondition, account.businessGoals, account.targetUsers].join(" ")
  );
}

const weddingPlanningGoalPresets = [
  {
    label: "自动读图找选题",
    value: "客户提供约 30 张婚礼现场图。请先逐张识别画面里的蛋糕、花艺、仪式区、迎宾区、桌花、席位卡、灯光布幔、纸品等细节，再结合同行热门笔记风格，自动挑出最适合小红书的一周或两周选题。"
  },
  {
    label: "突出婚礼细节",
    value: "重点挖掘婚礼蛋糕、花艺、仪式区、迎宾区、桌花、席位卡、菜单卡、灯光布幔等细节的高级感和可收藏价值，每篇笔记只聚焦一个细节。"
  },
  {
    label: "提升备婚咨询",
    value: "选题要服务备婚用户的咨询转化。请优先输出容易引发评论的问题，例如预算、风格、场地适配、档期、花材、仪式区落地效果和如何与策划师沟通。"
  },
  {
    label: "参考爆款风格",
    value: "请重点研究小红书婚礼公司、婚礼策划、婚礼布置、备婚灵感类爆款笔记，学习标题节奏、封面文字、图集顺序、情绪表达和收藏理由，但不得照搬原文。"
  }
];

function ImagesPanel(props: {
  selected?: Account;
  plan?: WeeklyPlan;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number) => void;
  onAssetsAdded: (assets: Asset[]) => void;
  imageStyleDraft: {
    study?: ImageStyleStudy;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    researchPrompt?: string;
    summary?: { summaryMarkdown: string; styleBrief: string[] };
  };
  prepareImageStyleStudy: () => void;
  saveImageStyleStudy: (event: React.FormEvent<HTMLFormElement>) => void;
  imagePromptResults: Record<number, ImagePromptResult>;
  generateImagePrompt: (task: NoteTask, options?: SingleImagePromptOptions) => void;
  batchImagePostResult?: BatchImagePostsResult | null;
  generateBatchImagePosts: (options?: { weeks?: string; openclawImagePaths?: string; planningGoal?: string }) => void;
  showBatchImagePostsComingSoon: () => void;
  notify: (message: string, tone: FeedbackTone) => void;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const {
    selected,
    plan,
    selectedNoteId,
    setSelectedNoteId,
    onAssetsAdded,
    imageStyleDraft,
    prepareImageStyleStudy,
    saveImageStyleStudy,
    imagePromptResults,
    generateImagePrompt,
    batchImagePostResult,
    generateBatchImagePosts,
    showBatchImagePostsComingSoon,
    notify,
    copy,
    loading,
    loadingAction
  } = props;
  const imageTasks = plan?.noteTasks.filter((task) => task.type === "image_text") || [];
  const note = imageTasks.find((task) => task.id === selectedNoteId) ?? imageTasks[0];
  const result = note ? imagePromptResults[note.id] : null;
  const latestStudy = imageStyleDraft.study || selected?.imageStyleStudies?.[0];
  const latestStyleSummary = imageStyleDraft.summary?.summaryMarkdown || latestStudy?.summaryMarkdown || result?.referenceStyle || "";
  const styleCommands = imageStyleDraft.commands || (latestStudy?.commandJson ? safeParseCommands(latestStudy.commandJson) : []);
  const stylePrompt = imageStyleDraft.researchPrompt || latestStudy?.researchPrompt || "";
  const copyText = assetUiCopy(selected?.accountType);
  const isWedding = isWeddingUiAccount(selected);
  const commandList = [...(batchImagePostResult?.commands || []), ...(result?.commands || [])];
  const [weddingPlanningGoal, setWeddingPlanningGoal] = useState(weddingPlanningGoalPresets[0].value);
  const [imageWorkflowMode, setImageWorkflowMode] = useState<"batch" | "single">("single");
  const [singleSourceMode, setSingleSourceMode] = useState<SingleImageSourceMode>("ai_auto_select");
  const [singleRealImageRequirement, setSingleRealImageRequirement] = useState(DEFAULT_REAL_IMAGE_REFINEMENT_REQUIREMENT);
  const [singleAiAssistantRequirement, setSingleAiAssistantRequirement] = useState(DEFAULT_AI_ASSISTANT_REQUIREMENT);
  const [singleImageCount, setSingleImageCount] = useState("5");
  const [mixedAutoImageCount, setMixedAutoImageCount] = useState("2");
  const [mixedAiImageCount, setMixedAiImageCount] = useState("1");
  const [mixedRealImageRequirement, setMixedRealImageRequirement] = useState(DEFAULT_REAL_IMAGE_REFINEMENT_REQUIREMENT);
  const [mixedAiAssistantRequirement, setMixedAiAssistantRequirement] = useState(DEFAULT_MIXED_AI_ASSISTANT_REQUIREMENT);
  const [batchUploadFiles, setBatchUploadFiles] = useState<File[]>([]);
  const [singleUploadFiles, setSingleUploadFiles] = useState<File[]>([]);
  const [imageSubmitting, setImageSubmitting] = useState<"batch" | "single" | null>(null);

  async function uploadFilesWithAuth(files: File[], options?: { suitableTypes?: string; tags?: string }) {
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      throw new Error("登录状态失效，请重新登录后再上传。");
    }

    const uploadForm = new FormData();
    uploadForm.set("accountId", String(selected?.id || ""));
    uploadForm.set("sourceType", "真实素材");
    uploadForm.set("tags", options?.tags || "");
    uploadForm.set("suitableTypes", options?.suitableTypes || "");
    for (const file of files) uploadForm.append("files", file);

    const uploadRes = await authenticatedFetch("/api/assets/upload", {
      method: "POST",
      headers: buildProxyHeaders(),
      body: uploadForm
    });
    const uploadData = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      throw new Error(uploadData.error || "上传图片失败。");
    }
    const savedAssets = await saveBackendAssets(
      selected?.id || 0,
      ((uploadData as { assets?: Asset[] }).assets || []).map((asset) => toBackendAsset(asset))
    );
    return {
      count: savedAssets.length,
      assets: savedAssets.map((asset, index) =>
        mapBackendAssetToUiAsset(asset, ((uploadData as { assets?: Asset[] }).assets || [])[index])
      )
    } as { count?: number; assets?: Asset[] };
  }

  {
    const batchCommand = batchImagePostResult?.commands?.[0];
    const singleTaskContent = result?.openclawTask?.content || result?.imagePrompt?.content || "";
    const accountKindLabel = isWedding ? "婚礼已上传图片" : "已上传素材图片";
    const batchTitle = isWedding ? "用婚礼素材库图片自动生成批量帖子" : "用素材库图片自动生成批量帖子";
    const batchDescription = isWedding
      ? "适合已经有一批婚礼素材库图片，但还没有想好每篇发什么。智能体会先读图，再结合全国同类型爆款，直接产出多篇帖子方案。"
      : "适合已经有一批素材图，但还没有想好每篇发什么。智能体会先读图，再结合全国同类型爆款，直接产出多篇帖子方案。";
    const defaultBatchGoal = isWedding
      ? "例如：优先从婚礼蛋糕、花艺、仪式区、迎宾区、桌花中找高收藏选题。"
      : "例如：优先从真实素材里找高收藏主题，直接生成一周内容。";
    return (
      <div className="space-y-5">
        <div className="panel">
          <div className="mb-4">
            <h2 className="section-title">图片生成帖子</h2>
            <p className="mt-1 text-sm text-ink/60">先选批量模式还是单篇模式。</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["single", "单篇精修模式", "先确定一篇笔记，再处理这一篇的图片、图集顺序和正文。"],
              ["batch", "批量自动模式", "给一批图片，直接生成一周或两周的多篇帖子。"]
            ].map(([mode, title, desc]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setImageWorkflowMode(mode as "batch" | "single")}
                className={clsx("rounded border p-4 text-left transition", imageWorkflowMode === mode ? "border-teal bg-teal/10 ring-2 ring-teal/15" : "border-ink/10 bg-white hover:border-teal/40")}
              >
                <div className="font-semibold">{title}</div>
                <div className="mt-1 text-sm leading-6 text-ink/60">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {imageWorkflowMode === "batch" ? (
          <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
            <form
              className="panel min-w-0 overflow-hidden border-teal/30"
              onSubmit={(event) => {
                event.preventDefault();
                showBatchImagePostsComingSoon();
              }}
            >
              <div className="mb-4">
                <div className="mb-2 inline-flex rounded bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">批量自动模式</div>
                <h2 className="section-title">{batchTitle}</h2>
                <p className="mt-1 text-sm text-ink/60">{batchDescription}</p>
              </div>

              <div className="grid min-w-0 gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                <label className="field">
                  <span>生成周期</span>
                  <select name="weeks" defaultValue="1">
                    <option value="1">一周，约 5-7 篇</option>
                    <option value="2">两周，约 10-14 篇</option>
                  </select>
                </label>
                <div className="rounded border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/60">
                  {selected?.assets?.length
                    ? `当前账号已登记 ${selected?.assets?.length ?? 0} 张素材，可直接在下方多选。`
                    : `当前账号还没有素材，请先上传图片。`}
                </div>
              </div>

              <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
                <label className="field">
                  <span>本次先上传图片（可选）</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      const nextFiles = Array.from(event.target.files || []);
                      setBatchUploadFiles((current) => mergeFiles(current, nextFiles));
                      event.currentTarget.value = "";
                    }}
                  />
                  <span className="text-xs text-ink/50">支持一次多选，也可以连续追加。</span>
                </label>
                {batchUploadFiles.length > 0 && (
                  <div className="rounded border border-teal/20 bg-teal/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-teal">
                        本次待上传 {summarizeFiles(batchUploadFiles).count} 张图，合计 {formatFileSize(summarizeFiles(batchUploadFiles).totalBytes)}
                      </div>
                      <button type="button" className="text-xs text-ink/55 underline-offset-2 hover:underline" onClick={() => setBatchUploadFiles([])}>
                        清空本次选择
                      </button>
                    </div>
                    <div className="mt-2 max-h-32 overflow-auto rounded bg-white/80 px-3 py-2 text-xs text-ink/65">
                      {batchUploadFiles.map((file) => (
                        <div key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name} · {formatFileSize(file.size)}</div>
                      ))}
                    </div>
                  </div>
                )}
                <RemoteAssetPicker
                  assets={selected?.assets || []}
                  pickerLabel="本次要分析的素材库图片"
                  pickerHelp="从当前账号素材库里多选；没有素材就先上传图片。"
                />
                <Textarea
                  name="planningGoal"
                  label="批量生成要求"
                  value={weddingPlanningGoal}
                  onChange={setWeddingPlanningGoal}
                  placeholder={defaultBatchGoal}
                  help="这会写进给智能体的批量任务。"
                />
              </div>

              <button type="submit" disabled={loading || Boolean(imageSubmitting) || !selected} aria-busy={imageSubmitting === "batch"} className="primary-button mt-4">
                <ActionButtonContent
                  loading={imageSubmitting === "batch" || loadingAction === "generateBatchImagePosts"}
                  icon={<Sparkles size={17} />}
                  idleText="生成批量帖子任务"
                  loadingText="正在生成批量帖子任务..."
                />
              </button>
              {batchImagePostResult?.planningPrompt.path && <div className="mt-3 rounded bg-teal/10 px-3 py-2 text-xs text-teal">{batchImagePostResult?.planningPrompt.path}</div>}
            </form>

            <div className="panel min-w-0 overflow-hidden border-teal/30">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="section-title">批量任务结果</h2>
                  <p className="mt-1 text-sm text-ink/60">一条任务给智能体：读图、分组选题、生成多篇帖子。</p>
                </div>
                <div className="flex gap-2">
                  <IconButton title="复制批量任务" onClick={() => copy(batchImagePostResult?.planningPrompt.content || "")} icon={<Clipboard size={17} />} />
                  <IconButton title="导出 Markdown" onClick={() => downloadText(`batch-image-posts-${selected?.name || "draft"}.md`, batchImagePostResult?.planningPrompt.content || "")} icon={<Download size={17} />} />
                </div>
              </div>
              {batchCommand && (
                <div className="mb-3 rounded border border-ink/10 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{batchCommand.category}</div>
                      <div className="text-xs text-ink/60">{batchCommand.description}</div>
                    </div>
                    <IconButton title="复制执行命令" onClick={() => copy(batchCommand.command)} icon={<Clipboard size={16} />} />
                  </div>
                  <code className="block overflow-auto rounded bg-ink px-3 py-2 text-xs text-white">{batchCommand.command}</code>
                  <div className="mt-2 text-xs text-coral">{batchCommand.safetyNote}</div>
                </div>
              )}
              <textarea
                className="code-textarea min-h-[620px]"
                value={batchImagePostResult?.planningPrompt.content || "点击左侧“生成批量帖子任务”后，这里会显示完整任务。"}
                readOnly
              />
            </div>
          </div>
        ) : (
          <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
            <form
              className="panel min-w-0 overflow-hidden"
              onSubmit={(event) => {
                event.preventDefault();
                if (!note) return;
                if (imageSubmitting) return;
                setImageSubmitting("single");
                const form = new FormData(event.currentTarget);
                const run = async () => {
                  const isMixedMode = singleSourceMode === "mixed";
                  const acceptsManualImages = singleSourceMode === "remote_images" || isMixedMode;
                  const selectedUrls = collectRemoteImageUrls(form);
                  let selectedImageAssets = (selected?.assets || []).filter((asset) => asset.fileUrl && selectedUrls.includes(asset.fileUrl));
                  let imagePaths = selectedUrls.join("\n");
                  let candidateAssets = (selected?.assets || []).filter(isRemoteImageAsset);
                  const requestedImageCount = Math.max(1, Math.min(Number.parseInt(String(form.get("imageCount") || "5"), 10) || 5, 9));
                  const requestedAutoImageCount = Math.max(0, Math.min(Number.parseInt(String(form.get("autoImageCount") || "0"), 10) || 0, 9));
                  const requestedAiImageCount = Math.max(0, Math.min(Number.parseInt(String(form.get("aiImageCount") || "0"), 10) || 0, 9));
                  if (singleSourceMode === "ai_auto_select" && candidateAssets.length < requestedImageCount) {
                    throw new Error(`当前素材库只有 ${candidateAssets.length} 张可用图片，无法自动选择 ${requestedImageCount} 张。请补充素材或减少图片数量。`);
                  }
                  if (acceptsManualImages && singleUploadFiles.length) {
                    const uploadData = await uploadFilesWithAuth(singleUploadFiles, {
                      tags: "单篇精修上传",
                      suitableTypes: note.topicTitle
                    });
                    const uploadedUrls = (uploadData.assets || []).map((asset) => String(asset.fileUrl || "").trim());
                    if (!uploadedUrls.length || uploadedUrls.some((url) => !/^https?:\/\//i.test(url))) {
                      throw new Error("上传成功，但未返回智能体可访问的完整图片 URL。");
                    }
                    imagePaths = [imagePaths, uploadedUrls.join("\n")].filter(Boolean).join("\n");
                    selectedImageAssets = [...selectedImageAssets, ...(uploadData.assets || [])];
                    candidateAssets = [...candidateAssets, ...(uploadData.assets || [])];
                    onAssetsAdded(uploadData.assets || []);
                  }
                  const imageUrls = imagePaths.split("\n").map((url) => url.trim()).filter(Boolean);
                  if (singleSourceMode === "remote_images" && (!imageUrls.length || imageUrls.some((url) => !/^https?:\/\//i.test(url)))) {
                    throw new Error("请选择或上传至少一张具有完整 HTTP(S) URL 的图片。");
                  }
                  if (isMixedMode) {
                    const enabledSources = [imageUrls.length > 0, requestedAutoImageCount > 0, requestedAiImageCount > 0].filter(Boolean).length;
                    const totalCount = imageUrls.length + requestedAutoImageCount + requestedAiImageCount;
                    if (enabledSources < 2) throw new Error("混合模式至少需要启用手动素材、AI 自动选图、AI 辅助图中的两类来源。");
                    if (totalCount > 9) throw new Error(`混合模式共 ${totalCount} 张图片，超过单篇最多 9 张的限制。`);
                    const autoCandidates = candidateAssets.filter((asset) => {
                      const assetUrl = String(asset.fileUrl || "");
                      return Boolean(assetUrl) && !imageUrls.includes(assetUrl);
                    });
                    if (requestedAutoImageCount > autoCandidates.length) {
                      throw new Error(`排除手动素材后，素材库只有 ${autoCandidates.length} 张可供自动选择，无法选择 ${requestedAutoImageCount} 张。`);
                    }
                  }
                  await generateImagePrompt(note, {
                    imageSourceMode: singleSourceMode,
                    noteContent: String(form.get("noteContent") || ""),
                    singleGoal: String(form.get("singleGoal") || ""),
                    imageCount: String(form.get("imageCount") || ""),
                    autoImageCount: String(form.get("autoImageCount") || "0"),
                    aiImageCount: String(form.get("aiImageCount") || "0"),
                    realImageRefinementRequirement: String(form.get("realImageRefinementRequirement") || ""),
                    aiAssistantRequirement: String(form.get("aiAssistantRequirement") || ""),
                    removeWatermarks:
                      singleSourceMode !== "ai_generate"
                      && form.get("removeWatermarks") === "true",
                    openclawImagePaths: imagePaths,
                    candidateAssets: singleSourceMode === "ai_auto_select" || isMixedMode ? candidateAssets : undefined,
                    selectedAssets: imageUrls.map((url, index) => selectedImageAssets.find((asset) => asset.fileUrl === url) || {
                      id: index + 1,
                      filePath: url,
                      fileUrl: url,
                      fileType: "image",
                      sourceType: "真实素材",
                      tags: "",
                      suitableTypes: "",
                      coverReady: false,
                      used: false,
                      riskNotes: ""
                    })
                  });
                  if (acceptsManualImages) setSingleUploadFiles([]);
                };
                run()
                  .catch((error) => notify(error instanceof Error ? error.message : "生成单篇图片方案失败。", "error"))
                  .finally(() => setImageSubmitting(null));
              }}
            >
              <div className="mb-4">
                <div className="mb-2 inline-flex rounded bg-ink/5 px-3 py-1 text-xs font-semibold text-ink/60">单篇精修模式</div>
                <h2 className="section-title">先确定一篇笔记，再决定图片怎么来</h2>
                <p className="mt-1 text-sm text-ink/60">适合已经有明确选题，只想把这一篇的封面、图集、正文和风险边界打磨清楚。</p>
              </div>

              {plan && note ? (
                <label className="field">
                  <span>选择笔记</span>
                  <select value={note.id} onChange={(event) => setSelectedNoteId(Number(event.target.value))}>
                    {imageTasks.map((task) => (
                      <option key={task.id} value={task.id}>{task.topicTitle}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <EmptyState text="先到“本周内容”生成计划，再回来精修单篇笔记。" />
              )}

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-ink/70">图片来源</div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["ai_auto_select", "AI 自动选图", "根据本篇笔记和当前素材标签，自动选择并排序最匹配的图片。"],
                    ["remote_images", "多张素材库图片", "从素材库多选已经上传到后端的图片。"],
                    ["ai_generate", "AI 辅助图", "没有真实图时，生成自然、有画面感的补充图或必要信息卡。"],
                    ["mixed", "混合模式", "组合手动素材、AI 自动选图和 AI 辅助图，生成一份统一图集任务。"]
                  ].map(([mode, title, desc]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSingleSourceMode(mode as SingleImageSourceMode)}
                      className={clsx("rounded border p-3 text-left transition", singleSourceMode === mode ? "border-teal bg-teal/10 text-teal" : "border-ink/10 bg-white text-ink/70 hover:border-teal/40")}
                    >
                      <div className="text-sm font-semibold">{title}</div>
                      <div className="mt-1 text-xs leading-5 text-ink/60">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {note && (
                <div className="mt-4 rounded border border-ink/10 bg-white p-3">
                  <div className="text-sm font-medium">当前笔记目标</div>
                  <div className="mt-2 text-sm leading-6 text-ink/65">
                    <div>封面方向：{note.coverCopyDirection || "未设置"}</div>
                    <div>所需素材：{note.requiredMaterials || "按选题准备素材"}</div>
                  </div>
                </div>
              )}

              <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
                <Textarea
                  name="noteContent"
                  label="这篇笔记内容/方向"
                  defaultValue={note?.coreView || ""}
                  placeholder="写清楚这一篇要表达什么，例如：围绕婚礼蛋糕细节，拆解为什么它能提升整场婚礼高级感。"
                />
                {singleSourceMode === "mixed" ? (
                  <>
                    <div className="grid min-w-0 gap-3 md:grid-cols-[120px_120px_minmax(0,1fr)]">
                      <Input name="autoImageCount" label="AI 自动选图" type="number" min={0} max={9} step={1} value={mixedAutoImageCount} onChange={setMixedAutoImageCount} placeholder="2" />
                      <Input name="aiImageCount" label="AI 辅助图" type="number" min={0} max={9} step={1} value={mixedAiImageCount} onChange={setMixedAiImageCount} placeholder="1" />
                      <div className="rounded border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/60">
                        手动素材数量由下方选择器决定。图集顺序固定为：手动素材 → AI 自动选图 → AI 辅助图；有手动素材时首图为封面，否则自动选图首图为封面。三类来源中至少启用两类，总数最多 9 张。
                      </div>
                    </div>
                    <Textarea
                      name="realImageRefinementRequirement"
                      label="真实素材精修要求"
                      value={mixedRealImageRequirement}
                      onChange={setMixedRealImageRequirement}
                      placeholder="例如：保留菜品真实摆盘，只增强自然光和焦香质感；不要增加文字。"
                    />
                    <Textarea
                      name="aiAssistantRequirement"
                      label="AI 辅助图生成要求"
                      value={mixedAiAssistantRequirement}
                      onChange={setMixedAiAssistantRequirement}
                      placeholder="例如：补一张口感要点卡和一张朋友聚餐氛围图，整体延续暖色餐厅风格。"
                    />
                  </>
                ) : singleSourceMode === "remote_images" ? (
                  <div className="rounded border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/60">
                    用户手动选择本篇需要精修的图片；一张输入素材对应一张精修成品，不自动推荐、增删或替换图片。
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                    <Input name="imageCount" label="图片数量" type="number" min={1} max={9} step={1} defaultValue={singleImageCount} onChange={setSingleImageCount} placeholder="5" />
                    <div className="rounded border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/60">
                      {singleSourceMode === "ai_auto_select"
                        ? `AI 只读取素材标签和文字信息，不识别图片画面。当前有 ${(selected?.assets || []).filter(isRemoteImageAsset).length} 张可用图片，其中 ${(selected?.assets || []).filter((asset) => isRemoteImageAsset(asset) && Boolean(asset.tags?.trim())).length} 张已填写标签。`
                        : "AI 辅助图不作为真实证据图；有真实素材时仍优先使用真实素材。"}
                    </div>
                  </div>
                )}
                {(singleSourceMode === "remote_images" || singleSourceMode === "mixed") && (
                  <>
                    <div className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-ink/60">本篇先上传图片（可选）</span>
                      <label htmlFor="single-remote-image-files" className="secondary-button w-fit cursor-pointer">
                        <Upload size={16} />
                        {singleUploadFiles.length > 0 ? "继续添加图片" : "选择图片"}
                      </label>
                      <input
                        id="single-remote-image-files"
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                          const nextFiles = Array.from(event.target.files || []);
                          setSingleUploadFiles((current) => mergeFiles(current, nextFiles));
                          event.currentTarget.value = "";
                        }}
                      />
                      <span className="text-xs leading-5 text-ink/50">支持一次多选或连续追加；提交时会先整理到当前账号素材中。</span>
                    </div>
                    {singleUploadFiles.length > 0 && (
                      <div className="rounded border border-teal/20 bg-teal/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-teal">
                            本篇待上传 {summarizeFiles(singleUploadFiles).count} 张图，合计 {formatFileSize(summarizeFiles(singleUploadFiles).totalBytes)}
                          </div>
                          <button type="button" className="text-xs text-ink/55 underline-offset-2 hover:underline" onClick={() => setSingleUploadFiles([])}>
                            清空本次选择
                          </button>
                        </div>
                        <div className="mt-2 max-h-28 overflow-auto rounded bg-white/80 px-3 py-2 text-xs text-ink/65">
                          {singleUploadFiles.map((file) => (
                            <div key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name} · {formatFileSize(file.size)}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    <RemoteAssetPicker
                      key={`single-picker-${note?.id || "none"}`}
                      assets={selected?.assets || []}
                      pickerLabel={singleSourceMode === "mixed" ? "混合图集中的手动素材库图片" : "这篇要用的素材库图片"}
                      pickerHelp={singleSourceMode === "mixed" ? "按选择顺序放在图集最前；选中后可调整顺序，第一张会作为封面。" : "按选择顺序加入图集；选中后可在下方调整顺序，第一张作为封面。"}
                      orderable
                    />
                  </>
                )}
                {singleSourceMode !== "ai_generate" && (
                  <label className="flex items-start gap-3 rounded border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/70">
                    <input
                      type="checkbox"
                      name="removeWatermarks"
                      value="true"
                      className="mt-1 h-4 w-4 shrink-0 accent-teal"
                    />
                    <span>
                      <span className="block font-medium text-ink">去除图片中的水印</span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink/55">
                        勾选后，精修任务会要求去除图片中的所有水印、账号角标和来源文字；不勾选则不做任何去水印处理。
                      </span>
                    </span>
                  </label>
                )}
                {singleSourceMode !== "mixed" && (
                  <Textarea
                    name="singleGoal"
                    label={singleSourceMode === "ai_generate" ? "AI 辅助图生成要求" : "真实素材精修要求"}
                    value={singleSourceMode === "ai_generate" ? singleAiAssistantRequirement : singleRealImageRequirement}
                    onChange={singleSourceMode === "ai_generate" ? setSingleAiAssistantRequirement : setSingleRealImageRequirement}
                    placeholder={singleSourceMode === "ai_generate" ? "例如：根据笔记内容补一张氛围画面和一张完整信息卡。" : "例如：保留菜品真实摆盘，只增强自然光和焦香质感；不要增加文字。"}
                  />
                )}
              </div>

              <button type="submit" disabled={loading || Boolean(imageSubmitting) || !note} aria-busy={imageSubmitting === "single"} className="primary-button mt-4">
                <ActionButtonContent
                  loading={imageSubmitting === "single" || loadingAction === "generateImagePrompt"}
                  icon={<ImageIcon size={17} />}
                  idleText={singleSourceMode === "ai_auto_select"
                    ? "AI 自动选图并生成单篇方案"
                    : singleSourceMode === "ai_generate"
                    ? "生成 AI 辅助图方案"
                    : singleSourceMode === "mixed"
                    ? "生成混合图集方案"
                    : "用素材库多图生成单篇方案"}
                  loadingText={singleSourceMode === "ai_auto_select"
                    ? "正在自动选图并生成单篇方案..."
                    : singleSourceMode === "ai_generate"
                    ? "正在生成 AI 辅助图方案..."
                    : singleSourceMode === "mixed"
                    ? "正在生成混合图集方案..."
                    : "正在生成单篇方案..."}
                />
              </button>
            </form>

            <div className="min-w-0 space-y-5">
              <div className="panel min-w-0 overflow-hidden">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="section-title">单篇任务结果</h2>
                    <p className="mt-1 text-sm text-ink/60">可直接复制给智能体；任务中包含真实 CLI、图片来源和完整执行要求。</p>
                  </div>
                  <div className="flex gap-2">
                    <IconButton title="复制智能体任务" onClick={() => copy(singleTaskContent)} icon={<Clipboard size={17} />} />
                    <IconButton title="导出智能体任务" onClick={() => downloadText(`note-${note?.id || "draft"}-agent-image-task.md`, singleTaskContent)} icon={<Download size={17} />} />
                  </div>
                </div>
                <textarea className="code-textarea min-h-[620px]" value={singleTaskContent || "选择单篇来源并点击生成后，这里会显示可直接交给智能体的完整任务。"} readOnly />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.42fr_0.58fr]">
      <div className="space-y-5">
        {!isWedding && (
        <details className="panel">
          <summary className="cursor-pointer text-sm font-medium">
            参考图片风格（可选，高级）
            <span className="ml-2 text-xs font-normal text-ink/50">需要研究同类账号图片时再展开</span>
          </summary>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="section-title">参考图片风格</h2>
              <p className="mt-1 text-sm text-ink/60">
                只读搜索同类型账号的封面和图集，总结可复用的封面结构、图集顺序和信息卡原则。后面的单篇图片方案会自动引用这些原则。
              </p>
            </div>
            <button type="button" onClick={prepareImageStyleStudy} disabled={loading || !selected} className="secondary-button shrink-0">
              <Search size={16} /> 生成参考研究
            </button>
          </div>

          <div className="space-y-3">
            {styleCommands.map((command) => (
              <div key={`${command.category}-${command.command}`} className="rounded border border-ink/10 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{command.category}</div>
                    <div className="text-xs text-ink/60">{command.description}</div>
                  </div>
                  <IconButton title="复制命令" onClick={() => copy(command.command)} icon={<Clipboard size={16} />} />
                </div>
                <code className="block overflow-auto rounded bg-ink px-3 py-2 text-xs text-white">{command.command}</code>
                <div className="mt-2 text-xs text-coral">{command.safetyNote}</div>
              </div>
            ))}
            {stylePrompt ? (
              <details className="rounded border border-ink/10 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium">查看详细研究要求</summary>
                <div className="mt-3 flex justify-end">
                  <IconButton title="复制研究要求" onClick={() => copy(stylePrompt)} icon={<Clipboard size={16} />} />
                </div>
                <textarea className="code-textarea mt-2 min-h-[260px]" value={stylePrompt} readOnly />
              </details>
            ) : (
              <EmptyState text="需要参考同类账号图片时，点击“生成参考研究”，运行后把结果粘贴到下方。" />
            )}
          </div>

          <form onSubmit={saveImageStyleStudy} className="mt-4">
            <Textarea
              name="rawResults"
              label="粘贴参考图片研究结果"
              defaultValue={latestStudy?.rawResults || ""}
              placeholder={copyText.stylePlaceholder}
            />
            <button type="submit" disabled={loading || !selected} className="primary-button mt-3">
              <Sparkles size={17} /> 保存并总结图片风格
            </button>
          </form>
        </details>
        )}

        {isWedding && (
          <form
            className="panel border-teal/30"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              generateBatchImagePosts({
                weeks: String(form.get("weeks") || "1"),
                openclawImagePaths: collectRemoteImageUrls(form).join("\n"),
                planningGoal: String(form.get("planningGoal") || "")
              });
            }}
          >
            <div className="mb-4">
              <div className="mb-2 inline-flex rounded bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">婚礼账号优先流程</div>
              <h2 className="section-title">用婚礼素材库图片自动生成选题规划</h2>
              <p className="mt-1 text-sm text-ink/60">
                先上传婚礼图片，系统会自动读图找细节，再生成一周或两周笔记规划。
              </p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {[ 
                ["1", "准备婚礼素材库图片", "建议 20-40 张，优先选择清晰大图。"],
                ["2", "生成智能体 Prompt", "让智能体读图并研究小红书爆款。"],
                ["3", "得到周计划", "输出标题、配图顺序、正文方向和风险核验。"]
              ].map(([step, title, desc]) => (
                <div key={step} className="rounded border border-teal/15 bg-teal/5 p-3">
                  <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded bg-teal text-xs font-semibold text-white">{step}</div>
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-ink/60">{desc}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-[160px_1fr]">
              <label className="field">
                <span>规划周期</span>
                <select name="weeks" defaultValue="1">
                  <option value="1">一周规划</option>
                  <option value="2">两周规划</option>
                </select>
              </label>
              <div className="rounded border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/60">
                {selected?.assets?.length
                  ? `当前账号已登记 ${selected?.assets?.length ?? 0} 张婚礼素材，可直接在下方多选。`
                  : "当前账号还没有婚礼素材，请先上传图片。"}
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              <RemoteAssetPicker
                key={`legacy-single-picker-${note?.id || "none"}`}
                assets={selected?.assets || []}
                pickerLabel="本次要分析的婚礼素材库图片"
                pickerHelp="从当前账号婚礼素材里多选；没有素材就先上传图片。"
              />
              <div>
                <div className="mb-2 text-sm font-medium text-ink/70">本次希望智能体重点完成什么？</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {weddingPlanningGoalPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setWeddingPlanningGoal(preset.value)}
                      className={clsx(
                        "rounded border px-3 py-2 text-left text-sm transition",
                        weddingPlanningGoal === preset.value ? "border-teal bg-teal/10 text-teal" : "border-ink/10 bg-white text-ink/70 hover:border-teal/40"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                name="planningGoal"
                label="本次额外诉求"
                value={weddingPlanningGoal}
                onChange={setWeddingPlanningGoal}
                placeholder="例如：重点挖掘婚礼蛋糕、法式花艺和仪式区细节；希望提升备婚咨询。"
                help="可以直接用上面的预设，也可以改成客户自己的诉求。"
              />
            </div>

            <button type="submit" disabled={loading || !selected} className="primary-button mt-4">
              <Sparkles size={17} /> 生成给智能体的一键规划 Prompt
            </button>

            {batchImagePostResult?.planningPrompt.path && (
              <div className="mt-3 rounded bg-teal/10 px-3 py-2 text-xs text-teal">{batchImagePostResult?.planningPrompt.path}</div>
            )}
          </form>
        )}

        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note) return;
            const form = new FormData(event.currentTarget);
            generateImagePrompt(note, {
              imageSourceMode: "remote_images",
              openclawImagePaths: collectRemoteImageUrls(form).join("\n")
            });
          }}
        >
          <div className="mb-4">
            <h2 className="section-title">{isWedding ? "规划后再细化单篇图片方案（可选）" : "生成本篇图片方案"}</h2>
            <p className="mt-1 text-sm text-ink/60">
              {isWedding
                ? "批量规划完成后，如果你已经把某篇选题放进“本周内容”，可以在这里继续生成这篇笔记的逐张图片方案。"
                : "选择一篇本周内容并手动指定素材，系统只规划这些图片怎么改、怎么排，不自动推荐或替换图片。"}
            </p>
          </div>

          {plan && note ? (
            <label className="field">
              <span>选择本周内容</span>
              <select value={note?.id || ""} onChange={(event) => setSelectedNoteId(Number(event.target.value))}>
                {plan?.noteTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.topicTitle}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <EmptyState text={isWedding ? "婚礼账号可以先用上方“批量图片选题规划”生成一周或两周方案；有了具体选题后，再回来细化单篇图片方案。" : "先到“本周内容”生成计划，再为某篇笔记生成图片方案。"} />
          )}

          {note && (
            <div className="mt-4 rounded border border-ink/10 bg-white p-3">
              <div className="text-sm font-medium">当前图片目标</div>
              <div className="mt-2 text-sm leading-6 text-ink/65">
                <div>封面方向：{note?.coverCopyDirection || "未设置"}</div>
                <div>所需素材：{note?.requiredMaterials || "按选题准备素材"}</div>
              </div>
            </div>
          )}

          <details className="mt-4 rounded border border-ink/10 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium">指定要精修的已上传素材（必选）</summary>
            <div className="mt-3 grid gap-3">
              <RemoteAssetPicker
                assets={selected?.assets || []}
                pickerLabel="这篇要用的已上传素材"
                pickerHelp="按选择顺序加入图集；选中后可在下方调整顺序，第一张作为封面。"
                orderable
              />
            </div>
          </details>

          <button type="submit" disabled={loading || !note} className="primary-button mt-4">
            <ImageIcon size={17} /> {isWedding ? "细化这篇图片方案" : "生成图片方案"}
          </button>
        </form>

        <div className="panel">
          <h2 className="section-title">给智能体的执行命令</h2>
          <div className="mt-3 space-y-3">
            {commandList.map((command) => (
              <div key={`${command.category}-${command.command}`} className="rounded border border-ink/10 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{command.category}</div>
                    <div className="text-xs text-ink/60">{command.description}</div>
                  </div>
                  <IconButton title="复制命令" onClick={() => copy(command.command)} icon={<Clipboard size={16} />} />
                </div>
                <code className="block overflow-auto rounded bg-ink px-3 py-2 text-xs text-white">{command.command}</code>
                <div className="mt-2 text-xs text-coral">{command.safetyNote}</div>
              </div>
            ))}
            {!commandList.length && <EmptyState text={isWedding ? "先生成批量规划 Prompt，或生成单篇图片方案后，这里会显示可以复制给智能体的执行命令。" : "生成图片方案后，这里会显示可以复制给智能体的执行命令。"} />}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {isWedding && (
          <div className="panel border-teal/30">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="section-title">婚礼批量规划 Prompt</h2>
                <p className="mt-1 text-sm text-ink/60">用于让智能体先读 30 张婚礼图、研究同行热门笔记，再输出一周或两周内容规划。</p>
              </div>
              <div className="flex gap-2">
                <IconButton title="复制批量规划 Prompt" onClick={() => copy(batchImagePostResult?.planningPrompt.content || "")} icon={<Clipboard size={17} />} />
                <IconButton
                  title="导出 Markdown"
                  onClick={() => downloadText(`wedding-image-plan-${selected?.name || "draft"}.md`, batchImagePostResult?.planningPrompt.content || "")}
                  icon={<Download size={17} />}
                />
              </div>
            </div>
            {batchImagePostResult?.planningPrompt.path && <div className="mb-2 rounded bg-teal/10 px-3 py-2 text-xs text-teal">{batchImagePostResult?.planningPrompt.path}</div>}
            {batchImagePostResult ? (
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["复制 Prompt", "给智能体读取图片和研究爆款。"],
                  ["执行命令", "用左侧命令生成规划草稿。"],
                  ["人工核验", "检查肖像授权、价格、档期和场地。"]
                ].map(([title, desc]) => (
                  <div key={title} className="rounded border border-teal/15 bg-teal/5 p-3">
                    <div className="text-sm font-semibold text-teal">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-ink/60">{desc}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              className="code-textarea min-h-[360px]"
              value={
                batchImagePostResult?.planningPrompt.content ||
                "点击左侧“生成批量规划 Prompt”后，这里会显示完整任务说明：批量读图、同行爆款研究、一周/两周笔记规划、后续单篇 Prompt 和风险边界。"
              }
              readOnly
            />
          </div>
        )}

        <div className="panel">
          <h2 className="section-title">图片风格摘要</h2>
          <p className="mt-1 text-sm text-ink/60">
            可选参考：总结同类型账号的封面、图集、信息卡、真实感和收藏点。
          </p>
          <div className="mt-3">
            {latestStyleSummary ? (
              <MarkdownBox value={latestStyleSummary} />
            ) : (
              <EmptyState text="还没有参考图片研究。普通出图可以先跳过这里。" />
            )}
          </div>
        </div>

        <div className="panel">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-title">图片方案</h2>
              <p className="mt-1 text-sm text-ink/60">包含每张指定图片的用途、改图要求、文字叠加建议和人工核验项。</p>
            </div>
            <div className="flex gap-2">
              <IconButton title="复制图片方案" onClick={() => copy(result?.imagePrompt.content || "")} icon={<Clipboard size={17} />} />
              <IconButton title="导出 Markdown" onClick={() => downloadText(`note-${note?.id || "draft"}-image-prompt.md`, result?.imagePrompt.content || "")} icon={<Download size={17} />} />
            </div>
          </div>
          {result?.imagePrompt.path && <div className="mb-2 rounded bg-teal/10 px-3 py-2 text-xs text-teal">{result?.imagePrompt.path}</div>}
          <textarea className="code-textarea min-h-[620px]" value={result?.imagePrompt.content || (note ? "点击生成后显示逐张图片方案。" : "先生成本周内容，再生成单篇图片方案。")} readOnly />
        </div>
      </div>
    </div>
  );
}

function VideosPanel(props: {
  selected?: Account;
  plan?: WeeklyPlan;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number) => void;
  results: Record<number, VideoPromptResult>;
  generateVideoPrompt: (task: NoteTask, mode: "direct_video" | "image_to_video", assets: Asset[]) => void;
  uploadVideoAsset: (file: File) => Promise<Asset | null>;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const { selected, plan, selectedNoteId, setSelectedNoteId, results, generateVideoPrompt, uploadVideoAsset, copy, loading, loadingAction } = props;
  const tasks = plan?.noteTasks.filter((task) => task.type === "video_text") || [];
  const note = tasks.find((task) => task.id === selectedNoteId) || tasks[0];
  const [mode, setMode] = useState<"direct_video" | "image_to_video">("direct_video");
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const videoAssets = (selected?.assets || []).filter(isRemoteVideoAsset);
  const imageAssets = (selected?.assets || []).filter(isRemoteImageAsset);
  const result = note ? results[note.id] : null;
  const videoTaskContent = result?.openclawTask.content || note?.plan || "";

  useEffect(() => {
    if (note && note.id !== selectedNoteId) setSelectedNoteId(note.id);
  }, [note, selectedNoteId, setSelectedNoteId]);
  useEffect(() => setSelectedUrls([]), [note?.id, mode]);

  function toggle(url: string) {
    setSelectedUrls((current) => current.includes(url) ? current.filter((item) => item !== url) : mode === "direct_video" ? [url] : current.length < 6 ? [...current, url] : current);
  }

  function move(index: number, offset: -1 | 1) {
    setSelectedUrls((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  if (!plan || !note) return <div className="panel"><EmptyState text="本周没有视频笔记。请在生成一周计划时设置视频篇数。" /></div>;
  const candidates = mode === "direct_video" ? videoAssets : imageAssets;
  const selectedAssets = selectedUrls.map((url) => candidates.find((asset) => asset.fileUrl === url)).filter((asset): asset is Asset => Boolean(asset));
  const canGenerate = mode === "direct_video" ? selectedAssets.length === 1 : selectedAssets.length >= 2 && selectedAssets.length <= 6;

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-4">
          <h2 className="section-title">视频方案</h2>
          <p className="mt-1 text-sm text-ink/60">直接使用一个视频，或按顺序选择 2-6 张图片生成多段视频并拼接。</p>
        </div>
        <label className="field">
          <span>选择视频笔记</span>
          <select value={note.id} onChange={(event) => setSelectedNoteId(Number(event.target.value))}>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.topicTitle}</option>)}
          </select>
        </label>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <button type="button" onClick={() => setMode("direct_video")} className={clsx("rounded border p-4 text-left", mode === "direct_video" ? "border-teal bg-teal/10" : "border-ink/10 bg-white")}>
            <div className="font-semibold">直接使用视频</div><div className="mt-1 text-xs text-ink/60">上传或选择一个素材库视频，不做精修。</div>
          </button>
          <button type="button" onClick={() => setMode("image_to_video")} className={clsx("rounded border p-4 text-left", mode === "image_to_video" ? "border-teal bg-teal/10" : "border-ink/10 bg-white")}>
            <div className="font-semibold">图片生成视频</div><div className="mt-1 text-xs text-ink/60">AI 生成逐图精修和动态 Prompt，智能体生成片段后拼接。</div>
          </button>
        </div>

        {mode === "direct_video" && (
          <div className="mt-4">
            <label className="secondary-button w-fit cursor-pointer">
              <Upload size={16} /> {loadingAction === "uploadVideoAsset" ? "正在上传..." : "上传视频"}
              <input type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm" className="hidden" disabled={loading} onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const asset = await uploadVideoAsset(file);
                if (asset?.fileUrl) setSelectedUrls([asset.fileUrl]);
                event.target.value = "";
              }} />
            </label>
          </div>
        )}

        <div className="mt-4 rounded border border-ink/10 bg-ink/5 p-3">
          <div className="mb-2 text-sm font-medium">{mode === "direct_video" ? "选择 1 个视频" : "选择并排列 2-6 张图片"}</div>
          {candidates.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{candidates.map((asset) => {
            const url = asset.fileUrl || "";
            const index = selectedUrls.indexOf(url);
            return <div key={asset.id} className={clsx("min-w-0 rounded border bg-white p-2", index >= 0 ? "border-teal" : "border-ink/10")}>
              <button type="button" onClick={() => toggle(url)} className="flex w-full min-w-0 items-center gap-3 text-left">
                {mode === "direct_video" ? <video src={url} className="h-16 w-16 shrink-0 rounded object-cover" muted preload="metadata" /> : <img src={url} alt={asset.tags || asset.filePath} className="h-16 w-16 shrink-0 rounded object-cover" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{asset.tags || asset.filePath}</span><span className="block truncate text-xs text-ink/50">{index >= 0 ? `已选第 ${index + 1} 项` : "点击选择"}</span></span>
              </button>
              {mode === "image_to_video" && index >= 0 && <div className="mt-2 flex justify-end gap-1"><IconButton title="上移" onClick={() => move(index, -1)} icon={<ArrowUp size={14} />} /><IconButton title="下移" onClick={() => move(index, 1)} icon={<ArrowDown size={14} />} /></div>}
            </div>;
          })}</div> : <EmptyState text={mode === "direct_video" ? "素材库还没有视频，可在上方直接上传。" : "素材库还没有可用图片。"} />}
        </div>
        <button type="button" disabled={loading || !canGenerate} onClick={() => generateVideoPrompt(note, mode, selectedAssets)} className="primary-button mt-4">
          <ActionButtonContent loading={loadingAction === "generateVideoPrompt"} icon={<Video size={17} />} idleText={mode === "direct_video" ? "生成直接视频任务" : "生成图片转视频方案"} loadingText="正在生成视频方案..." />
        </button>
      </div>
      <div className="panel">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="section-title">智能体视频任务</h2><p className="mt-1 text-sm text-ink/60">复制后交给智能体准备最终视频和 video-path.txt。</p></div><IconButton title="复制视频任务" onClick={() => copy(videoTaskContent)} icon={<Clipboard size={17} />} /></div>
        <textarea className="code-textarea min-h-[560px]" value={videoTaskContent || "生成后显示视频执行任务。"} readOnly />
      </div>
    </div>
  );
}

function PromptsPanel(props: {
  plan?: WeeklyPlan;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number) => void;
  promptResults: Record<number, PromptResult>;
  draftVariants: Record<number, DraftVariant[]>;
  generateDraftVariants: (task: NoteTask) => Promise<DraftVariant[] | null>;
  generatePrompt: (task: NoteTask, selectedDraft: DraftVariant) => Promise<PromptResult | null>;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const { plan, selectedNoteId, setSelectedNoteId, promptResults, draftVariants, generateDraftVariants, generatePrompt, copy, loading, loadingAction } = props;
  const note = plan?.noteTasks.find((task) => task.id === selectedNoteId) ?? plan?.noteTasks?.[0];
  const result = note ? promptResults[note.id] : null;
  const variants = note ? draftVariants[note.id] || [] : [];
  const openclawTaskContent = result?.openclawTask?.content || result?.prompt.content || "";
  if (!plan || !note) return <div className="panel"><EmptyState text="先生成本周内容，再生成笔记草稿。" /></div>;
  const hasMediaPlan = Boolean(note.plan?.trim());
  const isVideo = note.type === "video_text";
  return (
    <div className="grid gap-5 xl:grid-cols-[0.45fr_0.55fr]">
      <div className="panel">
        <h2 className="section-title">选择本周内容</h2>
        <div className="space-y-2">
          {plan.noteTasks.map((task) => (
            <button key={task.id} type="button" onClick={() => setSelectedNoteId(task.id)} className={clsx("w-full rounded border p-3 text-left text-sm", task.id === note.id ? "border-ink bg-white" : "border-ink/10 bg-white/60")}>
              <div className="font-medium">{task.topicTitle}</div>
              <div className="mt-1 text-xs text-ink/60">{task.publishAt} / {task.status}</div>
              <div className={clsx("mt-1 text-xs font-medium", task.plan?.trim() ? "text-teal" : "text-coral")}>
                {task.plan?.trim() ? (task.type === "video_text" ? "视频方案已完成" : "图片方案已完成") : (task.type === "video_text" ? "待生成视频方案" : "待生成图片方案")}
              </div>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void generateDraftVariants(note)} disabled={loading || !hasMediaPlan} aria-busy={loadingAction === "generateDraftVariants"} className="primary-button mt-4">
          <ActionButtonContent
            loading={loadingAction === "generateDraftVariants"}
            icon={<Wand2 size={17} />}
            idleText="生成 3 个标题正文版本"
            loadingText="正在生成 3 个版本..."
          />
        </button>
        <p className={clsx("mt-3 text-xs leading-5", hasMediaPlan ? "text-ink/60" : "font-medium text-coral")}>
          {hasMediaPlan
            ? `${isVideo ? "视频" : "图片"}方案已完成。生成三个版本后，选择一个版本复制草稿箱任务。`
            : `当前笔记尚未生成${isVideo ? "视频" : "图片"}方案，请先前往“${isVideo ? "视频方案" : "图片方案 → 单篇精修模式"}”完成方案。`}
        </p>
      </div>
      <div className="space-y-5">
        <div className="panel">
          <div className="mb-4">
            <h2 className="section-title">选择标题和正文</h2>
            <p className="mt-1 text-sm text-ink/60">三个版本只保存在当前页面。选择后生成的智能体指令会原样使用标题和正文，不再由智能体改写。</p>
          </div>
          {variants.length ? <div className="divide-y divide-ink/10 border-y border-ink/10">
            {variants.map((variant) => (
              <section key={variant.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded bg-teal/10 px-2 py-1 text-sm font-semibold text-teal">{variant.label}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const generated = await generatePrompt(note, variant);
                      if (generated) copy(generated.openclawTask?.content || generated.prompt.content);
                    }}
                    disabled={loading || !hasMediaPlan}
                    aria-busy={loadingAction === "generatePrompt"}
                    className="secondary-button"
                  >
                    <ActionButtonContent loading={loadingAction === "generatePrompt"} icon={<Clipboard size={16} />} idleText="复制草稿箱指令" loadingText="正在生成指令..." />
                  </button>
                </div>
                <div className="mt-3">
                  <h3 className="text-base font-semibold leading-6 text-ink">{variant.title}</h3>
                </div>
                <div className="mt-3">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-ink/75">{variant.body}</p>
                </div>
              </section>
            ))}
          </div> : <EmptyState text="点击左侧按钮后，后端 AI 会生成三个表达强度不同的标题和正文版本。" />}
        </div>
        {openclawTaskContent && <div className="panel">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-title">已复制的智能体{isVideo ? "视频" : "图文"}草稿箱任务</h2>
              <p className="mt-1 text-sm text-ink/60">任务会使用所选版本的原文、已有{isVideo ? "视频" : "图片"}方案成品，并保存到指定账号草稿箱。</p>
            </div>
            <div className="flex gap-2">
              <IconButton title="复制完整任务" onClick={() => copy(openclawTaskContent)} icon={<Clipboard size={17} />} />
              <IconButton title="导出 Markdown" onClick={() => downloadText(`note-${note.id}-agent-draft-task.md`, openclawTaskContent)} icon={<Download size={17} />} />
            </div>
          </div>
          <textarea className="code-textarea min-h-[360px]" value={openclawTaskContent} readOnly />
        </div>}

      </div>
    </div>
  );
}

function InteractionsPanel(props: {
  selected?: Account;
  latestPlan?: WeeklyPlan;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number) => void;
  draft: {
    plan?: InteractionPlan;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    discoveryPrompt?: string;
    commentPrompt?: string;
    summary?: { targetUsersMarkdown: string; commentDraftsMarkdown: string };
  };
  prepareInteractionPlan: (noteTaskId?: number | null, options?: { publishedNoteUrl?: string; interactionGoal?: string }) => void;
  saveInteractionResults: (event: React.FormEvent<HTMLFormElement>) => void;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const {
    selected,
    latestPlan,
    selectedNoteId,
    setSelectedNoteId,
    draft,
    prepareInteractionPlan,
    copy,
    loading,
    loadingAction
  } = props;
  const note = latestPlan?.noteTasks.find((task) => task.id === selectedNoteId) ?? latestPlan?.noteTasks?.[0];
  const defaultGoal = note
    ? `围绕「${note.topicTitle}」寻找有相关真实需求的普通用户笔记，以具体赞美和轻微种草为主进行自然评论互动。`
    : "寻找可能对账号内容感兴趣的普通用户笔记，以具体赞美和轻微种草为主进行自然评论互动。";
  const [interactionGoal, setInteractionGoal] = useState(defaultGoal);

  useEffect(() => {
    setInteractionGoal(defaultGoal);
  }, [note?.id, defaultGoal]);

  if (!selected) return <EmptyState />;

  const latest = draft.plan || selected.interactionPlans?.[0];
  const taskPrompt = draft.discoveryPrompt || latest?.discoveryPrompt || "";

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">目标用户互动</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink/60">
              根据当篇笔记和互动目标生成完整执行任务。智能体将负责选词、搜索、过滤普通用户、生成评论并累计完成 10 篇有效互动。
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded border border-teal/30 bg-teal/5 p-4">
            <div className="text-xs font-medium text-ink/55">1. 选择笔记</div>
            <div className="mt-2 font-semibold">{note ? "已选择" : "待选择"}</div>
            <p className="mt-2 text-sm text-ink/60">用一周计划里的笔记作为互动上下文。</p>
          </div>
          <div className={clsx("rounded border p-4", latest?.searchKeywords ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">2. 已发布链接</div>
            <div className="mt-2 font-semibold">{latest?.searchKeywords ? "已记录" : "待填写"}</div>
            <p className="mt-2 text-sm text-ink/60">粘贴小红书已发布笔记 URL。</p>
          </div>
          <div className={clsx("rounded border p-4", taskPrompt ? "border-teal/30 bg-teal/5" : "border-ink/10 bg-white")}>
            <div className="text-xs font-medium text-ink/55">3. 互动指令</div>
            <div className="mt-2 font-semibold">{taskPrompt ? "已生成" : "待生成"}</div>
            <p className="mt-2 text-sm text-ink/60">复制整份任务给智能体执行。</p>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-5">
          <form
            className="panel min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              prepareInteractionPlan(note?.id ?? null, {
                publishedNoteUrl: String(form.get("publishedNoteUrl") || ""),
                interactionGoal: String(form.get("interactionGoal") || "")
              });
            }}
          >
            <h2 className="section-title">生成互动执行任务</h2>
            <p className="mt-1 text-sm text-ink/60">选择本周内容并填写互动目标；已发布链接用于记录和核对，可不填。</p>

            <div className="mt-4 space-y-3">
              {!latestPlan?.noteTasks?.length ? (
                <EmptyState text="建议先生成一周计划。也可以只填写已发布链接和互动目标。" />
              ) : (
                <label className="field">
                  <span>关联笔记任务</span>
                  <select value={note?.id ?? ""} onChange={(event) => setSelectedNoteId(Number(event.target.value))}>
                    {latestPlan.noteTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.topicTitle}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <Input name="publishedNoteUrl" label="已发布笔记 URL" defaultValue={latest?.searchKeywords || ""} placeholder="粘贴小红书已发布笔记链接" />
              <Textarea name="interactionGoal" label="互动目标" value={interactionGoal} onChange={setInteractionGoal} />

              <button type="submit" disabled={loading} aria-busy={loadingAction === "prepareInteractionPlan"} className="primary-button">
                <ActionButtonContent
                  loading={loadingAction === "prepareInteractionPlan"}
                  icon={<MessageCircle size={17} />}
                  idleText="生成互动执行指令"
                  loadingText="正在生成互动执行指令..."
                />
              </button>
              <p className="text-xs text-ink/55">先汇总 20 篇候选，再依次评论；成功 10 篇、候选池处理完或触发风控时停止。</p>
            </div>
          </form>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="panel min-w-0 overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="section-title">给智能体的互动执行任务</h2>
                <p className="mt-1 text-sm text-ink/60">包含真实 CLI、主/子会话分工、20 篇候选池、普通用户筛选和成功计数要求。</p>
              </div>
              <div className="flex gap-2">
                <IconButton title="复制互动任务" onClick={() => copy(taskPrompt)} icon={<Clipboard size={17} />} />
                <IconButton title="导出 Markdown" onClick={() => downloadText(`${selected.name}-interaction-task.md`, taskPrompt)} icon={<Download size={17} />} />
              </div>
            </div>
            <textarea className="code-textarea min-h-[720px]" value={taskPrompt || "选择一篇本周内容并生成互动执行指令。"} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsPanel(props: {
  selected?: Account;
  latestPlan?: WeeklyPlan;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number) => void;
  generatePostReview: (event: React.FormEvent<HTMLFormElement>) => void;
  saveExpertRuleSelection: (enabledRuleIds: number[]) => Promise<void>;
  loading: boolean;
  loadingAction: string | null;
}) {
  const { selected, latestPlan, selectedNoteId, setSelectedNoteId, generatePostReview, saveExpertRuleSelection, loading, loadingAction } = props;
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  const note = latestPlan?.noteTasks.find((task) => task.id === selectedNoteId) ?? latestPlan?.noteTasks?.[0];
  const latestReview = note
    ? selected?.postReviews?.find((review) => review.noteTaskId === note.id)
    : selected?.postReviews?.[0];

  useEffect(() => {
    setSelectedRuleIds((selected?.expertRules || []).filter((rule) => isExpertRuleEnabled(rule.enabled)).slice(0, 5).map((rule) => rule.id));
  }, [selected?.id, selected?.expertRules]);

  function toggleRule(ruleId: number) {
    setSelectedRuleIds((current) => {
      if (current.includes(ruleId)) return current.filter((id) => id !== ruleId);
      return current.length >= 5 ? current : [...current, ruleId];
    });
  }

  if (!selected) return <div className="panel"><EmptyState /></div>;

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">专家复盘</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/60">
              每发完一篇，将实际内容和可用证据提交给 AI 完成诊断；候选规则会自动保存，再由你选择是否用于后续内容生成。
            </p>
          </div>
          <div className="rounded bg-teal/10 px-3 py-2 text-sm font-medium text-teal">
            已沉淀 {selected.expertRules?.length || 0} 条候选规则
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded border border-ink/10 bg-white p-4">
            <div className="font-semibold">1. 选帖子</div>
            <p className="mt-1 text-sm leading-6 text-ink/60">从本周内容里选一条，也可以手动填写已发布标题。</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <div className="font-semibold">2. 看证据</div>
            <p className="mt-1 text-sm leading-6 text-ink/60">输入曝光、点击、收藏、评论、私信、转化和真实反馈。</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <div className="font-semibold">3. 自动沉淀</div>
            <p className="mt-1 text-sm leading-6 text-ink/60">复盘完成后自动保存候选规则，后续生成会按相关模块优先参考。</p>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <form className="panel min-w-0" onSubmit={generatePostReview}>
          <div className="mb-4">
            <h2 className="section-title">单篇帖子复盘</h2>
            <p className="mt-1 text-sm text-ink/60">重点不是填完整表格，而是把这篇帖子的真实证据留下来。</p>
          </div>

          <div className="grid gap-3">
            {latestPlan?.noteTasks?.length ? (
              <label className="field">
                <span>选择笔记</span>
                <select name="noteTaskId" value={note?.id ?? ""} onChange={(event) => setSelectedNoteId(Number(event.target.value))}>
                  {latestPlan.noteTasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.topicTitle}</option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="noteTaskId" value="" readOnly />
            )}
            <Input name="postTitle" label="实际发布标题" defaultValue={note?.topicTitle || ""} placeholder="如果和计划标题不同，填最终发布标题" />
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="postUrl" label="帖子链接（可选）" placeholder="粘贴小红书笔记 URL" />
              <Input name="publishedAt" label="发布时间（可选）" defaultValue={note?.publishAt || ""} />
            </div>
            <Textarea
              name="metrics"
              label="发布表现数据（可选）"
              placeholder={"曝光：\n点击：\n点赞：\n收藏：\n评论：\n私信：\n转化："}
              help="没有完整后台数据也没关系，先填能看到的。"
            />
            <Textarea name="comments" label="评论区 / 私信 / 用户反馈（可选）" placeholder="粘贴典型评论、私信问题、客户反馈。" />
            <details className="rounded border border-ink/10 bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium">补充专家改稿和实际内容（可选）</summary>
              <div className="mt-3 grid gap-3">
                <Textarea name="actualContent" label="实际发布正文" placeholder="粘贴最终发布的正文内容。" />
                <Textarea name="expertFeedback" label="专家点评 / 客户反馈" placeholder="专家说哪里需要改、客户最终选择了什么。" />
                <Textarea name="editComparison" label="修改前后对比" placeholder={"原始标题：...\n最终标题：...\n修改理由：..."} />
                <Textarea name="subjective" label="你的观察" placeholder="例如：评论集中问价格；收藏高但私信少；封面像广告。" />
              </div>
            </details>
            <Textarea
              name="distillGoal"
              label="希望沉淀成什么能力"
              defaultValue="提炼这一篇对应的标题规则、封面规则、图片方案规则、正文规则、评论引导规则、风险规则和下次测试变量。"
            />
          </div>

          <button type="submit" disabled={loading} aria-busy={loadingAction === "generatePostReview"} className="primary-button mt-4">
            <ActionButtonContent
              loading={loadingAction === "generatePostReview"}
              icon={<Send size={17} />}
              idleText="执行专家复盘"
              loadingText="AI 正在执行专家复盘..."
            />
          </button>
        </form>

        <div className="min-w-0 space-y-5">
          <div className="panel min-w-0">
            <div className="mb-3">
              <div>
                <h2 className="section-title">专家复盘结果</h2>
                <p className="mt-1 text-sm text-ink/60">显示当前笔记最近一次复盘；候选规则已同步保存到服务端规则库。</p>
              </div>
            </div>
            {latestReview ? (
              <div className="rounded border border-ink/10 bg-white p-4">
                <div className="mb-2 text-xs font-medium text-teal">复盘总结</div>
                <div className="whitespace-pre-wrap text-sm leading-7">{latestReview.summary}</div>
              </div>
            ) : <EmptyState text="执行后，这里会显示 AI 专家复盘结果。" />}
          </div>

          <div className="panel min-w-0">
            <div className="mb-3">
              <h2 className="section-title">规则库选择</h2>
              <p className="mt-1 text-sm text-ink/60">当前账号共 {selected.expertRules?.length || 0} 条规则。勾选后才会用于后续生成，最多启用 5 条。</p>
            </div>
            {selected.expertRules?.length ? (
              <div className="space-y-3">
                <div className="max-h-[500px] space-y-2 overflow-y-auto pr-2">
                  {selected.expertRules.map((rule) => (
                    <div key={rule.id} className="rounded border border-ink/10 bg-white p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                        <label className="flex cursor-pointer items-center gap-2 text-ink">
                          <input
                            type="checkbox"
                            checked={selectedRuleIds.includes(rule.id)}
                            disabled={loading || (!selectedRuleIds.includes(rule.id) && selectedRuleIds.length >= 5)}
                            onChange={() => toggleRule(rule.id)}
                          />
                          <span>{selectedRuleIds.includes(rule.id) ? "已选择" : "未选择"}</span>
                        </label>
                        <span>{rule.module}</span>
                        <span>{rule.source || "manual"}</span>
                      </div>
                      <div className="text-sm font-medium leading-6">{rule.rule}</div>
                      {rule.reason ? <div className="mt-2 text-xs leading-5 text-ink/60">依据：{rule.reason}</div> : null}
                      {rule.applicableWhen ? <div className="mt-1 text-xs leading-5 text-ink/60">适用：{rule.applicableWhen}</div> : null}
                      {rule.notApplicableWhen ? <div className="mt-1 text-xs leading-5 text-ink/60">不适用：{rule.notApplicableWhen}</div> : null}
                      {rule.nextTest ? <div className="mt-1 text-xs leading-5 text-ink/60">下次验证：{rule.nextTest}</div> : null}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-ink/10 pt-3">
                  <span className="text-xs text-ink/55">已选 {selectedRuleIds.length}/5 条</span>
                  <button
                    type="button"
                    disabled={loading}
                    aria-busy={loadingAction === "saveExpertRuleSelection"}
                    className="primary-button"
                    onClick={() => void saveExpertRuleSelection(selectedRuleIds)}
                  >
                    <ActionButtonContent
                      loading={loadingAction === "saveExpertRuleSelection"}
                      icon={<Save size={17} />}
                      idleText="保存规则选择"
                      loadingText="正在保存规则选择..."
                    />
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState text="还没有候选规则。先执行一次专家复盘。" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IndustryLearningPanel(props: {
  selected?: Account;
  draft: {
    research?: IndustryKnowledgeResearch;
    commands?: Array<{ category: string; command: string; description: string; safetyNote: string }>;
    researchPrompt?: string;
  };
  prepareIndustryLearning: (event: React.FormEvent<HTMLFormElement>) => void;
  saveIndustryLearning: (event: React.FormEvent<HTMLFormElement>) => void;
  copy: (text: string) => void;
  loading: boolean;
  loadingAction: string | null;
}) {
  const { selected, draft, prepareIndustryLearning, saveIndustryLearning, copy, loading, loadingAction } = props;
  const commands = draft.commands || safeParseCommands(draft.research?.commandJson || selected?.industryKnowledgeResearches?.[0]?.commandJson || "[]");
  const researchPrompt = draft.researchPrompt || draft.research?.researchPrompt || selected?.industryKnowledgeResearches?.[0]?.researchPrompt || "";
  const commandText = commands.map((item) => item.command).join("\n");

  if (!selected) return <div className="panel"><EmptyState /></div>;

  return (
    <div className="space-y-5">
      <div className="panel">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">行业学习</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/60">
              这里负责持续学习外部经验：全国同类型爆款、运营专家文章、案例拆解和评论痛点。学到的方法再沉淀进规则库。
            </p>
          </div>
          <div className="rounded bg-teal/10 px-3 py-2 text-sm font-medium text-teal">
            研究记录 {selected.industryKnowledgeResearches?.length || 0} 次
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded border border-ink/10 bg-white p-4">
            <div className="font-semibold">1. 广泛搜索</div>
            <p className="mt-1 text-sm leading-6 text-ink/60">全国/全网优先，不被本地内容限制风格。</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <div className="font-semibold">2. 提炼精髓</div>
            <p className="mt-1 text-sm leading-6 text-ink/60">把标题、封面、图文结构、评论转化方法拆出来。</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <div className="font-semibold">3. 更新规则</div>
            <p className="mt-1 text-sm leading-6 text-ink/60">只保存可验证、可复用、能适配当前账号的方法。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-5">
          <form className="panel" onSubmit={prepareIndustryLearning}>
            <div className="mb-4">
              <h2 className="section-title">生成学习任务</h2>
              <p className="mt-1 text-sm text-ink/60">默认会要求全国/全网优先，本地只做补充对照。</p>
            </div>
            <div className="grid gap-3">
              <Textarea
                name="topic"
                label="学习主题"
                defaultValue="小红书图文爆款方法、标题封面、图片真实感、评论转化和复盘方法"
              />
              <Input name="searchScope" label="搜索范围" defaultValue="全国 / 全网优先，本地只作为补充" />
            </div>
            <button type="submit" disabled={loading} aria-busy={loadingAction === "prepareIndustryLearning"} className="primary-button mt-4">
              <ActionButtonContent
                loading={loadingAction === "prepareIndustryLearning"}
                icon={<Search size={17} />}
                idleText="生成行业学习任务"
                loadingText="正在生成行业学习任务..."
              />
            </button>
          </form>

          <div className="panel">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">搜索命令</h2>
                <p className="mt-1 text-sm text-ink/60">先执行只读搜索，再把结果粘回右侧。</p>
              </div>
              <IconButton title="复制命令" onClick={() => copy(commandText)} icon={<Clipboard size={17} />} />
            </div>
            {commandText ? <MarkdownBox value={commandText} /> : <EmptyState text="生成任务后这里会显示搜索命令。" />}
          </div>

          <div className="panel">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">研究 Prompt</h2>
                <p className="mt-1 text-sm text-ink/60">用于让大模型从搜索材料中提炼方法和候选规则。</p>
              </div>
              <IconButton title="复制 Prompt" onClick={() => copy(researchPrompt)} icon={<FileText size={17} />} />
            </div>
            {researchPrompt ? <MarkdownBox value={researchPrompt} /> : <EmptyState text="生成任务后这里会显示研究 Prompt。" />}
          </div>
        </div>

        <div className="space-y-5">
          <form className="panel" onSubmit={saveIndustryLearning}>
            <div className="mb-4">
              <h2 className="section-title">保存学习材料</h2>
              <p className="mt-1 text-sm text-ink/60">粘贴搜索结果、文章摘录或大模型总结，作为之后复盘和规则更新的依据。</p>
            </div>
            <input type="hidden" name="topic" value={draft.research?.topic || selected.industryKnowledgeResearches?.[0]?.topic || ""} readOnly />
            <input type="hidden" name="searchScope" value={draft.research?.searchScope || selected.industryKnowledgeResearches?.[0]?.searchScope || ""} readOnly />
            <Textarea name="rawResults" label="搜索结果 / 文章摘录" placeholder="粘贴小红书搜索结果、文章链接、专家观点摘录、案例拆解。" />
            <Textarea name="summaryMarkdown" label="学习总结（可选）" placeholder="粘贴大模型整理后的方法论和规则候选。" />
            <button type="submit" className="secondary-button mt-4">
              <Save size={17} /> 保存学习材料
            </button>
          </form>

          <div className="panel">
            <h2 className="section-title">规则沉淀方式</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">
              行业学习材料会作为复盘参考保留；可复用规则仅由“专家复盘”自动生成并保存，避免手工 JSON 规则绕过账号级数量和启用状态限制。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthPanel({ health, loadHealth }: { health: any; loadHealth: () => void }) {
  return (
    <div className="panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">系统状态</h2>
        <button type="button" onClick={loadHealth} className="secondary-button">
          <Activity size={17} /> 刷新诊断
        </button>
      </div>
      {!health ? (
        <EmptyState text="点击刷新诊断查看环境状态。" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Info label="当前模式" value={health.mode} />
          <Info label="AI 服务" value={`${health.llm.enabled ? "可用" : "不可用"} / ${health.llm.model}`} />
          <Info label="uv" value={`${health.uv.available ? "可用" : "不可用"} / ${health.uv.version}`} />
          <div className="md:col-span-2">
            <div className="mb-2 text-sm font-medium">环境诊断报告</div>
            <div className="space-y-2">
              {health.diagnostics.map((item: string) => (
                <div key={item} className="rounded border border-ink/10 bg-white px-3 py-2 text-sm">{item}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input(props: {
  label: string;
  type?: React.HTMLInputTypeAttribute;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  name?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type}
        name={props.name}
        value={props.value}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
      {props.help && <span className="text-xs leading-5 text-ink/50">{props.help}</span>}
    </label>
  );
}

function Textarea(props: {
  label: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  name?: string;
  help?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <textarea name={props.name} value={props.value} defaultValue={props.defaultValue} placeholder={props.placeholder} rows={4} onChange={(event) => props.onChange?.(event.target.value)} />
      {props.help && <span className="text-xs leading-5 text-ink/50">{props.help}</span>}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-ink/10 bg-white p-3">
      <div className="text-xs text-ink/55">{label}</div>
      <div className="mt-1 break-words text-sm">{value}</div>
    </div>
  );
}

function ActionButtonContent(props: {
  loading: boolean;
  icon: React.ReactNode;
  idleText: string;
  loadingText: string;
}) {
  return (
    <>
      {props.loading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : props.icon}
      <span>{props.loading ? props.loadingText : props.idleText}</span>
    </>
  );
}

function IconButton({ title, onClick, icon }: { title: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="icon-button">
      {icon}
    </button>
  );
}

function MarkdownBox({ value }: { value: string }) {
  return (
    <pre className="max-h-[58vh] w-full max-w-full min-w-0 overflow-auto whitespace-pre-wrap break-words rounded border border-ink/10 bg-white p-4 text-sm leading-6 [overflow-wrap:anywhere]">
      {value}
    </pre>
  );
}

function EmptyState({ text = "还没有数据，请先创建账号。" }: { text?: string }) {
  return <div className="rounded border border-dashed border-ink/20 bg-white/60 p-8 text-center text-sm text-ink/60">{text}</div>;
}

function splitChoiceText(value: string) {
  return value
    .split(/[，,、；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function MultiChoiceField(props: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  help?: string;
  onChange: (value: string) => void;
}) {
  const tokens = splitChoiceText(props.value);
  const selected = props.options.filter((option) => tokens.includes(option));
  const extra = tokens.filter((item) => !props.options.includes(item)).join("、");
  const write = (nextSelected: string[], nextExtra: string) => {
    props.onChange([...nextSelected, ...splitChoiceText(nextExtra)].join("、"));
  };

  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="flex flex-wrap gap-2 rounded border border-ink/10 bg-white p-2">
        {props.options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                const next = active ? selected.filter((item) => item !== option) : [...selected, option];
                write(next, extra);
              }}
              className={clsx(
                "rounded border px-3 py-2 text-sm transition",
                active ? "border-teal/60 bg-teal/10 text-teal" : "border-ink/10 bg-white hover:border-teal/40 hover:bg-teal/5"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      <input
        value={extra}
        placeholder={props.placeholder || "其他补充"}
        onChange={(event) => write(selected, event.target.value)}
        className="mt-2"
      />
      {props.help && <span className="text-xs leading-5 text-ink/50">{props.help}</span>}
    </div>
  );
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseCommands(value: string) {
  return safeJsonArray(value).filter(
    (item): item is { category: string; command: string; description: string; safetyNote: string } =>
      item &&
      typeof item === "object" &&
      typeof item.category === "string" &&
      typeof item.command === "string" &&
      typeof item.description === "string" &&
      typeof item.safetyNote === "string"
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function weeklyPlanMarkdown(plan: WeeklyPlan) {
  return `# ${plan.theme}

## 本周目标
${plan.goal}

## note_tasks
${plan.noteTasks
  .map(
    (task, index) => `### ${index + 1}. ${task.topicTitle}
- 发布时间：${task.publishAt}
- 内容类型：${task.contentType}
- 帖子形式：${task.type === "video_text" ? "视频笔记" : "图文笔记"}
- 选定爆款文风：${task.writingStyleName || "未选择"}
- 内容目标：${task.contentGoal}
- 目标用户：${task.targetUser}
- 用户痛点：${task.painPoint}
- 核心观点：${task.coreView}
- 可写事实与核心观点：${task.coreView}
- 所需素材：${task.requiredMaterials}
- 推荐素材：${task.recommendedAssets}
- 封面文案方向：${task.coverCopyDirection}
- 评论区钩子：${task.commentHook}
- 预期目标：${task.expectedGoal}`
  )
  .join("\n\n")}`;
}
