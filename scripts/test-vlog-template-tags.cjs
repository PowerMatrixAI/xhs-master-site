const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, overrides = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, URL,
    require: (id) => id in overrides ? overrides[id] : require(id) }, { filename: file });
  return module.exports;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(text).join("");
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function harness(file, name, dependencies) {
  const state = [];
  let index = 0;
  const react = { ...require("react"), useEffect() {}, useCallback: (fn) => fn,
    useState(initial) {
      const slot = index++;
      if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
      return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
    }
  };
  const component = load(file, { ...dependencies, react })[name];
  return (props) => { index = 0; return component(props); };
}
const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && text(node).trim() === label);

async function main() {
  const helpers = load("src/lib/featuredVlogTags.ts");
  assert.deepEqual(plain(helpers.normalizeTemplateTags([" 民宿 ", "民宿", "Slow", "slow", null, "森林  慢生活"])), ["民宿", "Slow", "森林 慢生活"]);
  const templates = [
    { id: "a", name: "民宿生活", tags: ["民宿", "慢节奏"] },
    { id: "b", name: "森林漫游", tags: ["森林", "慢节奏"] },
    { id: "old", name: "旧模板" }
  ];
  assert.deepEqual(plain(helpers.filterTemplatesByTags(templates, []).map((item) => item.id)), ["a", "b", "old"]);
  assert.deepEqual(plain(helpers.filterTemplatesByTags(templates, ["森林", "慢节奏"]).map((item) => item.id)), ["b"]);
  assert.equal(helpers.filterTemplatesByTags(templates, ["民宿", "森林"]).length, 0);

  const dependencies = { "@/lib/featuredVlogTags": helpers };
  const editor = harness("src/app/components/FeaturedVlogTagEditor.tsx", "FeaturedVlogTagEditor", dependencies);
  let chosen = [];
  const editorProps = () => ({ value: chosen, options: ["民宿"], disabled: false, onChange: (tags) => { chosen = tags; } });
  let tree = editor(editorProps());
  button(tree, "民宿").props.onClick();
  tree = editor(editorProps());
  nodes(tree).find((node) => node.type === "input").props.onChange({ target: { value: "森林" } });
  tree = editor(editorProps());
  button(tree, "添加标签").props.onClick();
  assert.deepEqual(plain(chosen), ["民宿", "森林"]);
  tree = editor(editorProps());
  nodes(tree).find((node) => node.type === "input").props.onChange({ target: { value: "字".repeat(31) } });
  tree = editor(editorProps());
  button(tree, "添加标签").props.onClick();
  tree = editor(editorProps());
  assert.ok(text(tree).includes("每个标签最多30字"));
  assert.equal(chosen.length, 2);
  nodes(tree).find((node) => node.props?.["aria-label"] === "移除标签 森林").props.onClick();
  assert.deepEqual(plain(chosen), ["民宿"]);

  const picker = harness("src/app/components/FeaturedVlogTemplatePicker.tsx", "FeaturedVlogTemplatePicker", dependencies);
  let selected = "a";
  const pickerProps = () => ({ templates, value: selected, disabled: false, onChange: (id) => { selected = id; } });
  tree = picker(pickerProps());
  button(tree, "森林").props.onClick();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 1 个"));
  assert.ok(text(tree).includes("已保留当前脚本"));
  assert.equal(selected, "a", "filtering must not discard the current script selection");
  button(tree, "民宿").props.onClick();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("没有符合标签的模板"));
  button(tree, "清除筛选").props.onClick();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 3 个"));
  nodes(tree).find((node) => node.type === "select").props.onChange({ target: { value: "b" } });
  assert.equal(selected, "b");

  let response;
  const calls = [];
  const api = { isPlatformAdmin: () => true, authRequest: async (path, options) => { calls.push({ path, options }); return response; } };
  const library = load("src/lib/featuredVlog.ts", { "@/lib/api": api, "@/lib/featuredVlogTags": helpers,
    "@/lib/referenceVideos": { normalizeReferenceVideo: () => null }, "@/lib/xhs-signature": {},
    "@/lib/backendApi": { getBackendApiBaseUrl: () => "https://example.com" } });
  const raw = { ...templates[0], outline: "介绍", beats: [{ name: "到达", shotDuty: "建立环境" }], musicTags: ["钢琴"], version: 1 };
  const normalized = library.normalizeFeaturedVlogTemplate(raw);
  assert.deepEqual(plain(normalized.tags), ["民宿", "慢节奏"]);
  assert.deepEqual(plain(normalized.musicTags), ["钢琴"]);
  assert.deepEqual(plain(library.normalizeFeaturedVlogTemplate({ ...raw, tags: undefined }).tags), []);
  response = { status: true, data: { tags: ["民宿", "民宿", "森林"] } };
  assert.deepEqual(plain(await library.fetchFeaturedVlogTemplateTags()), ["民宿", "森林"]);
  response = { status: true, data: { templates: [raw] } };
  await library.fetchFeaturedVlogTemplates(["森林"]);
  assert.deepEqual(plain(calls.at(-1).options.body), { tags: ["森林"] });
  response = { status: true, data: raw };
  await library.createFeaturedVlogTemplate(raw);
  assert.deepEqual(plain(calls.at(-1).options.body.tags), raw.tags);
  await library.updateFeaturedVlogTemplate({ ...raw, tags: ["森林", "森林"] });
  assert.deepEqual(plain(calls.at(-1).options.body.tags), ["森林"]);

  for (const fail of [false, true]) {
    const manager = harness("src/app/components/FeaturedVlogManagementPanel.tsx", "FeaturedVlogManagementPanel", {
      ...dependencies, "@/lib/api": api, "@/lib/featuredVlog": { ...library, fetchFeaturedVlogTemplateTags: async () => [] },
      "@/lib/referenceVideos": { fetchReferenceVideos: async () => { if (fail) throw new SyntaxError("Unexpected non-whitespace character after JSON at position 4"); return []; } },
      "@/app/components/ReferenceVideoPreview": { ReferenceVideoPreview: () => null },
      "@/app/components/FeaturedVlogTagEditor": { FeaturedVlogTagEditor: () => null }
    });
    const props = { currentUser: { role: "platform_admin" }, notify() {} };
    tree = manager(props);
    button(tree, "新建模板").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    tree = manager(props);
    assert.ok(text(tree).includes(fail ? "参考视频暂不可用" : "暂无参考视频"));
    assert.ok(!text(tree).includes("Unexpected"));
    assert.equal(button(tree, "创建模板").props.disabled, false);
  }
  console.log("Vlog tags: existing/new selections, validation, combined filters, draft preservation, API persistence and optional video fallback passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
