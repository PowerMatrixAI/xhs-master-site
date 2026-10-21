const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadTs(file, overrides = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, process, URL, Headers, AbortController,
    require: (id) => id in overrides ? overrides[id] : require(id),
    ...globals
  }, { filename: file });
  return module.exports;
}

async function run() {
  const storage = new Map();
  const requests = [];
  const signatures = [];
  let responseBody = { status: true, data: { id: 2, aiAnalysis: "左侧有树，右侧为建筑。", aiAnalysisStatus: "completed" } };
  const api = loadTs("src/lib/api.ts", {
    "@/lib/backendApi": { getBackendApiBaseUrl: () => "https://backend.example.com/client" },
    "@/lib/xhs-signature": { buildBackendSignedHeaders: (request) => {
      signatures.push(request);
      return { "Xhs-Sign": "test-signature" };
    } },
    "@/lib/storyCharacters": {}
  }, {
    window: { location: { origin: "https://app.example.com" } },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(responseBody), { headers: { "content-type": "application/json" } });
    }
  });
  api.setAuth({ uid: 5, signature: "token" });
  for (const action of ["get", "update", "delete", "generate"]) {
    const result = await api.requestBackendAssetAnalysis(1, 2, action, "左侧有树，右侧为建筑。");
    const request = requests.at(-1);
    assert.equal(request.url, `https://backend.example.com/client/account/v1/${action}AssetAnalysis`);
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers["Xhs-Sign"], "test-signature");
    assert.deepEqual(JSON.parse(request.init.body), { accountId: 1, assetId: 2, ...(action === "update" ? { aiAnalysis: "左侧有树，右侧为建筑。" } : {}) });
    assert.equal(signatures.at(-1).body, request.init.body);
    assert.equal(signatures.at(-1).uid, "5");
    assert.equal(result.aiAnalysisStatus, "completed");
  }
  responseBody = { status: false, message: "无权操作该账号" };
  await assert.rejects(api.requestBackendAssetAnalysis(1, 2, "delete"), /无权操作该账号/);

  const { AssetAnalysisCard } = loadTs("src/app/components/AssetAnalysisCard.tsx");
  const card = (fields) => renderToStaticMarkup(React.createElement(AssetAnalysisCard, {
    asset: { id: 2, ...fields }, disabled: false, loadingAction: null, onAction: async () => {}
  }));
  const completed = card({ aiAnalysis: "**人物**在左侧<script>alert(1)</script>", aiAnalysisStatus: "completed" });
  assert.ok(completed.includes("**人物**在左侧&lt;script&gt;"), "analysis must render as escaped plain text");
  assert.ok(completed.includes("删除分析") && completed.includes("重新生成"));
  const pending = card({ aiAnalysisStatus: "pending" });
  assert.ok(pending.includes("等待后台分析") && pending.includes("刷新结果") && pending.includes("删除分析"));
  const failed = card({ aiAnalysis: "原有分析", aiAnalysisStatus: "failed" });
  assert.ok(failed.includes("原有分析") && failed.includes("分析暂未成功"));
  const deleted = card({ aiAnalysisStatus: "deleted" });
  assert.ok(deleted.includes("分析已删除") && deleted.includes("生成分析") && !deleted.includes("删除分析"));

  const { assetManifestMarkdown } = loadTs("src/lib/markdown.ts");
  const manifest = assetManifestMarkdown({ name: "测试账号" }, [{ filePath: "a.jpg", aiAnalysis: "人物位于画面中央。" }]);
  assert.ok(manifest.includes("图片分析：人物位于画面中央。"));
  console.log("Asset analysis API, plain-text rendering, status and manifest checks passed.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
