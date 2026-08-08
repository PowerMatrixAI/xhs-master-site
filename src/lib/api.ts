/**
 * 账号 API 客户端工具
 * 默认测试服: http://xhsapitest.powermatrix.tech/client
 */
import { getBackendApiBaseUrl } from "@/lib/backendApi";

const API_BASE_URL = getBackendApiBaseUrl();

/* ---------- 类型定义 ---------- */

export interface LoginResponse {
  uid: number;
  name: string;
  avatarUrl: string;
  role: string;
  /** 登录所属渠道；小红书客户端固定为 xhs */
  channel: "xhs" | "douyin";
  signature: string;
  signatureNearExpired: number;
}

export interface ApiResponse<T = unknown> {
  status: boolean;
  data: T;
  message: string;
  code: string;
}

export interface BackendAccountListItem {
  id: number;
  name: string;
  accountParam: string;
  accountType: string;
  stage: string;
  personaBase: string;
  city: string;
  status: string;
  createdAt: string;
}

export interface BackendAccountDetail {
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
  status: string;
  strategyMarkdown?: string;
  strategyPositioning?: string;
  strategyExecGuide?: string;
  profileContent?: string;
  profileVersion?: number;
  assets?: BackendAsset[];
  weeklyPlans?: BackendWeeklyPlan[];
  postReviews?: BackendPostReview[];
  expertRules?: BackendExpertRule[];
  createdAt: string;
  updatedAt: string;
}

export type BackendPostReviewInput = {
  postTitle: string;
  postUrl: string;
  publishedAt: string;
  actualContent: string;
  metrics: string;
  comments: string;
  expertFeedback: string;
  editComparison: string;
  subjective: string;
  distillGoal: string;
};

