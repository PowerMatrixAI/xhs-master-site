const assert = require("node:assert/strict");
const fs = require("node:fs");

const weeklyPromptSource = fs.readFileSync("src/lib/llm.ts", "utf8");
const draftPromptSource = fs.readFileSync("src/lib/prompt.ts", "utf8");

assert.ok(weeklyPromptSource.includes("account.city 只是账号经营背景和事实参考"));
assert.ok(weeklyPromptSource.includes("不要习惯性使用“地名 + 内容主题”结构"));
assert.ok(weeklyPromptSource.includes("可以自然使用地名"));

assert.ok(draftPromptSource.includes("不要机械复制标题方向中已有的地名"));
assert.ok(draftPromptSource.includes("不把账号所在地当作固定前缀或固定卖点"));
assert.ok(draftPromptSource.includes("地名确实有助于理解、搜索或避免误导时仍可自然使用"));
assert.ok(draftPromptSource.includes("正文可以根据事实需要自然说明地址、区域、交通和服务范围"));

for (const source of [weeklyPromptSource, draftPromptSource]) {
  assert.ok(!source.includes("locationTitleMode"));
  assert.ok(!source.includes("locationRelevance"));
}

console.log("PASS: location is de-emphasized without classification, validation, or correction logic");
