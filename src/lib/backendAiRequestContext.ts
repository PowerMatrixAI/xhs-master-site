import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { BackendAiCredentials } from "@/lib/backendAiClient";

const backendAiCredentialsStorage = new AsyncLocalStorage<BackendAiCredentials>();

export function getBackendAiCredentialsFromRequest(request: Request): BackendAiCredentials | null {
  const token = request.headers.get("xhs-sign") || "";
  const uid = request.headers.get("xhs-person") || "";
  if (!token || !uid) return null;
  return {
    token,
    uid,
    test: request.headers.get("xhs-test") || "1"
  };
}

export function runWithBackendAiCredentials<T>(credentials: BackendAiCredentials, task: () => T): T {
  return backendAiCredentialsStorage.run(credentials, task);
}

export function getBackendAiRequestCredentials() {
  return backendAiCredentialsStorage.getStore();
}
