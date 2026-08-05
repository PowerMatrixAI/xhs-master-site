import path from "node:path";
import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/lib/backendApi";
import { buildBackendSignedHeaders } from "@/lib/xhs-signature";

const API_BASE_URL = getBackendApiBaseUrl();

type BackendResponse<T> = {
  status: boolean;
  data: T;
  message: string;
  code: string;
};

type SignedUploadUrlResponse = {
  auth: string;
  expireInSecond: number;
  file: string;
  signedUrl: string;
  url: string;
};

type BatchSignedUploadUrlResponse = {
  items: SignedUploadUrlResponse[];
};

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

function getFileExt(file: File) {
  const ext = path.extname(file.name).replace(/^\./, "").trim().toLowerCase();
  if (ext) return ext;
  const mime = file.type.split("/")[1] || "";
  return mime.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
}

type MediaType = "image" | "video";
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm"]);

function getMediaType(file: File): MediaType {
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(getFileExt(file)) ? "video" : "image";
}

function readRequiredHeader(request: Request, name: string) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || "";
}

async function createSignedUpload(file: File, request: Request) {
  const xhsSign = readRequiredHeader(request, "Xhs-Sign");
  const xhsPerson = readRequiredHeader(request, "Xhs-Person");
  const xhsTime = readRequiredHeader(request, "Xhs-Time");
  const xhsRequestId = readRequiredHeader(request, "Xhs-Request-Id");
  const xhsTest = readRequiredHeader(request, "Xhs-Test") || "1";

  if (!xhsSign || !xhsPerson || !xhsTime || !xhsRequestId) {
    throw new HttpError("登录信息缺失，请重新登录后再上传素材。", 401);
  }

  const payload = JSON.stringify({
    type: getMediaType(file),
    ext: getFileExt(file)
  });

  const res = await fetch(`${API_BASE_URL}/cos/v1/signedUploadUrl`, {
    method: "POST",
    headers: buildBackendSignedHeaders({
      url: `${API_BASE_URL}/cos/v1/signedUploadUrl`,
      method: "POST",
      body: payload,
      token: xhsSign,
      uid: xhsPerson,
      time: xhsTime,
      requestId: xhsRequestId,
      test: xhsTest
    }),
    body: payload
  });

  const data = (await res.json()) as BackendResponse<SignedUploadUrlResponse>;
  if (!res.ok || !data.status || !data.data?.signedUrl || !data.data?.url) {
    throw new HttpError(data.message || "获取上传地址失败。", res.status);
  }

  return data.data;
}

async function createBatchSignedUploads(files: File[], request: Request) {
  const xhsSign = readRequiredHeader(request, "Xhs-Sign");
  const xhsPerson = readRequiredHeader(request, "Xhs-Person");
  const xhsTime = readRequiredHeader(request, "Xhs-Time");
  const xhsRequestId = readRequiredHeader(request, "Xhs-Request-Id");
  const xhsTest = readRequiredHeader(request, "Xhs-Test") || "1";

  if (!xhsSign || !xhsPerson || !xhsTime || !xhsRequestId) {
    throw new HttpError("登录信息缺失，请重新登录后再上传素材。", 401);
  }

  const payload = JSON.stringify({
    type: getMediaType(files[0]),
    exts: files.map((file) => getFileExt(file))
  });

  const res = await fetch(`${API_BASE_URL}/cos/v1/batchSignedUploadUrl`, {
    method: "POST",
    headers: buildBackendSignedHeaders({
      url: `${API_BASE_URL}/cos/v1/batchSignedUploadUrl`,
      method: "POST",
      body: payload,
      token: xhsSign,
      uid: xhsPerson,
      time: xhsTime,
      requestId: xhsRequestId,
      test: xhsTest
    }),
    body: payload
  });

  const data = (await res.json()) as BackendResponse<BatchSignedUploadUrlResponse>;
  if (!res.ok || !data.status || !Array.isArray(data.data?.items)) {
    throw new HttpError(data.message || "获取批量上传地址失败。", res.status);
  }
  if (data.data.items.length !== files.length) {
    throw new Error("批量上传地址数量和文件数量不一致。");
  }

  return data.data.items;
}

async function uploadToSignedUrl(file: File, signedUrl: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream"
    },
    body: buffer
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(errorText.slice(0, 200) || "上传文件到对象存储失败。");
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = [...form.getAll("files"), ...form.getAll("file")].filter((item): item is File => item instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "缺少素材文件" }, { status: 400 });
    }

    const mediaTypes = new Set(files.map(getMediaType));

    const assets = [];
    const signedUploads =
      files.length > 1 && mediaTypes.size === 1
        ? await createBatchSignedUploads(files, request).catch(async (error) => {
            if (error instanceof HttpError && error.status === 401) {
              throw error;
            }
            const fallbackItems = [];
            for (const file of files) {
              fallbackItems.push(await createSignedUpload(file, request));
            }
            return fallbackItems;
          })
        : [await createSignedUpload(files[0], request)];

    for (const [index, file] of files.entries()) {
      const signed = signedUploads[index];
      await uploadToSignedUrl(file, signed.signedUrl);

      const asset = {
        id: Date.now() + index,
        filePath: signed.file || file.name,
        localFilePath: signed.file || file.name,
        fileUrl: signed.url,
        fileType: file.type || `${getMediaType(file)}/${getFileExt(file)}`,
        sourceType: String(form.get("sourceType") || "真实素材"),
        tags: String(form.get("tags") || ""),
        suitableTypes: String(form.get("suitableTypes") || ""),
        coverReady: form.get("coverReady") === "true",
        used: false,
        riskNotes: String(form.get("riskNotes") || "")
      };
      assets.push(asset);
    }

    return NextResponse.json({ count: assets.length, assets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败。" },
      { status: error instanceof HttpError && error.status >= 400 ? error.status : 500 }
    );
  }
}