export type BackendExpertRule = {
  id: number;
  accountId?: number;
  postReviewId?: number;
  accountType: string;
  module: string;
  rule: string;
  positiveExample?: string;
  negativeExample?: string;
  reason?: string;
  source: string;
  applicableWhen?: string;
  notApplicableWhen?: string;
  nextTest?: string;
  status: string;
  enabled?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type BackendPostReview = {
  id: number;
  accountId?: number;
  noteTaskId: number | null;
  input: BackendPostReviewInput;
  summary: string;
  evidenceAssessment: string;
  aiModel: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

export type SavePostReviewResultPayload = {
  accountId: number;
  noteTaskId?: number;
  input: BackendPostReviewInput;
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
};

export interface BackendAsset {
  id: number;
  filePath: string;
  fileUrl?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface BackendNoteTask {
  id?: number;
  type: "image_text" | "video_text";
  publishAt: string;
  contentType: string;
  contentGoal: string;
  topicTitle: string;
  targetUser: string;
  painPoint: string;
  coreView: string;
  writingStyleName?: string;
  writingStyleReference?: string;
  // 服务端迁移前的兼容字段；前端不再读取或生成正文结构，写入时固定为空字符串。
  bodyStructure?: string;
  requiredMaterials: string;
  recommendedAssets: string;
  coverCopyDirection: string;
  commentHook: string;
  expectedGoal: string;
  status: string;
  bodyDraft?: string;
  plan?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackendWeeklyPlan {
  id?: number;
  weekStart: string;
  theme: string;
  goal: string;
  frequency: number;
  ratio?: string;
  testHypothesis: string;
  commercializationMove: string;
  interactionGoal: string;
  availableAssets: string;
  taboos: string;
  status?: string;
  noteTasks: BackendNoteTask[];
  createdAt?: string;
  updatedAt?: string;
}

/* ---------- localStorage 存储工具 ---------- */

const TOKEN_KEY = "xhs_token";
const USER_KEY = "xhs_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): LoginResponse | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginResponse;
  } catch {
    return null;
  }
}

export function setAuth(data: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, data.signature);
  localStorage.setItem(USER_KEY, JSON.stringify(data));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function buildAuthHeaders() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    throw new Error("未登录");
  }

  return {
    "Content-Type": "application/json",
    "Xhs-Language": "zh-cn",
    "Xhs-Sign": token,
    "Xhs-Person": String(user.uid),
    "Xhs-Time": Math.floor(Date.now() / 1000).toString(),
    "Xhs-Request-Id": `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    "Xhs-Test": "1"
  };
}

/* ---------- 通用请求函数 ---------- */

/**
 * 发送无需签名的请求 (登录/注册)
 */
async function publicRequest<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Xhs-Language": "zh-cn"
    },
    body: JSON.stringify(body)
  });
  return res.json() as Promise<ApiResponse<T>>;
}

/**
 * 发送需要签名的请求
 * 自动携带 JWT Token 和签名头
 *
 * 注意: 本地开发环境通过 Xhs-Test: 1 跳过签名校验
 * 生产环境需通过 Next.js API Route 在服务端计算 MD5 签名
 */
export async function authRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body } = options;
  const bodyStr = body ? JSON.stringify(body) : "";
  const headers = buildAuthHeaders();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined
  });
  return res.json() as Promise<ApiResponse<T>>;
}

/* ---------- 业务接口 ---------- */

/**
 * 登录
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await publicRequest<LoginResponse>("/login/v1/login", {
    email,
    channel: "xhs",
    password
  });
  if (!res.status) {
    throw new Error(res.message || "登录失败");
  }
  setAuth(res.data);
  return res.data;
}

/**
 * 注册
 */
export async function register(
  email: string,
  name: string,
  password: string,
  betaCode: string
): Promise<LoginResponse> {
  const res = await publicRequest<LoginResponse>("/login/v1/register", {
    email,
    channel: "xhs",
    name,
    password,
    betaCode
  });
  if (!res.status) {
    throw new Error(res.message || "注册失败");
  }
  setAuth(res.data);
  return res.data;
}

/**
 * 自动登录 (使用已有 token 刷新)
 */
export async function autoLogin(): Promise<LoginResponse> {
  const res = await authRequest<LoginResponse>("/login/v1/autoLogin", { method: "POST" });
  if (!res.status) {
    throw new Error(res.message || "登录已过期");
  }
  setAuth(res.data);
  return res.data;
}

/**
 * 获取用户资料
 */
export async function getProfile() {
  return authRequest("/user/v1/profile");
}

export async function fetchBackendAccounts(): Promise<BackendAccountDetail[]> {
  const listRes = await authRequest<{ accounts?: BackendAccountListItem[] }>("/account/v1/list");
  if (!listRes.status) {
    throw new Error(listRes.message || "获取账号列表失败");
  }

  const accounts = listRes.data?.accounts || [];
  const details: BackendAccountDetail[] = [];

  for (const item of accounts) {
    const detailRes = await authRequest<BackendAccountDetail>("/account/v1/detail", {
      method: "POST",
      body: { id: item.id }
    });

    if (!detailRes.status || !detailRes.data) {
      continue;
    }
    details.push(detailRes.data);
  }

  return details;
}

export async function fetchBackendAccountDetail(id: number): Promise<BackendAccountDetail> {
  const detailRes = await authRequest<BackendAccountDetail>("/account/v1/detail", {
    method: "POST",
    body: { id }
  });

  if (!detailRes.status || !detailRes.data) {
    throw new Error(detailRes.message || "获取账号详情失败");
  }

  return detailRes.data;
}

export async function createBackendAccount(body: Record<string, unknown>) {
  const res = await authRequest<{ id: number }>("/account/v1/create", {
    method: "POST",
    body
  });
  if (!res.status) {
    throw new Error(res.message || "创建账号失败");
  }
  return res.data;
}

export async function deleteBackendAccount(id: number) {
  const res = await authRequest("/account/v1/delete", {
    method: "POST",
    body: { id }
  });
  if (!res.status) {
    throw new Error(res.message || "删除账号失败");
  }
  return res.data;
}

export async function updateBackendAccount(body: Record<string, unknown>) {
  const res = await authRequest("/account/v1/update", {
    method: "POST",
    body
  });
  if (!res.status) {
    throw new Error(res.message || "更新账号失败");
  }
  return res.data;
}

export async function saveBackendAssets(accountId: number, assets: BackendAsset[]) {
  const res = await authRequest<{ assets: BackendAsset[] }>("/account/v1/saveAssets", {
    method: "POST",
    body: {
      accountId,
      assets: assets.map((asset) => ({ ...asset, authorizationState: asset.authorizationState || "" }))
    }
  });
  if (!res.status) {
    throw new Error(res.message || "保存素材失败");
  }
  return res.data.assets || [];
}

export async function saveBackendWeeklyPlan(accountId: number, plan: BackendWeeklyPlan) {
  const res = await authRequest<BackendWeeklyPlan>("/account/v1/saveWeeklyPlan", {
    method: "POST",
    body: { accountId, plan }
  });
  if (!res.status || !res.data) {
    throw new Error(res.message || "保存周计划失败");
  }
  return res.data;
}

export async function saveBackendNoteTask(accountId: number, weeklyPlanId: number, noteTask: BackendNoteTask) {
  const res = await authRequest<BackendNoteTask>("/account/v1/saveNoteTask", {
    method: "POST",
    body: { accountId, weeklyPlanId, noteTask }
  });
  if (!res.status || !res.data) {
    throw new Error(res.message || "保存单篇内容失败");
  }
  return res.data;
}

export async function saveBackendPostReviewResult(payload: SavePostReviewResultPayload) {
  const res = await authRequest<{ postReview: BackendPostReview; rules: BackendExpertRule[] }>("/postReview/v1/saveResult", {
    method: "POST",
    body: payload as unknown as Record<string, unknown>
  });
  if (!res.status || !res.data?.postReview) {
    throw new Error(res.message || "保存专家复盘结果失败");
  }
  return res.data;
}

export async function setBackendExpertRulesEnabled(accountId: number, enabledRuleIds: number[]) {
  const normalizedAccountId = Number(accountId);
  const normalizedRuleIds = Array.from(new Set(
    enabledRuleIds
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  ));
  if (!Number.isSafeInteger(normalizedAccountId) || normalizedAccountId <= 0) {
    throw new Error("账号 ID 无效，无法保存规则选择。");
  }
  if (normalizedRuleIds.length !== enabledRuleIds.length) {
    throw new Error("规则 ID 无效，无法保存规则选择。");
  }
  const res = await authRequest<{ rules?: BackendExpertRule[]; expertRules?: BackendExpertRule[] } | BackendExpertRule[]>("/expertRule/v1/setEnabled", {
    method: "POST",
    body: { accountId: normalizedAccountId, enabledRuleIds: normalizedRuleIds }
  });
  if (!res.status || !res.data) {
    throw new Error(res.message || "保存规则选择失败");
  }
  return Array.isArray(res.data) ? res.data : res.data.rules || res.data.expertRules || [];
}

export async function syncBackendAccounts() {
  const res = await fetch("/api/accounts/sync", {
    method: "POST",
    headers: buildAuthHeaders()
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    synced?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    error?: string;
  };

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "同步账号失败");
  }

  return data;
}

/**
 * 登出
 */
export function logout() {
  clearAuth();
  window.location.href = "/login";
}
