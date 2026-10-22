import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { buildBackendSignedHeaders } from "@/lib/xhs-signature";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 202 * 1024 * 1024;

export async function POST(request: Request) {
  const token = request.headers.get("Xhs-Sign") || "";
  const uid = request.headers.get("Xhs-Person") || "";
  const time = request.headers.get("Xhs-Time") || "";
  const requestId = request.headers.get("Xhs-Request-Id") || "";
  const test = request.headers.get("Xhs-Test") || "1";
  const contentType = request.headers.get("content-type") || "";
  if (!token || !uid || !time || !requestId || !contentType.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json({ status: false, message: "上传请求信息不完整，请重新登录后重试。" }, { status: 400 });
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ status: false, message: "视频文件不能超过200MB。" }, { status: 413 });
  }
  try {
    const chunks: Uint8Array[] = [];
    const reader = request.body?.getReader();
    let size = 0;
    if (!reader) return NextResponse.json({ status: false, message: "缺少视频文件。" }, { status: 400 });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return NextResponse.json({ status: false, message: "视频文件不能超过200MB。" }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const target = `${getBackendApiBaseUrl()}/referenceVideo/v1/upload`;
    const headers = new Headers(buildBackendSignedHeaders({ url: target, method: "POST", token, uid, time, requestId, test, body, includeJsonContentType: false }));
    headers.set("Content-Type", contentType);
    const response = await fetch(target, { method: "POST", headers, body, signal: request.signal });
    return new NextResponse(await response.arrayBuffer(), { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  } catch (error) {
    return NextResponse.json({ status: false, message: error instanceof Error ? error.message : "上传参考视频失败。" }, { status: 502 });
  }
}
