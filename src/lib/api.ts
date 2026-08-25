/**
 * 账号 API 客户端工具
 * 默认测试服: http://xhsapitest.powermatrix.tech/client
 */
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { buildBackendSignedHeaders, buildProxyAuthHeaders } from "@/lib/xhs-signature";

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

export interface BackendKnowledgeDocument {
  id: number;
  title: string;
  description: string;
  originalFilename: string;
  contentChars: number;
  status: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendKnowledgeDocumentListResponse {
  data: BackendKnowledgeDocument[];
  hasMore: boolean;
  limit: number;
  total: number;
  page: number;
}

export interface BackendKnowledgeSnapshot {
  snapshotId: string;
  status: string;
  hasReferences: boolean;
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
  knowledgeSourceKeys?: string[];
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
  knowledgeSnapshotId?: string;
  noteTasks: BackendNoteTask[];
  createdAt?: string;
  updatedAt?: string;
}

/* ---------- localStorage 存储工具 ---------- */

const TOKEN_KEY = "xhs_token";
const USER_KEY = "xhs_user";
const AUTH_EXPIRED_EVENT = "xhs:auth-expired";
const AUTO_LOGIN_MAX_ATTEMPTS = 3;
const AUTO_LOGIN_RETRY_DELAY_MS = 500;

const activeAuthenticatedRequests = new Set<AbortController>();
let authInvalidated = false;
let autoLoginPromise: Promise<LoginResponse> | null = null;

export class AuthenticationExpiredError extends Error {
  constructor(message = "登录已过期，请重新登录") {
    super(message);
    this.name = "AuthenticationExpiredError";
  }
}

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
  authInvalidated = false;
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

/**
 * 使当前认证立即失效，并终止仍在进行的受保护请求。
 * 使用 location.replace，确保失效页面不会留在浏览器返回历史中。
 */
export function requireManualLogin(message = "登录已过期，请重新登录") {
  if (typeof window === "undefined") return;

  const error = new AuthenticationExpiredError(message);
  const shouldNotify = !authInvalidated;
  authInvalidated = true;
  clearAuth();

  for (const controller of activeAuthenticatedRequests) {
    controller.abort(error);
  }
  activeAuthenticatedRequests.clear();

  if (shouldNotify) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message } }));
  }
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

function isUnauthorizedCode(code: unknown) {
  const normalized = String(code ?? "").trim().toUpperCase();
  return normalized === "401" || normalized === "UNAUTHORIZED";
}

/**
 * 受保护的浏览器请求入口。任一请求收到 401 时，会统一退出登录并取消其余请求。
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  if (typeof window === "undefined") {
    return fetch(input, init);
  }
  if (authInvalidated || !getToken()) {
    requireManualLogin();
    throw new AuthenticationExpiredError();
  }

  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  activeAuthenticatedRequests.add(controller);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (response.status === 401) {
      requireManualLogin();
      throw new AuthenticationExpiredError();
    }
    return response;
  } finally {
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    activeAuthenticatedRequests.delete(controller);
  }
}

export function buildProxyHeaders() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    requireManualLogin();
    throw new AuthenticationExpiredError();
  }

  return buildProxyAuthHeaders({
    token,
    uid: String(user.uid)
  });
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
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    requireManualLogin();
    throw new AuthenticationExpiredError();
  }
  const headers = buildBackendSignedHeaders({
    url: `${API_BASE_URL}${path}`,
    method,
    body: bodyStr,
    token,
    uid: String(user.uid)
  });

  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined
  });
  const res = (await response.json()) as ApiResponse<T>;
  if (isUnauthorizedCode(res.code)) {
    requireManualLogin(res.message || "登录已过期，请重新登录");
    throw new AuthenticationExpiredError(res.message || undefined);
  }
  return res;
}

/* ---------- 业务接口 ---------- */

