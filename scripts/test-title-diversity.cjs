const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    process,
    Intl,
    require: (id) => id in overrides ? overrides[id] : require(id)
  }, { filename: file });
  return module.exports;
}

let response;
let capturedRequest;
const prompt = loadTs("src/lib/prompt.ts", {
  "@/lib/imagePrompts": {
    accountVisualMode: () => "food",
    isWeddingAccount: () => false
  }
});
const drafts = loadTs("src/lib/draftVariants.ts", {
  "@/lib/backendAiServerClient": {
    completeWithBackendAi: async (request) => {
      capturedRequest = request;
      return { ok: true, model: "mock", text: JSON.stringify(response) };
    }
  },
  "@/lib/expertLearning": { formatExpertRulesForPrompt: () => "" },
  "@/lib/prompt": prompt,
  "@/lib/weeklyPlanningObjectives": {
    selectedWeeklyPlanningObjectivesFromTheme: () => [],
    formatWeeklyPlanningObjectiveRules: () => ""
  }
});

const baseInput = {
  account: { accountType: "food" },
  weeklyPlan: { theme: "测试" },
  noteTask: {
    topicTitle: "杭州秋日咖啡",
    contentGoal: "分享桂花拿铁",
    targetUser: "喜欢咖啡的人",
    painPoint: "想寻找秋日味道",
    coreView: "桂花香气是记忆点",
    requiredMaterials: "咖啡实拍",
    recommendedAssets: "桂花拿铁",
    coverCopyDirection: "秋日氛围",
    commentHook: "你喜欢什么秋日风味",
    writingStyleName: "生活分享",
    writingStyleReference: "### 文风：生活分享\n自然口语"
  },
  weeklyTitleContext: {
    otherTopicTitles: ["秋日里的第一杯咖啡"],
    generatedTitles: ["被桂花香气拿捏了"],
    selectedTitles: ["这杯秋天我先喝为敬"]
  }
};

async function run() {
  response = {
    variants: [
      { id: "playful", label: "版本1", title: "桂花掉进咖啡里了", body: "正文\n#咖啡" },
      { id: "lively", label: "版本2", title: "秋天第一口就是它", body: "正文\n#咖啡" },
      { id: "balanced", label: "版本3", title: "今天想喝点秋天", body: "正文\n#咖啡" }
    ]
  };
  const result = await drafts.generateDraftVariants(baseInput);
  assert.equal(result.variants.length, 3);
  assert.ok(capturedRequest.input.includes("内容主题参考（不是待改写的半成品标题）"));
  assert.ok(capturedRequest.input.includes("已选定标题：这杯秋天我先喝为敬"));
  assert.ok(capturedRequest.input.includes("已生成候选：被桂花香气拿捏了"));
  assert.ok(capturedRequest.input.includes("其他内容主题：秋日里的第一杯咖啡"));
  assert.ok(capturedRequest.input.includes("具体细节、情绪瞬间、自然悬念"));
  assert.ok(capturedRequest.input.includes("长短服从自然表达"));
  assert.ok(!capturedRequest.input.includes("长度优先为 14-18"));
  assert.equal(drafts.xhsTitleUnits("一".repeat(18)), 18);
  assert.equal(drafts.xhsTitleUnits("😀"), 2);

  response.variants[0].title = "一".repeat(19);
  await assert.rejects(() => drafts.generateDraftVariants(baseInput), /18 个小红书标题单位/);
  console.log("PASS: weekly title context, varied hooks, and 18-unit title limit");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
