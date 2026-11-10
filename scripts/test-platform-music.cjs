const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, overrides = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, Error, FormData,
    require: (id) => id in overrides ? overrides[id] : require(id), ...globals }, { filename: file });
  return module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));
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
const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && text(node).trim() === label);
const removeButton = (tree, name) => nodes(tree).find((node) => node.props?.["aria-label"] === `删除配乐 ${name}`);

function harness(dependencies, globals) {
  const slots = [];
  let index = 0;
  let effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...require("react"),
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (next) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ||= { current: initial };
    },
    useCallback(fn, deps) {
      const slot = index++;
      if (!same(slots[slot]?.deps, deps)) slots[slot] = { fn, deps };
      return slots[slot].fn;
    },
    useEffect(fn, deps) {
      const slot = index++;
      if (!same(slots[slot], deps)) effects.push(fn);
      slots[slot] = deps;
    }
  };
  const { PlatformMusicLibraryPanel } = load("src/app/components/PlatformMusicLibraryPanel.tsx", { ...dependencies, react }, globals);
  return (props) => {
    index = 0;
    const tree = PlatformMusicLibraryPanel(props);
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return tree;
  };
}

async function main() {
  let admin = true;
  let response = { status: true, data: { musicId: 8 } };
  const requests = [];
  const api = {
    isPlatformAdmin: () => admin,
    authRequest: async (path, options) => {
      requests.push({ path, ...options });
      if (response instanceof Error) throw response;
      return response;
    }
  };
  const library = load("src/lib/featuredVlog.ts", {
    "@/lib/api": api, "@/lib/referenceVideos": {}, "@/lib/featuredVlogTags": {},
    "@/lib/backendApi": {}, "@/lib/xhs-signature": {}
  });
  await library.deletePlatformMusic({ id: 8, filePath: "/must-not-be-sent" });
  assert.deepEqual(plain(requests[0]), { path: "/featuredVlog/v1/music/delete", method: "POST", body: { musicId: 8 } });
  response = { status: false, message: "平台配乐不存在" };
  await assert.rejects(library.deletePlatformMusic({ id: 8 }), /平台配乐不存在/);
  response = { status: false };
  await assert.rejects(library.deletePlatformMusic({ id: 8 }), /删除平台配乐失败/);
  response = new Error("网络暂不可用");
  await assert.rejects(library.deletePlatformMusic({ id: 8 }), /网络暂不可用/);
  const count = requests.length;
  for (const id of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(library.deletePlatformMusic({ id }), /配乐标识无效/);
  }
  admin = false;
  await assert.rejects(library.deletePlatformMusic({ id: 8 }), /平台管理员/);
  assert.equal(requests.length, count, "unauthorized and invalid requests must never be sent");
  admin = true;

  const music = (id, name) => ({ id, name, tags: ["旅行"], audioUrl: `https://cdn.example.com/${id}.mp3`, authorizationState: "available" });
  const items = [music(8, "轻快旅途"), music(9, "安静午后")];
  const removals = [], notices = [], confirmations = [];
  let confirm = false, resolveDelete, rejectDelete, loads = 0;
  const render = harness({
    "@/lib/api": api,
    "@/lib/featuredVlog": {
      fetchPlatformMusic: async () => { loads++; return [...items]; },
      deletePlatformMusic: (input) => {
        removals.push(input);
        return new Promise((resolve, reject) => { resolveDelete = resolve; rejectDelete = reject; });
      }
    }
  }, { window: { confirm: (message) => { confirmations.push(message); return confirm; } } });
  const props = { currentUser: {}, notify: (message, tone) => notices.push({ message, tone }) };
  render(props);
  await tick();
  let tree = render(props);
  assert.ok(text(tree).includes("共 2 条"));
  removeButton(tree, "轻快旅途").props.onClick();
  await tick();
  assert.equal(removals.length, 0, "cancel must not send deletion");
  assert.ok(confirmations[0].includes("轻快旅途") && confirmations[0].includes("无法恢复"));

  confirm = true;
  const remove = removeButton(tree, "轻快旅途");
  remove.props.onClick();
  remove.props.onClick(); // Also test a second activation before React rerenders.
  tree = render(props);
  assert.equal(removals.length, 1, "only one mutation may run at a time");
  assert.equal(text(removeButton(tree, "轻快旅途")).trim(), "删除中...");
  for (const label of ["刷新列表", "上传配乐"]) assert.equal(button(tree, label).props.disabled, true);
  assert.equal(removeButton(tree, "安静午后").props.disabled, true);
  assert.ok(text(tree).includes("共 2 条"), "retain the row until the server confirms deletion");
  rejectDelete(new Error("服务端删除失败"));
  await tick();
  tree = render(props);
  assert.ok(text(tree).includes("共 2 条"));
  assert.equal(removeButton(tree, "轻快旅途").props.disabled, false);
  assert.deepEqual(notices.at(-1), { message: "服务端删除失败", tone: "error" });

  // Keep another row's open editor intact while deleting a different item.
  const otherRow = nodes(tree).find((node) => node.type === "article" && text(node).includes("安静午后"));
  button(otherRow, "编辑").props.onClick();
  tree = render(props);
  removeButton(tree, "轻快旅途").props.onClick();
  resolveDelete();
  await tick();
  tree = render(props);
  assert.ok(text(tree).includes("共 1 条"));
  assert.equal(removeButton(tree, "轻快旅途"), undefined);
  assert.ok(nodes(tree).some((node) => node.type === "input" && node.props.defaultValue === "安静午后"));
  assert.equal(loads, 1, "success updates the local list without overwriting another editor");
  assert.deepEqual(notices.at(-1), { message: "平台配乐已删除。", tone: "success" });
  button(tree, "取消").props.onClick();
  tree = render(props);
  removeButton(tree, "安静午后").props.onClick();
  resolveDelete();
  await tick();
  tree = render(props);
  assert.ok(text(tree).includes("共 0 条") && text(tree).includes("还没有平台配乐，请先上传"));

  admin = false;
  tree = render({ ...props, currentUser: null });
  await tick();
  assert.ok(text(tree).includes("没有平台配乐管理权限"));
  assert.equal(nodes(tree).filter((node) => node.type === "button").length, 0);
  assert.equal(loads, 1);
  console.log("Platform music deletion: API contract, permissions, confirmation, duplicate prevention, failure recovery, editor preservation and empty list passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
