const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, overrides = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, process, URL, require: id => id in overrides ? overrides[id] : require(id) });
  return module.exports;
}
const scene = load('src/lib/vlogScene.ts');
const timing = load('src/lib/videoTimeline.ts');
let response, request;
const prompts = load('src/lib/featuredVlogPrompts.ts', {
  '@/lib/vlogScene': scene, '@/lib/videoTimeline': timing,
  '@/lib/backendAiServerClient': { completeWithBackendAi: async r => { request = r; return { ok: true, text: JSON.stringify(response) }; } },
  '@/lib/featuredVlog': { isHttpsUrl: url => url.startsWith('https://') }
});
const person = { id: 'A', appearance: '白裙游客', props: ['背包'] };
const state = (position, view = 'back', ids = ['A']) => ({ location: '客房', characters: ids.map(id => ({ id, position, pose: '自然站立', view })), props: ['背包在游客身上'] });
const shots = [1, 2, 3].map(order => ({ order, role: '放缓', beat: '停留', description: '游客入室后走到窗边', suggestedMaterial: '客房', subjectPresence: 'traveler', duration: 4,
  startState: state('门口'), mainAction: '同一游客从门口走到窗边', endState: state('窗边'), characterChanges: [], continuityNote: '前镜进入这间客房',
  transitionToNext: order === 3 ? null : { type: 'cut', duration: 0, reason: '空间承接', outgoingState: '窗边停步', incomingState: '下一镜专属动作：桌面放包' } }));
const script = { sceneVersion: 1, timingVersion: 2, title: '慢下来', summary: '入室停步', perspective: '旁观', moodTags: [], musicTags: [], noteTask: { topicTitle: '慢下来', contentGoal: '放缓', writingStyleName: '测试' }, characters: [person], shots };
const clone = value => JSON.parse(JSON.stringify(value));

async function main() {
  scene.validateVlogScenes(script);
  const two = clone(script);
  two.characters.push({ ...person, id: 'B', appearance: '另一位游客' });
  two.shots[0].startState = state('门口', 'back', ['A', 'B']);
  two.shots[0].endState = state('窗边', 'back', ['A', 'B']);
  scene.validateVlogScenes(two); // Normal couple scene is allowed.
  const hands = clone(script);
  hands.shots[0].startState = state('桌边', 'hands');
  hands.shots[0].endState = state('桌边', 'hands');
  scene.validateVlogScenes(hands);
  const environment = clone(script);
  environment.characters = [];
  environment.shots.forEach(s => { s.startState.characters = []; s.endState.characters = []; });
  scene.validateVlogScenes(environment);
  const duplicated = clone(script);
  duplicated.shots[0].startState.characters.push({ ...duplicated.shots[0].startState.characters[0], position: '窗边' });
  assert.throws(() => scene.validateVlogScenes(duplicated), /重复人物/);
  const changed = clone(script);
  changed.shots[0].startState.characters = [];
  assert.throws(() => scene.validateVlogScenes(changed), /凭空/);
  changed.shots[0].characterChanges = [{ id: 'A', type: 'enter', reason: '推门入场' }];
  scene.validateVlogScenes(changed);

  process.env.VIDEO_TIMELINE_V2_ENABLED = 'true';
  response = script;
  const generated = await prompts.generateFeaturedVlogScript({ account: {}, noteTask: {}, template: { beats: [] }, availableWritingStyles: ['测试'] });
  assert.equal(generated.script.shots[0].startState.characters.length, 1);
  response = { overallDirection: '自然', shots: shots.map(s => ({ order: s.order, role: s.role, description: '起始瞬间', frameSource: s.order === 1 ? 'asset' : 'generate', assetKey: s.order === 1 ? 'A01' : '', framePrompt: '构图保留原房间' })) };
  const frames = await prompts.planFeaturedVlogFrames({ script, template: {}, credentials: {}, assets: [{ id: 1, fileType: 'image', filePath: 'room.jpg', fileUrl: 'https://example.com/room.jpg', tags: '客房，已有游客' }] });
  assert.ok(!request.input.includes('"endState"'));
  assert.ok(!request.input.includes('下一镜专属动作'));
  assert.ok(frames.framePlan[0].framePrompt.includes('本首帧仅出镜 1 位人物'));
  assert.ok(frames.framePlan[0].framePrompt.includes('复用或调整现有人物'));
  const motionPlan = shots.map(s => ({ order: s.order, mainVideoPrompt: '首帧中的游客缓步走到窗边', endingTransitionPrompt: '在窗边停步' }));
  response = { shots: motionPlan };
  await prompts.planFeaturedVlogMotion({ script, framePlan: frames.framePlan, credentials: {} });
  assert.ok(!request.input.includes('下一镜专属动作'));
  const content = prompts.buildFeaturedVlogVideoTask({ script, framePlan: frames.framePlan, motionPlan, account: { name: '账号', accountParam: 'test' }, noteTask: { id: 9, topicTitle: '慢下来' }, template: { id: 't', name: '模版' }, music: { id: 1, name: '曲目', tags: [], audioUrl: 'https://example.com/music.mp3' } });
  const plan = JSON.parse(content.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(plan.shots[0].startState.characters[0].position, '门口');
  assert.equal(plan.shots[0].endState.characters[0].position, '窗边');
  assert.ok(!plan.shots[0].videoPrompt.includes('下一镜专属动作'));
  assert.ok(!timing.timedMotionPrompt(shots[0], '行走', '停住').includes('下一镜专属动作'));
  assert.ok(content.includes('人数不符先修首帧'));
  console.log('Vlog scenes: single/couple/hands/environment, cast changes, start-only frames, material reuse and no future-shot leakage passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
