import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { authenticatedFetch } from "@/lib/api";

type BackendAiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

type BackendAiResponse = {
  status?: boolean;
  message?: string;
  data?: {
    text?: string;
    model?: string;
    uuid?: string;
    status?: string;
    error?: string;
  };
};

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 20;

function abortMessage(signal?: AbortSignal) {
  if (!signal?.aborted) return "";
  const reason = signal.reason;
  return reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "AI 请求已取消。";
}

function waitForNextPoll(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = abortMessage(signal);
    if (aborted) {
      reject(new Error(aborted));
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, POLL_INTERVAL_MS);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new Error(abortMessage(signal) || "AI 请求已取消。"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForBackendAiResult(input: {
  uuid: string;
  initialModel?: string;
  signal?: AbortSignal;
}): Promise<BackendAiResult> {
  const baseUrl = getBackendApiBaseUrl();
  const resultUrl = `${baseUrl}/ai/v1/complete/result?uuid=${encodeURIComponent(input.uuid)}`;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    const aborted = abortMessage(input.signal);
    if (aborted) return { ok: false, error: aborted };

    const response = await authenticatedFetch(resultUrl, {
      method: "GET",
      headers: { "xhs-language": "zh-cn" },
      signal: input.signal
    });
    const json = (await response.json().catch(() => ({}))) as BackendAiResponse;

    if (!response.ok || json.status === false) {
      return { ok: false, error: json.message || `AI 服务结果查询失败（HTTP ${response.status}）。` };
    }

    const taskStatus = String(json.data?.status || "").toLowerCase();
    if (json.data?.text && (!taskStatus || ["completed", "succeeded", "success", "done"].includes(taskStatus))) {
      return {
        ok: true,
        text: json.data.text,
        model: json.data.model || input.initialModel || ""
      };
    }

    if (["failed", "error", "cancelled", "canceled"].includes(taskStatus)) {
      return { ok: false, error: json.data?.error || json.message || `AI 服务任务执行失败（${taskStatus}）。` };
    }

    if (taskStatus && !["pending", "queued", "processing", "running"].includes(taskStatus)) {
      return { ok: false, error: `AI 服务返回了未知任务状态：${taskStatus}` };
    }

    if (attempt === POLL_MAX_ATTEMPTS - 1) {
      return { ok: false, error: "AI 服务任务等待超时，请稍后重试。" };
    }

    await waitForNextPoll(input.signal);
  }

  return { ok: false, error: "AI 服务任务等待超时，请稍后重试。" };
}

export async function completeWithBackendAi(input: {
  instructions: string;
  input: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<BackendAiResult> {
  try {
    const response = await authenticatedFetch(`${getBackendApiBaseUrl()}/ai/v1/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xhs-language": "zh-cn"
      },
      body: JSON.stringify({
        instructions: input.instructions,
        input: input.input,
        model: input.model
      }),
      signal: input.signal
    });

    const json = (await response.json().catch(() => ({}))) as BackendAiResponse;

    if (!response.ok || json.status === false) {
      return { ok: false, error: json.message || `AI 服务调用失败（HTTP ${response.status}）。` };
    }

    if (json.data?.text) {
      return {
        ok: true,
        text: json.data.text,
        model: json.data.model || input.model || ""
      };
    }

    if (json.data?.uuid) {
      return await waitForBackendAiResult({
        uuid: json.data.uuid,
        initialModel: json.data.model || input.model,
        signal: input.signal
      });
    }

    return { ok: false, error: json.message || "AI 服务返回结果不完整。" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AI 接口调用失败。" };
  }
}
