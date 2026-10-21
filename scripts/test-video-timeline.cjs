const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, overrides = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, URL, require: id => id in overrides ? overrides[id] : require(id) }, { filename: file });
  return module.exports;
}
const timing = load('src/lib/videoTimeline.ts');
let response, lastRequest;
const ai = { completeWithBackendAi: async request => { lastRequest = request; return { ok: true, text: JSON.stringify(response) }; } };
const scenes = load('src/lib/vlogScene.ts');
const overrides = { '@/lib/videoTimeline': timing, '@/lib/vlogScene': scenes, '@/lib/videoDelivery': load('src/lib/videoDelivery.ts'), '@/lib/backendAiServerClient': ai };
overrides['@/lib/videoPromptBudget'] = load('src/lib/videoPromptBudget.ts');
overrides['@/lib/videoPhotography'] = load('src/lib/videoPhotography.ts');
overrides['@/lib/videoAssetSelection'] = load('src/lib/videoAssetSelection.ts', { '@/lib/backendAiServerClient': ai });
overrides['@/lib/featuredVlogOmni'] = load('src/lib/featuredVlogOmni.ts', { './videoTimeline': timing, './vlogScene': scenes });
const storyLib = load('src/lib/videoPrompts.ts', { ...overrides, '@/lib/storyCharacters': { characterDownloadUrl: () => '' } });
const vlogLib = load('src/lib/featuredVlogPrompts.ts', { ...overrides, '@/lib/featuredVlog': { isHttpsUrl: url => url.startsWith('https://') } });
const shots = [2, 3.5, 2.5].map((duration, i) => ({ order: i+1, beat: '抵达', role: '体验', description: '沿路看窗景', suggestedMaterial: '窗景', subjectPresence: 'pov', narrationText: '我们终于来到这里', duration, transitionToNext: i === 2 ? null : { type: i === 0 ? 'dissolve' : 'cut', duration: i === 0 ? .5 : 0, reason: '构图衔接', outgoingState: '向右移动', incomingState: '向右延续' } }));
const noteTask = Object.fromEntries(['topicTitle', 'contentType', 'contentGoal', 'targetUser', 'painPoint', 'coreView', 'requiredMaterials', 'recommendedAssets', 'coverCopyDirection', 'commentHook', 'expectedGoal', 'writingStyleName'].map(k => [k, '测试']));
const story = { timingVersion: 2, title: '旅途', summary: '抵达', emotionalArc: '期待到惊喜', noteTask, shots };
const script = { ...story, perspective: '游客', moodTags: ['轻松'], musicTags: ['旅行'] };
const framePlan = shots.map(s => ({ order: s.order, role: s.role, description: s.description, frameSource: 'generate', assetUrl: '', framePrompt: '窗景' }));
const motionPlan = shots.map(s => ({ order: s.order, mainVideoPrompt: '缓慢推进', endingTransitionPrompt: '平稳收束', narrationText: '不得采用这段改写' }));
const base = { account: { name: '账号', accountParam: 'test' }, noteTask: { id: 1, topicTitle: '旅途' }, framePlan, motionPlan };

async function main() {
  timing.validateVideoTimeline(2, shots, true);
  assert.equal(timing.videoTimelineDuration(shots, 2), 7.5);
  for (const duration of [undefined, NaN, Infinity, 1, 2.3, 11]) {
    assert.throws(() => timing.validateVideoTimeline(2, [{ ...shots[0], duration }, ...shots.slice(1)]));
  }
  assert.throws(() => timing.validateVideoTimeline(2, [...shots.slice(0, 2), { ...shots[2], transitionToNext: shots[0].transitionToNext }]));
  assert.throws(() => timing.validateVideoTimeline(2, [{ ...shots[0], transitionToNext: { ...shots[0].transitionToNext, duration: .75 } }, ...shots.slice(1)]));
  assert.throws(() => timing.validateVideoTimeline(2, [{ ...shots[0], narrationText: '字'.repeat(31) }, ...shots.slice(1)], true));

  process.env.VIDEO_TIMELINE_V2_ENABLED = 'true';
  response = story;
  const generated = await storyLib.generateVideoStoryDraft({ ...base, sourceType: 'template', sourceContent: '旅途', availableWritingStyles: ['测试'] });
  assert.equal(generated.timingVersion, 2);
  assert.equal(generated.shots[1].duration, 3.5);
  response = { shots: motionPlan };
  const motion = await storyLib.planStoryVideoMotion({ story, framePlan });
  assert.equal(motion[0].narrationText, shots[0].narrationText);
  assert.ok(!lastRequest.input.includes('前约4秒'));
  const content = storyLib.buildStoryVideoTask({ ...base, story });
  const plan = JSON.parse(content.match(/\n(\{[^\n]+\})\nJSON/)[1]);
  assert.equal(plan.version, 2);
  assert.equal(plan.shots[0].duration, 2);
  assert.equal(plan.shots[0].narrationText, shots[0].narrationText);
  assert.ok(!plan.shots[0].videoPrompt.includes('总时长严格为5秒'));

  response = { ...script, sceneVersion: 1, characters: [], shots: shots.map(s => ({ ...s, startState: { location: '庭院', characters: [], props: [] }, endState: { location: '庭院', characters: [], props: [] }, mainAction: '花草轻微摇动', characterChanges: [], continuityNote: '相同庭院' })) };
  const vlog = await vlogLib.generateFeaturedVlogScript({ ...base, template: { beats: [] }, availableWritingStyles: ['测试'] });
  assert.equal(vlog.script.timingVersion, 2);
  const vlogInput = { ...base, script, template: { id: 't', name: '旅行' }, music: { id: 1, name: '配乐', tags: [], audioUrl: 'https://example.com/music.mp3' }, overallDirection: '自然' };
  const task = vlogLib.buildFeaturedVlogVideoTask(vlogInput);
  for (const instruction of [task, content]) {
    assert.ok(instruction.includes('飞书文件交付（必须执行）'));
    assert.ok(instruction.includes('发送实际图片文件'));
    assert.ok(instruction.includes('实际成品 MP4 文件'));
  }
  const vlogPlan = JSON.parse(task.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(vlogPlan.version, 2);
  assert.equal(vlogPlan.shots[1].duration, 3.5);
  assert.equal(vlogPlan.shots[2].transitionToNext, null);
  response = { ...script, timingVersion: undefined };
  await assert.rejects(() => vlogLib.generateFeaturedVlogScript({ ...base, template: { beats: [] }, availableWritingStyles: ['测试'] }));

  // Kill switch rejects new jobs; old cached scripts continue producing v1.
  delete process.env.VIDEO_TIMELINE_V2_ENABLED;
  assert.throws(() => storyLib.buildStoryVideoTask({ ...base, story }));
  assert.throws(() => vlogLib.buildFeaturedVlogVideoTask(vlogInput));
  assert.ok(storyLib.buildStoryVideoTask({ ...base, story: { ...story, timingVersion: undefined } }).includes('"version":1'));
  assert.ok(vlogLib.buildFeaturedVlogVideoTask({ ...vlogInput, script: { ...script, timingVersion: undefined } }).includes('"version":1'));
  console.log('Video timeline: validation, script preservation, narration locking, v1 compatibility and rollout gate passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
