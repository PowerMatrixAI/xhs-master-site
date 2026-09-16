import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { buildBackendSignedHeaders } from "@/lib/xhs-signature";

export const runtime = "nodejs";

const API_BASE_URL = getBackendApiBaseUrl();

function readRequiredHeader(request: Request, name: string) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || "";
}

export async function POST(request: Request) {
  const token = readRequiredHeader(request, "Xhs-Sign");
  const uid = readRequiredHeader(request, "Xhs-Person");
  const time = readRequiredHeader(request, "Xhs-Time");
  const requestId = readRequiredHeader(request, "Xhs-Request-Id");
  const test = readRequiredHeader(request, "Xhs-Test") || "1";
  const contentType = request.headers.get("content-type") || "";

  if (!token || !uid || !time || !requestId || !contentType.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "上传请求信息不完整，请重新登录后重试。" }, { status: 400 });
  }

  try {
    const body = new Uint8Array(await request.arrayBuffer());
    const target = `${API_BASE_URL}/storyCharacter/v1/upload`;
    const headers = new Headers(buildBackendSignedHeaders({
      url: target,
      method: "POST",
      token,
      uid,
      time,
      requestId,
      test,
      body,
      includeJsonContentType: false
    }));
    headers.set("Content-Type", contentType);

    const response = await fetch(target, {
      method: "POST",
      headers,
      body
    });
    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传故事角色失败。" },
      { status: 502 }
    );
  }
}
