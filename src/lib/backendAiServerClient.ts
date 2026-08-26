import "server-only";
import { completeWithBackendAi as completeWithBackendAiClient, type BackendAiCredentials } from "@/lib/backendAiClient";
import { getBackendAiRequestCredentials } from "@/lib/backendAiRequestContext";

type ServerAiInput = Parameters<typeof completeWithBackendAiClient>[0] & {
  credentials?: BackendAiCredentials;
};

export function completeWithBackendAi(input: ServerAiInput) {
  const credentials = input.credentials || getBackendAiRequestCredentials();
  if (!credentials) {
    return Promise.resolve({ ok: false as const, error: "缺少登录认证上下文，请重新登录后重试。" });
  }
  return completeWithBackendAiClient({ ...input, credentials });
}
