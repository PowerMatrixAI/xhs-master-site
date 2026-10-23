const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, overrides = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, URL, Headers, Request, Response, FormData, Uint8Array,
    require: (id) => id in overrides ? overrides[id] : require(id), ...globals }, { filename: file });
  return module.exports;
}

async function main() {
  const video = { id: 8, name: "林间参考", description: "参考长镜头与慢节奏", videoUrl: "https://cdn.example.com/ref.mp4", sourceType: "url", version: 3 };
  const template = { id: "vlog", name: "慢生活", outline: "体验林间生活", beats: [{ name: "到达", shotDuty: "看清住宿与自然的关系", visualGuidance: "旧版写死的穿门推进", required: true }], requiredScenes: ["旧版特定设施"], perspectiveGuidance: "第三人称为主", visualGuidance: "自然摄影", musicTags: [], version: 1, referenceVideoId: 8, referenceVideo: video };
  let admin = true;
  let response = { status: true, data: video };
  const calls = [];
  const api = {
    isPlatformAdmin: () => admin,
    authRequest: async (path, options) => { calls.push({ path, options }); if (response instanceof Error) throw response; return response; },
    authenticatedFetch: async (path, options) => { calls.push({ path, options }); return new Response(JSON.stringify(response)); },
    buildProxyHeaders: () => ({ "Xhs-Sign": "signed" })
  };
  const library = load("src/lib/referenceVideos.ts", { "@/lib/api": api });
  const vlog = load("src/lib/featuredVlog.ts", {
    "@/lib/api": api, "@/lib/referenceVideos": library,
    "@/lib/featuredVlogTags": load("src/lib/featuredVlogTags.ts"),
    "@/lib/backendApi": { getBackendApiBaseUrl: () => "https://backend.example.com/client" },
    "@/lib/xhs-signature": {}
  });
  assert.equal(library.normalizeReferenceVideo(video).id, 8);
  for (const videoUrl of ["javascript:alert(1)", "file:///tmp/v.mp4", "https://user:pass@example.com/v.mp4", "/local/v.mp4"]) {
    assert.equal(library.normalizeReferenceVideo({ ...video, videoUrl }), null);
  }
  assert.equal(vlog.normalizeFeaturedVlogTemplate(template).referenceVideo.id, 8);
  assert.equal(vlog.normalizeFeaturedVlogTemplate({ ...template, referenceVideoId: null, referenceVideo: null }).referenceVideoId, null);
  assert.equal(vlog.normalizeFeaturedVlogTemplate({ ...template, referenceVideoId: 99 }).referenceVideo, null);

  await library.createReferenceVideo({ name: video.name, description: video.description, videoUrl: video.videoUrl });
  assert.equal(calls.at(-1).path, "/referenceVideo/v1/create");
  await library.updateReferenceVideo({ id: 8, version: 3, name: "新名称", description: "" });
  assert.equal(calls.at(-1).options.body.videoId, 8);
  assert.ok(!("videoUrl" in calls.at(-1).options.body), "metadata-only edits must preserve uploaded files");
  await library.deleteReferenceVideo(video);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).options.body)), { videoId: 8, version: 3 });
  response = { status: true, data: { videos: [video] } };
  assert.equal((await library.fetchReferenceVideos())[0].id, 8);
  for (const data of [{ videos: [] }, { videos: null }, {}, null]) {
    response = { status: true, data };
    assert.equal((await library.fetchReferenceVideos()).length, 0, "an empty optional library must not fail");
  }
  response = new SyntaxError("Unexpected non-whitespace character after JSON at position 4");
  await assert.rejects(library.fetchReferenceVideos(), /参考视频服务暂不可用/);
  response = { status: true, data: template };
  await vlog.createFeaturedVlogTemplate(template);
  assert.equal(calls.at(-1).path, "/featuredVlog/v1/template/create");
  const created = calls.at(-1).options.body;
  assert.deepEqual(JSON.parse(JSON.stringify(created.requiredScenes)), []);
  assert.equal(created.beats[0].visualGuidance, "");
  assert.equal(created.beats[0].shotDuty, template.beats[0].shotDuty);
  assert.equal(created.beats[0].required, true);
  assert.equal(created.visualGuidance, "自然摄影", "whole-film guidance remains active");
  assert.equal(created.referenceVideoId, 8);
  assert.ok(!("id" in created) && !("referenceVideo" in created));
  await vlog.updateFeaturedVlogTemplate({ ...template, referenceVideoId: 0 });
  assert.equal(calls.at(-1).options.body.referenceVideoId, 0, "an explicit zero must remove the association");
  await vlog.updateFeaturedVlogTemplate({ ...template, referenceVideoId: null });
  assert.equal(calls.at(-1).options.body.referenceVideoId, 0, "a cleared UI value must remove the association");
  await vlog.updateFeaturedVlogTemplate(template);
  assert.equal(calls.at(-1).options.body.referenceVideoId, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).options.body.requiredScenes)), []);
  assert.equal(calls.at(-1).options.body.beats[0].visualGuidance, "");
  assert.equal(template.beats[0].visualGuidance, "旧版写死的穿门推进", "editor writes must not mutate an unsaved template");
  response = { status: true, data: video };
  await library.uploadReferenceVideo({ id: 8, version: 3, name: video.name, description: "", file: new File(["video"], "ref.mp4", { type: "video/mp4" }) });
  assert.equal(calls.at(-1).path, "/api/reference-videos/upload");
  assert.equal(calls.at(-1).options.body.get("videoId"), "8");
  assert.equal(calls.at(-1).options.body.get("version"), "3");
  await assert.rejects(library.uploadReferenceVideo({ name: "大视频", description: "", file: { size: 201 * 1024 * 1024 } }), /200MB/);
  response = { status: false, message: "参考视频已被修改，请刷新后重试" };
  await assert.rejects(library.deleteReferenceVideo(video), /已被修改/);
  const before = calls.length;
  admin = false;
  await assert.rejects(library.createReferenceVideo({}), /平台管理员/);
  await assert.rejects(library.updateReferenceVideo({}), /平台管理员/);
  await assert.rejects(library.deleteReferenceVideo(video), /平台管理员/);
  await assert.rejects(library.uploadReferenceVideo({}), /平台管理员/);
  await assert.rejects(library.fetchReferenceVideos(), /平台管理员/);
  assert.equal(calls.length, before);

  const { ReferenceVideoPreview } = load("src/app/components/ReferenceVideoPreview.tsx");
  const preview = renderToStaticMarkup(React.createElement(ReferenceVideoPreview, { video: { ...video, description: "<script>unsafe</script>" } }));
  assert.ok(preview.includes("controls=") && preview.includes("preload=\"none\""));
  assert.ok(preview.includes("&lt;script&gt;unsafe&lt;/script&gt;") && !preview.includes("<script>"));

  let forwarded = null;
  const proxy = load("src/app/api/reference-videos/upload/route.ts", {
    "@/lib/backendApi": { getBackendApiBaseUrl: () => "https://backend.example.com/client" },
    "@/lib/xhs-signature": { buildBackendSignedHeaders: (input) => { forwarded = input; return { "Xhs-Sign": "signed" }; } }
  }, { fetch: async (url, init) => {
    assert.equal(url, "https://backend.example.com/client/referenceVideo/v1/upload");
    assert.equal(init.body, forwarded.body);
    return new Response(JSON.stringify({ status: true, data: video }), { headers: { "content-type": "application/json" } });
  } });
  const form = new FormData();
  form.set("file", new File(["binary-video"], "ref.mp4"));
  const headers = { "Xhs-Sign": "token", "Xhs-Person": "5", "Xhs-Time": "1", "Xhs-Request-Id": "test" };
  const request = new Request("http://localhost/api/reference-videos/upload", { method: "POST", headers, body: form });
  const original = new Uint8Array(await request.clone().arrayBuffer());
  assert.equal((await proxy.POST(request)).status, 200);
  assert.deepEqual(Array.from(forwarded.body), Array.from(original), "the signature must cover the exact multipart bytes");
  const tooLarge = new Request("http://localhost/api/reference-videos/upload", { method: "POST", headers: { ...headers, "content-type": "multipart/form-data; boundary=test", "content-length": String(203 * 1024 * 1024) }, body: "x" });
  assert.equal((await proxy.POST(tooLarge)).status, 413);
  assert.equal((await proxy.POST(new Request("http://localhost", { method: "POST", body: "x" }))).status, 400);
  console.log("Reference video permissions, CRUD contracts, optional template links, preview and signed upload proxy passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
