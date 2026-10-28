const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, overrides = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, URL, window: { confirm: () => true },
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
  const react = { ...require("react"), useEffect() {}, useLayoutEffect() {}, useCallback: (fn) => fn, useRef: (initial) => ({ current: initial }),
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
  const dimensions = ["展示对象", "场景与环境", "表达形式", "开场钩子", "视觉调性"].map((name, index) => ({ id: index + 1, name, version: 1, sortOrder: index,
    tags: [{ id: index * 10 + 1, name: ["民宿", "森林", "漫游", "反差开场", "静谧"][index], dimensionId: index + 1, dimensionName: name, version: 1, sortOrder: 0 }] }));
  const catalog = { dimensions, unassignedTags: [] };
  assert.deepEqual(plain(helpers.normalizeTemplateTags([" 民宿 ", "民宿", "Slow", "slow", null, "森林  慢生活"])), ["民宿", "Slow", "森林 慢生活"]);
  const templates = [
    { id: "a", name: "民宿生活", tags: ["民宿", "静谧"], tagIds: [1, 41] },
    { id: "b", name: "森林漫游", tags: ["森林", "静谧"], tagIds: [11, 41] },
    { id: "old", name: "旧模板" }
  ];
  assert.deepEqual(plain(helpers.filterTemplatesByTags(templates, []).map((item) => item.id)), ["a", "b", "old"]);
  assert.deepEqual(plain(helpers.filterTemplatesByTags(templates, ["森林", "静谧"]).map((item) => item.id)), ["a", "b"]);
  assert.equal(helpers.filterTemplatesByTags(templates, ["民宿", "森林"]).length, 2);
  assert.deepEqual(plain(helpers.filterTemplatesByTagIds(templates, [11, 41]).map((item) => item.id)), ["a", "b"]);
  assert.equal(helpers.filterTemplatesByTagIds(templates, []).length, 3);
  assert.equal(helpers.filterTemplatesByTagIds(templates, [999]).length, 0);
  assert.equal(helpers.filterTemplatesByTagIds([{ tagIds: [7] }], [8]).length, 0, "same-name tags in different dimensions must not be confused");

  const dependencies = { "@/lib/featuredVlogTags": helpers };
  const editor = harness("src/app/components/FeaturedVlogTagEditor.tsx", "FeaturedVlogTagEditor", dependencies);
  let chosen = [];
  const editorProps = () => ({ value: chosen, dimensions, disabled: false, onChange: (tags) => { chosen = tags; } });
  let tree = editor(editorProps());
  assert.equal(nodes(tree).filter((node) => node.type === "select").length, 0, "the inline editor must not add a dropdown per dimension");
  assert.equal(nodes(tree).filter((node) => node.type === "dialog" || node.type === "form").length, 0, "the selector stays in the parent form without a modal or nested form");
  assert.ok(!button(tree, "添加标签"), "the template editor only selects existing tags");
  nodes(tree).find((node) => node.props?.["aria-label"] === "展示对象：民宿").props.onChange();
  tree = editor(editorProps());
  assert.equal(nodes(tree).find((node) => node.props?.["aria-label"] === "展示对象：民宿").props.checked, true);
  nodes(tree).find((node) => node.props?.["aria-label"] === "选择模板标签维度 场景与环境").props.onClick();
  tree = editor(editorProps());
  nodes(tree).find((node) => node.props?.["aria-label"] === "场景与环境：森林").props.onChange();
  tree = editor(editorProps());
  assert.deepEqual(plain(chosen), [1, 11]);
  chosen = Array.from({ length: 20 }, (_, i) => i + 100);
  tree = editor(editorProps());
  nodes(tree).find((node) => node.props?.["aria-label"] === "场景与环境：森林").props.onChange();
  tree = editor(editorProps());
  assert.ok(text(tree).includes("每个模板最多选择20个标签"));
  assert.equal(chosen.length, 20);
  chosen = [1, 11];
  tree = editor(editorProps());
  nodes(tree).find((node) => node.props?.["aria-label"] === "移除模板标签 场景与环境：森林").props.onClick();
  assert.deepEqual(plain(chosen), [1]);
  tree = editor(editorProps());
  nodes(tree).find((node) => node.props?.["aria-label"] === "搜索已有模板标签").props.onChange({ target: { value: "静谧" } });
  tree = editor(editorProps());
  assert.ok(text(tree).includes("搜索结果 · 全部维度") && text(tree).includes("视觉调性"));
  nodes(tree).find((node) => node.props?.["aria-label"] === "视觉调性：静谧").props.onChange();
  assert.deepEqual(plain(chosen), [1, 41]);
  tree = editor(editorProps());
  let preventedSearchSubmit = 0;
  for (const label of ["搜索已有模板标签", "查找模板标签维度"]) nodes(tree).find((node) => node.props?.["aria-label"] === label).props.onKeyDown({ key: "Enter", preventDefault() { preventedSearchSubmit++; } });
  assert.equal(preventedSearchSubmit, 2, "searching must not accidentally submit the template");
  tree = editor({ ...editorProps(), disabled: true });
  nodes(tree).find((node) => node.props?.["aria-label"] === "视觉调性：静谧").props.onChange();
  assert.deepEqual(plain(chosen), [1, 41], "saving disables selection changes");
  chosen = [9001];
  tree = editor({ ...editorProps(), dimensions: [], previousTags: [{ id: 9001, name: "旧标签", dimensionId: 0, dimensionName: "" }] });
  assert.ok(text(tree).includes("未分类：旧标签") && text(tree).includes("旧标签尚未分类"));
  assert.deepEqual(plain(chosen), [9001], "legacy associations must survive an empty catalogue");

  function FilterDrawerStub() { return null; }
  const pickerDependencies = { ...dependencies, "@/app/components/FeaturedVlogFilterDrawer": { FeaturedVlogFilterDrawer: FilterDrawerStub } };
  const picker = harness("src/app/components/FeaturedVlogTemplatePicker.tsx", "FeaturedVlogTemplatePicker", pickerDependencies);
  const drawer = harness("src/app/components/FeaturedVlogFilterDrawer.tsx", "FeaturedVlogFilterDrawer", dependencies);
  let selected = "a";
  const pickerProps = () => ({ templates, dimensions, value: selected, disabled: false, onChange: (id) => { selected = id; } });
  const drawerProps = () => nodes(tree).find((node) => node.type === FilterDrawerStub).props;
  tree = picker(pickerProps());
  assert.ok(!text(tree).includes("展示对象：民宿"), "template cards display tag names without dimension prefixes");
  assert.deepEqual(plain(helpers.templateTagLabels({ tagDetails: [dimensions[0].tags[0]], tags: [] })), ["民宿"]);
  assert.equal(nodes(tree).filter((node) => node.type === "select").length, 0, "the page must not grow one dropdown per dimension");
  nodes(tree).find((node) => node.props?.["aria-label"] === "打开标签筛选").props.onClick();
  tree = picker(pickerProps());
  let drawerTree = drawer(drawerProps());
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "搜索所有维度的标签").props.onChange({ target: { value: "静谧" } });
  drawerTree = drawer(drawerProps());
  assert.ok(text(drawerTree).includes("搜索结果 · 全部维度") && text(drawerTree).includes("视觉调性"));
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "视觉调性：静谧").props.onChange();
  tree = picker(pickerProps());
  assert.equal(drawerProps().matchCount, 2, "the drawer must show the live result count");
  drawerTree = drawer(drawerProps());
  button(drawerTree, "清空标签").props.onClick();
  tree = picker(pickerProps());
  drawerTree = drawer(drawerProps());
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "筛选维度 场景与环境").props.onClick();
  drawerTree = drawer(drawerProps());
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "场景与环境：森林").props.onChange();
  tree = picker(pickerProps());
  assert.equal(drawerProps().matchCount, 1);
  assert.ok(text(tree).includes("符合筛选的模板 1 个"));
  assert.ok(text(tree).includes("已保留当前脚本"));
  assert.equal(selected, "a", "filtering must not discard the current script selection");
  assert.ok(text(tree).includes("场景与环境：森林"));
  drawerTree = drawer(drawerProps());
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "筛选维度 展示对象").props.onClick();
  drawerTree = drawer(drawerProps());
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "展示对象：民宿").props.onChange();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 2 个"));
  assert.ok(text(tree).includes("匹配任意一个已选标签即可"));
  drawerTree = drawer(drawerProps());
  button(drawerTree, "查看 2 个模板").props.onClick();
  drawerTree = drawer(drawerProps());
  const closingDialog = nodes(drawerTree).find((node) => node.type === "dialog");
  assert.equal(closingDialog.props["data-closing"], "true", "keep the drawer mounted until its exit animation finishes");
  closingDialog.props.onAnimationEnd({ target: closingDialog, currentTarget: closingDialog, animationName: "vlog-filter-drawer-exit" });
  tree = picker(pickerProps());
  assert.ok(!nodes(tree).some((node) => node.type === FilterDrawerStub));
  assert.ok(text(tree).includes("已选 2"), "closing the drawer must keep the applied chips");
  nodes(tree).find((node) => node.props?.["aria-label"] === "取消筛选 展示对象：民宿").props.onClick();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 1 个"));
  nodes(tree).find((node) => node.props?.["aria-label"] === "取消筛选 场景与环境：森林").props.onClick();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 3 个"));
  nodes(tree).find((node) => node.props?.["aria-label"] === "搜索模板名称").props.onChange({ target: { value: " 森林 " } });
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 1 个"));
  button(tree, "清空条件").props.onClick();
  tree = picker(pickerProps());
  assert.ok(text(tree).includes("符合筛选的模板 3 个"));
  nodes(tree).find((node) => node.type === "input" && node.props.value === "b").props.onChange();
  assert.equal(selected, "b");

  const manyDimensions = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, name: `维度${index + 1}`, tags: [{ id: index + 100, name: `标签${index + 1}`, dimensionId: index + 1, dimensionName: `维度${index + 1}` }] }));
  const largeDrawer = harness("src/app/components/FeaturedVlogFilterDrawer.tsx", "FeaturedVlogFilterDrawer", dependencies);
  const largeDrawerProps = { dimensions: manyDimensions, selectedIds: [], onChange() {}, matchCount: 0, disabled: false, onClose() {} };
  drawerTree = largeDrawer(largeDrawerProps);
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "查找筛选维度").props.onChange({ target: { value: "维度50" } });
  drawerTree = largeDrawer(largeDrawerProps);
  assert.equal(nodes(drawerTree).filter((node) => node.props?.["aria-label"]?.startsWith("筛选维度 ")).length, 1, "dimension search must narrow a large catalogue");
  nodes(drawerTree).find((node) => node.props?.["aria-label"] === "搜索所有维度的标签").props.onChange({ target: { value: "标签50" } });
  drawerTree = largeDrawer(largeDrawerProps);
  assert.ok(text(drawerTree).includes("维度50") && text(drawerTree).includes("标签50"));
  assert.equal(nodes(drawerTree).filter((node) => node.type === "input" && node.props.type === "checkbox").length, 1);
  const largeInlineEditor = harness("src/app/components/FeaturedVlogTagEditor.tsx", "FeaturedVlogTagEditor", dependencies);
  const largeInlineProps = { value: [], dimensions: manyDimensions, disabled: false, onChange() {} };
  let inlineTree = largeInlineEditor(largeInlineProps);
  nodes(inlineTree).find((node) => node.props?.["aria-label"] === "查找模板标签维度").props.onChange({ target: { value: "维度50" } });
  inlineTree = largeInlineEditor(largeInlineProps);
  assert.equal(nodes(inlineTree).filter((node) => node.props?.["aria-label"]?.startsWith("选择模板标签维度 ")).length, 1);
  nodes(inlineTree).find((node) => node.props?.["aria-label"] === "搜索已有模板标签").props.onChange({ target: { value: "标签50" } });
  inlineTree = largeInlineEditor(largeInlineProps);
  assert.equal(nodes(inlineTree).filter((node) => node.type === "input" && node.props.type === "checkbox").length, 1);

  let response;
  const calls = [];
  const api = { isPlatformAdmin: () => true, authRequest: async (path, options) => { calls.push({ path, options }); return response; } };
  const library = load("src/lib/featuredVlog.ts", { "@/lib/api": api, "@/lib/featuredVlogTags": helpers,
    "@/lib/referenceVideos": { normalizeReferenceVideo: () => null }, "@/lib/xhs-signature": {},
    "@/lib/backendApi": { getBackendApiBaseUrl: () => "https://example.com" } });
  const raw = { ...templates[0], tagDetails: [dimensions[0].tags[0], dimensions[4].tags[0]], outline: "介绍", beats: [{ name: "到达", shotDuty: "建立环境" }], musicTags: ["钢琴"], version: 1 };
  const normalized = library.normalizeFeaturedVlogTemplate(raw);
  assert.deepEqual(plain(normalized.tags), ["民宿", "静谧"]);
  assert.deepEqual(plain(normalized.tagIds), [1, 41]);
  assert.equal(normalized.tagDetails[0].dimensionName, "展示对象");
  assert.deepEqual(plain(normalized.musicTags), ["钢琴"]);
  assert.deepEqual(plain(library.normalizeFeaturedVlogTemplate({ ...raw, tags: undefined }).tags), []);
  response = { status: true, data: { tags: ["民宿", "民宿", "森林"] } };
  assert.deepEqual(plain(await library.fetchFeaturedVlogTemplateTags()), ["民宿", "森林"]);
  response = { status: true, data: { templates: [raw] } };
  await library.fetchFeaturedVlogTemplates([11]);
  assert.deepEqual(plain(calls.at(-1).options.body), { tagIds: [11] });
  response = { status: true, data: raw };
  await library.createFeaturedVlogTemplate(raw);
  assert.deepEqual(plain(calls.at(-1).options.body.tagIds), raw.tagIds);
  assert.ok(!("tags" in calls.at(-1).options.body), "template saves cannot create tags by name");
  await library.updateFeaturedVlogTemplate({ ...raw, tagIds: [11, 11] });
  assert.deepEqual(plain(calls.at(-1).options.body.tagIds), [11]);
  await library.updateFeaturedVlogTemplate({ ...raw, tagIds: undefined });
  assert.ok(!("tagIds" in calls.at(-1).options.body), "older clients preserve existing associations");

  const tagApi = load("src/lib/vlogTagCatalog.ts", { "@/lib/api": api, ...dependencies });
  response = { status: true, data: catalog };
  assert.equal((await tagApi.fetchVlogTagCatalog()).dimensions.length, 5);
  for (const [method, path, input] of [
    ["createVlogTagDimension", "dimension/create", { name: "新维度", sortOrder: 6 }],
    ["updateVlogTagDimension", "dimension/update", { id: 1, version: 1, name: "展示主题", sortOrder: 1 }],
    ["deleteVlogTagDimension", "dimension/delete", { id: 1, version: 1 }],
    ["createVlogTag", "create", { dimensionId: 1, name: "民宿", sortOrder: 0 }],
    ["updateVlogTag", "update", { id: 1, version: 1, dimensionId: 2, name: "酒店", sortOrder: 0 }],
    ["deleteVlogTag", "delete", { id: 1, version: 1 }]
  ]) { await tagApi[method](input); assert.equal(calls.at(-1).path, `/featuredVlog/v1/tag/${path}`); assert.deepEqual(plain(calls.at(-1).options.body), input); }
  api.isPlatformAdmin = () => false;
  const before = calls.length;
  await assert.rejects(tagApi.createVlogTag({}), /平台管理员/);
  await assert.rejects(tagApi.deleteVlogTagDimension({ id: 1, version: 1 }), /平台管理员/);
  assert.equal(calls.length, before);
  api.isPlatformAdmin = () => true;

  const adminCalls = [];
  const adminNotices = [];
  const adminApi = { fetchVlogTagCatalog: async () => catalog,
    createVlogTagDimension: async (input) => adminCalls.push(["dimension", input]),
    updateVlogTag: async (input) => adminCalls.push(["move", input]) };
  const adminPanel = harness("src/app/components/VlogTagManagementPanel.tsx", "VlogTagManagementPanel", {
    "@/lib/api": api, "@/lib/vlogTagCatalog": adminApi
  });
  const adminProps = { currentUser: { role: "platform_admin" }, notify: (message) => adminNotices.push(message) };
  tree = adminPanel(adminProps);
  await button(tree, "刷新").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  tree = adminPanel(adminProps);
  nodes(tree).find((node) => node.props?.["aria-label"] === "查看展示对象").props.onClick();
  tree = adminPanel(adminProps);
  nodes(tree).find((node) => node.props?.["aria-label"] === "删除维度 展示对象").props.onClick();
  assert.ok(adminNotices.at(-1).includes("请先移动或删除标签"));
  button(tree, "新增维度").props.onClick();
  tree = adminPanel(adminProps);
  nodes(tree).find((node) => node.type === "input" && node.props.placeholder === "例如：展示对象").props.onChange({ target: { value: "叙事节奏" } });
  tree = adminPanel(adminProps);
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(adminCalls.at(-1)[0], "dimension");
  assert.equal(adminCalls.at(-1)[1].name, "叙事节奏");
  tree = adminPanel(adminProps);
  nodes(tree).find((node) => node.props?.["aria-label"] === "编辑标签 民宿").props.onClick();
  tree = adminPanel(adminProps);
  assert.ok(nodes(tree).some((node) => node.type?.name === "CatalogDialog" && node.props.context === "所属维度：展示对象"), "editing must open beside the current context in a dialog");
  nodes(tree).find((node) => node.props?.["aria-label"] === "标签所属维度").props.onChange({ target: { value: "2" } });
  tree = adminPanel(adminProps);
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(plain(adminCalls.at(-1)), ["move", { id: 1, version: 1, name: "民宿", sortOrder: 0, dimensionId: 2 }]);

  const largeCatalog = { unassignedTags: [], dimensions: dimensions.map((dimension) => ({ ...dimension,
    tags: Array.from({ length: 65 }, (_, index) => ({ ...dimension.tags[0], id: dimension.id * 1000 + index, name: `${dimension.name}标签${index + 1}`, sortOrder: index })) })) };
  const largePanel = harness("src/app/components/VlogTagManagementPanel.tsx", "VlogTagManagementPanel", {
    "@/lib/api": api, "@/lib/vlogTagCatalog": {
      fetchVlogTagCatalog: async () => largeCatalog,
      createVlogTag: async (input) => {
        const dimension = largeCatalog.dimensions.find((item) => item.id === input.dimensionId);
        const tag = { ...input, id: 9999, version: 1, dimensionName: dimension.name };
        dimension.tags.push(tag);
        return tag;
      }
    }
  });
  tree = largePanel(adminProps);
  button(tree, "刷新").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  tree = largePanel(adminProps);
  assert.equal(nodes(tree).filter((node) => node.type === "tbody")[0].props.children.length, 20, "hundreds of tags must be paginated");
  nodes(tree).find((node) => node.props?.["aria-label"] === "下一页标签").props.onClick();
  tree = largePanel(adminProps);
  assert.ok(text(tree).includes("21–40 / 325"));
  nodes(tree).find((node) => node.props?.["aria-label"] === "查看表达形式").props.onClick();
  tree = largePanel(adminProps);
  assert.ok(text(tree).includes("1–20 / 65"), "switching dimensions resets the page");
  nodes(tree).find((node) => node.props?.["aria-label"] === "搜索标签").props.onChange({ target: { value: "场景与环境标签65" } });
  tree = largePanel(adminProps);
  assert.ok(text(tree).includes("没有找到匹配的标签"));
  button(tree, "在全部标签中搜索").props.onClick();
  tree = largePanel(adminProps);
  assert.ok(text(tree).includes("场景与环境标签65") && text(tree).includes("找到 1 个标签"), "cross-dimension search must preserve the keyword and expose the parent dimension");
  nodes(tree).find((node) => node.props?.["aria-label"] === "查看表达形式").props.onClick();
  tree = largePanel(adminProps);
  button(tree, "新增标签").props.onClick();
  tree = largePanel(adminProps);
  assert.equal(nodes(tree).find((node) => node.props?.["aria-label"] === "标签所属维度").props.value, "3", "new tags use the selected dimension");
  nodes(tree).find((node) => node.type === "input" && node.props.name === "catalogName").props.onChange({ target: { value: "新建的表达标签" } });
  nodes(tree).find((node) => node.type === "input" && node.props.type === "number").props.onChange({ target: { value: "10000" } });
  tree = largePanel(adminProps);
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = largePanel(adminProps);
  assert.ok(text(tree).includes("61–66 / 66") && text(tree).includes("新建的表达标签"), "saving must reveal the saved tag on its actual page");
  assert.ok(!nodes(tree).some((node) => node.type?.name === "CatalogDialog"));

  for (const fail of [false, true]) {
    const manager = harness("src/app/components/FeaturedVlogManagementPanel.tsx", "FeaturedVlogManagementPanel", {
      ...dependencies, "@/lib/api": api, "@/lib/featuredVlog": { ...library, fetchFeaturedVlogTemplateTags: async () => [] },
      "@/lib/vlogTagCatalog": { fetchVlogTagCatalog: async () => catalog },
      "@/lib/featuredVlogTemplateRules": load("src/lib/featuredVlogTemplateRules.ts"),
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
  console.log("Vlog dimensions: unified drawer, global search, live ID filters, chips, large catalogues, CRUD, permissions, draft preservation and optional video fallback passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
