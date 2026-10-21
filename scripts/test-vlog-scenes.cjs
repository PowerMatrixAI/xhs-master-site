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
let responseQueue = [];
let requestCount = 0;
const prompts = load('src/lib/featuredVlogPrompts.ts', {
  '@/lib/videoPhotography': load('src/lib/videoPhotography.ts'),
  '@/lib/videoPromptBudget': load('src/lib/videoPromptBudget.ts'),
  '@/lib/videoDelivery': load('src/lib/videoDelivery.ts'),
  '@/lib/vlogScene': scene, '@/lib/videoTimeline': timing,
  '@/lib/backendAiServerClient': { completeWithBackendAi: async r => { request = r; requestCount += 1; return { ok: true, text: JSON.stringify(responseQueue.length ? responseQueue.shift() : response) }; } },
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
  const front = clone(script);
  front.shots[0].startState = state('门口', 'front');
  front.shots[0].endState = state('窗边', 'front');
  scene.validateVlogScenes(front);
  assert.ok(scene.vlogFrameContext(front.shots[0], front.characters).includes('/front'));
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
  assert.ok(request.input.includes('20-30岁成年女性'));
  assert.ok(!request.input.includes('至少两个镜头包含front状态'));
  assert.ok(request.input.includes('没有正脸数量要求'));
  assert.ok(request.input.includes('先确定每镜观看重点'));
  const badChange = clone(script);
  badChange.shots[1].characterChanges = [{ id: 'A', type: 'enter', reason: '上一镜未出镜，本镜切到室内' }];
  const input = { account: {}, noteTask: {}, template: { beats: [] }, availableWritingStyles: ['测试'] };
  const incomplete = clone(script);
  incomplete.title = '';
  delete incomplete.shots[1].suggestedMaterial;
  incomplete.shots[1].subjectPresence = 'hands';
  responseQueue = [incomplete];
  await assert.rejects(() => prompts.generateFeaturedVlogScript(input), error => {
    assert.match(error.message, /缺少 title/);
    assert.match(error.message, /镜头 2 缺少 suggestedMaterial/);
    assert.match(error.message, /镜头 2 的 subjectPresence 无效/);
    return true;
  });
  const noGoal = clone(script);
  delete noGoal.noteTask.contentGoal;
  responseQueue = [noGoal];
  await assert.rejects(() => prompts.generateFeaturedVlogScript(input), /noteTask.contentGoal/);
  const spacedEnum = clone(script);
  spacedEnum.shots[0].subjectPresence = ' Traveler ';
  responseQueue = [spacedEnum];
  assert.equal((await prompts.generateFeaturedVlogScript(input)).script.shots[0].subjectPresence, 'traveler');
  responseQueue = [badChange, { characterChanges: [], continuityNote: '剪辑切换到室内，A从本镜首帧已在画面中', mainAction: '不应应用这个改写', endState: state('错误位置') }];
  const repaired = await prompts.generateFeaturedVlogScript(input);
  assert.equal(repaired.calls, 2);
  assert.equal(repaired.script.shots[1].characterChanges.length, 0);
  assert.equal(repaired.script.shots[1].mainAction, shots[1].mainAction);
  assert.equal(repaired.script.shots[1].endState.characters[0].position, '窗边');
  assert.ok(request.input.includes('起始[A]，结束[A]'));
  const beforeFailedRepair = requestCount;
  responseQueue = [badChange, { characterChanges: badChange.shots[1].characterChanges }];
  await assert.rejects(() => prompts.generateFeaturedVlogScript(input), /应记录无入场/);
  assert.equal(requestCount, beforeFailedRepair + 2); // No unbounded repair loop.
  const beforeDuplicate = requestCount;
  responseQueue = [duplicated];
  await assert.rejects(() => prompts.generateFeaturedVlogScript(input), /重复人物/);
  assert.equal(requestCount, beforeDuplicate + 1); // Never repair away a genuine duplicated character.
  response = { overallDirection: '自然', shots: shots.map(s => ({ order: s.order, role: s.role, description: '起始瞬间', frameSource: s.order === 1 ? 'asset' : 'generate', assetKey: s.order === 1 ? 'A01' : '', framePrompt: '构图保留原房间' })) };
  const frames = await prompts.planFeaturedVlogFrames({ script, template: {}, credentials: {}, assets: [{ id: 1, fileType: 'image', filePath: 'room.jpg', fileUrl: 'https://example.com/room.jpg', tags: '客房，已有游客' }] });
  assert.ok(!request.input.includes('"endState"'));
  assert.ok(request.input.includes('保留合理阴影'));
  assert.ok(!request.input.includes('下一镜专属动作'));
  assert.ok(frames.framePlan[0].framePrompt.includes('本首帧仅出镜 1 位人物'));
  assert.ok(frames.framePlan[0].framePrompt.includes('复用或调整现有人物'));
  const motionPlan = shots.map(s => ({ order: s.order, mainVideoPrompt: '首帧中的游客缓步走到窗边', endingTransitionPrompt: '在窗边停步' }));
  response = { shots: motionPlan };
  await prompts.planFeaturedVlogMotion({ script, framePlan: frames.framePlan, credentials: {} });
  assert.ok(request.input.includes('不默认每镜缓慢推进'));
  assert.ok(!request.input.includes('下一镜专属动作'));
  const content = prompts.buildFeaturedVlogVideoTask({ script, framePlan: frames.framePlan, motionPlan, account: { name: '账号', accountParam: 'test' }, noteTask: { id: 9, topicTitle: '慢下来' }, template: { id: 't', name: '模版' }, music: { id: 1, name: '曲目', tags: [], audioUrl: 'https://example.com/music.mp3' } });
  const plan = JSON.parse(content.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(plan.shots[0].startState.characters[0].position, '门口');
  assert.equal(plan.shots[0].endState.characters[0].position, '窗边');
  assert.ok(!plan.shots[0].videoPrompt.includes('下一镜专属动作'));
  assert.ok(!timing.timedMotionPrompt(shots[0], '行走', '停住').includes('下一镜专属动作'));
  assert.ok(content.includes('人数不符先修首帧'));
  assert.ok(content.includes('当前首帧＋人物参考首帧'));
  const six = clone(script);
  six.characters = ['A', 'B', 'C'].map(id => ({ id, appearance: '衣'.repeat(50), props: ['包'.repeat(25)] }));
  six.shots = Array.from({ length: 6 }, (_, i) => ({ ...clone(shots[0]), order: i+1,
    description: '景'.repeat(90), mainAction: '行'.repeat(45), continuityNote: '接'.repeat(45),
    startState: state('房间', 'front', ['A','B','C']), endState: state('窗边', 'front', ['A','B','C']), transitionToNext: i === 5 ? null : shots[0].transitionToNext }));
  const sixFrames = six.shots.map(s => ({ order: s.order, role: s.role, description: s.description, frameSource: 'asset', assetUrl: 'https://example.com/image.jpg?sig=' + 'x'.repeat(400), framePrompt: scene.vlogFrameContext(s, six.characters) + '光'.repeat(260) }));
  const sixMotion = six.shots.map(s => ({ order: s.order, mainVideoPrompt: '动'.repeat(140), endingTransitionPrompt: '停'.repeat(45) }));
  const boundedTask = prompts.buildFeaturedVlogVideoTask({ script: six, framePlan: sixFrames, motionPlan: sixMotion, account: { name: '账号', accountParam: 'test' }, noteTask: { id: 9, topicTitle: '主题' }, template: { id: 't', name: '模版' }, music: { id: 1, name: '曲目', tags: [], audioUrl: 'https://example.com/music.mp3' } });
  assert.ok(boundedTask.length < 18000, `Six-shot task too long: ${boundedTask.length}`);
  console.log(`Six-shot / three-person / signed-URL task: ${boundedTask.length} characters.`);
  console.log('Vlog scenes: single/couple/hands/environment, cast changes, start-only frames, material reuse and no future-shot leakage passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
