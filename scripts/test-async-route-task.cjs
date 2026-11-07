const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let now = 0;
class FakeDate extends Date { static now() { return now; } }
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/asyncRouteTask.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports, Date: FakeDate, Error, crypto: require('node:crypto') });
const { createAsyncRouteTask, getAsyncRouteTask } = moduleUnderTest.exports;
async function main() {
  const pending = () => new Promise(() => {});
  const normal = createAsyncRouteTask(pending);
  const research = createAsyncRouteTask(pending, { ttlMs: 60 * 60 * 1000 });
  now = 31 * 60 * 1000;
  assert.equal(getAsyncRouteTask(normal.uuid), null, 'Default tasks still expire after 30 minutes');
  assert.equal(getAsyncRouteTask(research.uuid).status, 'pending', 'Long research must outlive the default TTL');
  now = 46 * 60 * 1000;
  assert.equal(getAsyncRouteTask(research.uuid).status, 'pending', 'Task must remain available throughout client polling');
  now = 61 * 60 * 1000;
  assert.equal(getAsyncRouteTask(research.uuid), null, 'Long research must still expire');

  now = 0;
  let resolve;
  const completed = createAsyncRouteTask(() => new Promise(r => { resolve = r; }), { ttlMs: 60 * 60 * 1000 });
  now = 40 * 60 * 1000;
  resolve('saved result');
  await Promise.resolve();
  now = 80 * 60 * 1000;
  assert.equal(getAsyncRouteTask(completed.uuid).result, 'saved result', 'Completed results retain the custom TTL');

  now = 0;
  const failed = createAsyncRouteTask(async () => { throw new Error('AI failed'); }, { ttlMs: 60 * 60 * 1000 });
  await Promise.resolve(); await Promise.resolve();
  now = 40 * 60 * 1000;
  assert.equal(getAsyncRouteTask(failed.uuid).error, 'AI failed', 'Failed results retain the custom TTL');
  console.log('async route task regression checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