/**
 * 登录
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await publicRequest<LoginResponse>("/login/v1/login", { email, channel: "xhs",
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
  password: string, betaCode: string): Promise<LoginResponse> {
  const res = await publicRequest<LoginResponse>("/login/v1/register", { email, channel: "xhs",
    name,
    password, betaCode
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
async function performAutoLogin(): Promise<LoginResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AUTO_LOGIN_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await authRequest<LoginResponse>("/login/v1/autoLogin", { method: "POST" });
      if (!res.status) {
        throw new Error(res.message || "自动登录失败");
      }
      setAuth(res.data);
      return res.data;
    } catch (error) {
      if (error instanceof AuthenticationExpiredError) {
        throw error;
      }
      lastError = error;
      if (attempt < AUTO_LOGIN_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, AUTO_LOGIN_RETRY_DELAY_MS * attempt));
      }
    }
  }

  requireManualLogin("自动登录连续失败，请手动登录");
  throw lastError instanceof Error ? lastError : new Error("自动登录连续失败，请手动登录");
}

export function autoLogin(): Promise<LoginResponse> {
  if (!autoLoginPromise) {
    autoLoginPromise = performAutoLogin().finally(() => {
      autoLoginPromise = null;
    });
  }
  return autoLoginPromise;
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

export async function fetchBackendKnowledgeDocuments(accountId: number) {
  const query = new URLSearchParams({
    accountId: String(accountId),
    page: "1",
    limit: "50"
  });
  const res = await authRequest<BackendKnowledgeDocumentListResponse>(`/knowledgeBase/v1/listDocuments?${query.toString()}`);
  if (!res.status || !res.data) {
    throw new Error(res.message || "获取知识库文档失败");
  }
  return res.data;
}

async function uploadBackendKnowledgeDocument(form: FormData, operation: "upload" | "replace" = "upload") {
  const path = operation === "replace"
    ? "/api/knowledge-base/documents?operation=replace"
    : "/api/knowledge-base/documents";
  const response = await authenticatedFetch(path, {
    method: "POST",
    headers: buildProxyHeaders(),
    body: form
  });
  const res = await response.json().catch(() => ({})) as ApiResponse<BackendKnowledgeDocument> & { error?: string };
  if (!response.ok || !res.status || !res.data) {
    throw new Error(res.message || res.error || "上传知识库文档失败");
  }
  return res.data;
}

export async function uploadBackendKnowledgeDocumentFile(
  accountId: number,
  file: File,
  fields: { title?: string; description?: string } = {}
) {
  const form = new FormData();
  form.set("accountId", String(accountId));
  form.set("title", fields.title || "");
  form.set("description", fields.description || "");
  form.set("file", file);
  return uploadBackendKnowledgeDocument(form, "upload");
}

export async function updateBackendKnowledgeDocument(
  accountId: number,
  documentId: number,
  fields: { title?: string; description?: string }
) {
  const res = await authRequest<BackendKnowledgeDocument>("/knowledgeBase/v1/updateDocument", {
    method: "POST",
    body: {
      accountId,
      documentId,
      title: fields.title ?? null,
      description: fields.description ?? null
    }
  });
  if (!res.status || !res.data) {
    throw new Error(res.message || "更新知识库文档失败");
  }
  return res.data;
}

export async function replaceBackendKnowledgeDocumentFile(
  accountId: number,
  documentId: number,
  file: File,
  fields: { title?: string; description?: string } = {}
) {
  const form = new FormData();
  form.set("accountId", String(accountId));
  form.set("documentId", String(documentId));
  form.set("title", fields.title || "");
  form.set("description", fields.description || "");
  form.set("file", file);
  return uploadBackendKnowledgeDocument(form, "replace");
}

export async function deleteBackendKnowledgeDocument(accountId: number, documentId: number) {
  const res = await authRequest("/knowledgeBase/v1/deleteDocument", {
    method: "POST",
    body: { accountId, documentId }
  });
  if (!res.status) {
    throw new Error(res.message || "删除知识库文档失败");
  }
}

export async function retrieveBackendKnowledgeSnapshot(accountId: number, queries: string[]) {
  const normalizedQueries = queries.map((query) => query.trim()).filter(Boolean);
  if (!normalizedQueries.length) return null;
  const res = await authRequest<BackendKnowledgeSnapshot>("/knowledgeBase/v1/retrieve", {
    method: "POST",
    body: { accountId, queries: normalizedQueries }
  });
  if (!res.status || !res.data) {
    throw new Error(res.message || "创建知识库检索快照失败");
  }
  return res.data;
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
  const res = await authenticatedFetch("/api/accounts/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildProxyHeaders()
    }
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
  requireManualLogin("您已退出登录");
}
