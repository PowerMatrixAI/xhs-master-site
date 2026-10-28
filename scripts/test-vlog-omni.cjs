const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const calls = [];
let reply;
const ai = { completeWithBackendAi: async r => { calls.push(r); return { ok: true, text: JSON.stringify(await reply(r)), model: 'test' }; } };
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, process, URL, require: id => {
    if (id.endsWith('backendAiServerClient')) return ai;
    if (id === '@/lib/featuredVlog') return { isHttpsUrl: s => s.startsWith('https://') };
    if (id === '@/lib/storyCharacters') return { characterDownloadUrl: () => '' };
    if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
    if (id.startsWith('.')) return load(path.join(path.dirname(file), `${id}.ts`));
    return require(id);
  } });
  cache.set(file, mod.exports); return mod.exports;
}
const omni = load('src/lib/featuredVlogOmni.ts');
const selection = load('src/lib/videoAssetSelection.ts');
const prompts = load('src/lib/featuredVlogPrompts.ts');
const story = load('src/lib/videoPrompts.ts');
const clone = x => JSON.parse(JSON.stringify(x));
const state = people => ({ location: '场景', characters: people ? [{ id: 'A', position: '通行区域', pose: '自然站立', view: 'front' }] : [], props: [] });
const durations = [2, 3.5, 4, 3, 4.5, 5];
const script = { productionVersion: 3, timingVersion: 2, sceneVersion: 1, title: '林川的周末', summary: '从空间到自然', perspective: '第三人称', moodTags: ['自然'], musicTags: ['舒缓'], characters: [{ id: 'A', appearance: omni.LINCHUAN.appearance, props: ['左肩帆布包'] }], noteTask: { topicTitle: '周末', contentGoal: '慢下来', writingStyleName: '测试' }, shots: durations.map((duration, i) => ({
  order: i+1, beat: '观察', role: '发现空间', description: '观看自然与空间的关系', suggestedMaterial: '庭院', subjectPresence: i % 2 ? 'traveler' : 'environment', duration,
  startState: state(i % 2), endState: state(i % 2), mainAction: '观察', characterChanges: [], continuityNote: '主题承接',
  direction: { focus: '环境关系', photography: { scale: '中景', height: '平视', angle: '斜侧', composition: '偏左', depth: '前景树枝' }, camera: { type: i % 2 ? 'fixed' : 'push', direction: '向前', speed: '缓慢', extent: '小幅' }, action: '观察', timing: [{ start: 0, end: duration, action: '观察并自然停留' }], ending: '停稳' },
  transitionToNext: i === 5 ? null : { type: i === 0 ? 'dissolve' : 'cut', duration: i === 0 ? .5 : 0, reason: '视线承接', outgoingState: '看向自然', incomingState: '自然景观' }
})) };

async function main() {
  process.env.FEATURED_VLOG_OMNI_ENABLED = 'true';
  const template = { id: 't', name: '测试', version: 2, outline: '从空间到自然', perspectiveGuidance: '第三人称观察', visualGuidance: '自然摄影质感', musicTags: ['舒缓'],
    beats: [{ name: '发现', shotDuty: '展现住宿与自然的关系', visualGuidance: 'RETIRED_SHOT_CAMERA_INSTRUCTION', required: true }], requiredScenes: ['RETIRED_REQUIRED_SCENE'],
    referenceVideoId: 8, referenceVideo: { id: 8, name: '后端参考', version: 3, videoUrl: 'https://cdn.example.com/backend-reference.mp4', description: 'REFERENCE_CONTENT_NOT_FOR_SCRIPT' } };
  assert.throws(() => omni.styleVideoForTemplate({}), /未关联/);
  assert.throws(() => omni.styleVideoForTemplate({ ...template, referenceVideo: null }), /失效/);
  assert.throws(() => omni.styleVideoForTemplate({ ...template, referenceVideoId: 9 }), /失效/);
  for (const videoUrl of ['file:///tmp/ref.mp4', 'javascript:bad', 'https://user:pass@example.com/ref.mp4']) assert.throws(() => omni.styleVideoForTemplate({ ...template, referenceVideo: { ...template.referenceVideo, videoUrl } }), /地址无效/);
  // Obsolete static-host configuration must have no influence on selected backend URLs.
  process.env.VIDEO_REFERENCE_PUBLIC_ORIGIN = 'https://obsolete.example.com';
  assert.equal(omni.styleVideoForTemplate(template).url, template.referenceVideo.videoUrl);
  omni.validateOmniScript(script);
  const invalid = clone(script); invalid.shots[0].direction.timing[0].end = 3;
  assert.throws(() => omni.validateOmniScript(invalid), /时长/);
  invalid.shots[0].direction = undefined;
  assert.throws(() => omni.validateOmniScript(invalid), /摄影/);
  reply = () => script;
  const generated = await prompts.generateFeaturedVlogScript({ account: {}, noteTask: {}, template, availableWritingStyles: ['测试'] });
  assert.equal(generated.script.productionVersion, 3);
  assert.ok(calls.at(-1).input.includes('林川'));
  assert.ok(!calls.at(-1).input.includes('主角倾向为20-30岁成年女性'));
  const planningTemplate = JSON.parse(calls.at(-1).input.split('平台模板：\n')[1].split('\n\n用户补充要求：')[0]);
  assert.equal(planningTemplate.beats[0].mainContent, template.beats[0].shotDuty);
  assert.equal(planningTemplate.beats[0].required, true);
  assert.equal(planningTemplate.visualGuidance, '自然摄影质感');
  assert.ok(!calls.at(-1).input.includes('RETIRED_SHOT_CAMERA_INSTRUCTION'));
  assert.ok(!calls.at(-1).input.includes('RETIRED_REQUIRED_SCENE'));
  assert.ok(!calls.at(-1).input.includes('REFERENCE_CONTENT_NOT_FOR_SCRIPT'));
  assert.ok(calls.at(-1).input.includes('20-30 秒') && !calls.at(-1).input.includes('20-40 秒'));
  for (const [durations, overlap, expected] of [[[7,7,6.5], .25, 20], [[10,10,10], 0, 30], [[6,6,7.5], 0, 19.5], [[8,8,8,6.5], 0, 30.5]]) {
    const sample = clone(script);
    sample.shots = durations.map((duration, i) => ({ ...clone(script.shots[i]), order: i+1, duration,
      direction: { ...clone(script.shots[i].direction), timing: [{ start: 0, end: duration, action: '观察并停留' }] },
      transitionToNext: i === durations.length-1 ? null : { ...clone(script.shots[0].transitionToNext), type: overlap ? 'dissolve' : 'cut', duration: overlap }
    }));
    reply = () => sample;
    const generate = () => prompts.generateFeaturedVlogScript({ account: {}, noteTask: {}, template, availableWritingStyles: ['测试'] });
    if (expected < 20 || expected > 30) await assert.rejects(generate, /成片时长须为20–30秒/);
    else assert.equal((await generate()).script.shots.length, durations.length);
  }
  const assets = [0,1,2].map(i => ({ id: i+1, filePath: `${i}.png`, fileUrl: `https://example.com/${i}.png`, fileType: 'image', tags: '庭院', aiAnalysis: `分析${i}：左侧树木右侧通道`, aiAnalysisStatus: i === 2 ? 'deleted' : 'completed' }));
  reply = () => ({ overallDirection: '自然', shots: script.shots.map((s,i) => ({ order: s.order, source: i < 3 ? 'asset' : 'generate', assetKey: i < 3 ? `A0${i+1}` : '', sceneDescription: '保留场景结构', selectionReason: '通道与观察主题匹配' })) });
  const frames = await prompts.planFeaturedVlogFrames({ script, assets, template: {}, credentials: {} });
  assert.ok(calls.at(-1).input.includes('分析0'));
  assert.ok(!calls.at(-1).input.includes('分析2'));
  assert.equal(frames.framePlan[0].aiAnalysis, assets[0].aiAnalysis);
  assert.ok(!frames.framePlan[0].framePrompt.includes('front'));
  const count = calls.length;
  assert.equal((await prompts.planFeaturedVlogMotion({ script, framePlan: frames.framePlan })).motionPlan.length, 0);
  assert.equal(calls.length, count, 'v3 must not replan confirmed motion');
  const task = prompts.buildFeaturedVlogVideoTask({ account: { name: '账号', accountParam: 'test' }, noteTask: { id: 1, topicTitle: '测试' }, template, script, framePlan: frames.framePlan, motionPlan: [], music: { id: 1, name: '配乐', tags: [], audioUrl: 'https://example.com/music.mp3' }, overallDirection: '自然' });
  const plan = JSON.parse(task.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(plan.version, 3); assert.equal(plan.generation.aspect_ratio, '9:16');
  assert.equal(plan.generation.provider, 'kling_cli');
  assert.equal(plan.generation.tool, 'omni_ref_video');
  assert.ok(task.includes('kling omni_ref_video --model kling-video-v3_0_omni'));
  assert.ok(task.includes('kling query_tasks'));
  assert.ok(task.includes('submitResponse'));
  assert.ok(!task.includes('通过MCP上传'));
  assert.equal(plan.character.id, '324475410205532');
  assert.equal(plan.styleVideo.url, template.referenceVideo.videoUrl);
  assert.equal(plan.styleVideo.id, 8);
  assert.equal(plan.styleVideo.version, 3);
  assert.equal(plan.styleVideo.source, 'template');
  assert.equal(plan.styleVideo.purpose, 'style_and_texture');
  assert.equal(plan.template.referenceVideoId, 8);
  assert.ok(!task.includes('/video-references/'));
  assert.ok(!task.includes('obsolete.example.com'));
  assert.ok(task.includes('--video传styleVideoPath'));
  const changedTemplate = { ...template, referenceVideo: { ...template.referenceVideo, version: 4, videoUrl: 'https://cdn.example.com/new-reference.mp4' } };
  const changedTask = omni.buildOmniTask({ account: {}, noteTask: { id: 2 }, template: changedTemplate, script, framePlan: frames.framePlan, music: { audioUrl: 'https://example.com/music.mp3' } });
  assert.ok(changedTask.includes(changedTemplate.referenceVideo.videoUrl) && !changedTask.includes(template.referenceVideo.videoUrl));
  assert.equal(plan.shots[0].sceneReference.analysis, assets[0].aiAnalysis);
  assert.ok(!JSON.stringify(plan).includes('endingTransitionPrompt'));
  assert.ok(!JSON.stringify(plan).includes('framePrompt'));
  assert.ok(task.length < 18000, task.length);
  const cachedLong = clone(script);
  cachedLong.shots.forEach(s => { s.duration = 7; s.direction.timing = [{ start: 0, end: 7, action: '观察' }]; });
  assert.doesNotThrow(() => omni.buildOmniTask({ script: cachedLong, template, framePlan: frames.framePlan, noteTask: { id: 99 }, music: { audioUrl: 'https://example.com/music.mp3' } }), 'existing cached scripts keep their confirmed timeline');
  // Reproduce the production call shape: the route passes a full Account and
  // NoteTask, not the minimal objects used by the original fixtures.
  const internal = 'INTERNAL_STRATEGY_RESEARCH_LIBRARY_ONLY_'.repeat(3000);
  const richScript = clone(script);
  richScript.noteTask.writingStyleReference = internal;
  richScript.shots.forEach(s => {
    s.direction.internalContext = internal;
    s.direction.photography.assetCatalog = internal;
    s.direction.camera.research = internal;
    s.direction.timing[0].weeklyPlan = internal;
    s.startState.internalContext = internal;
    s.endState.assetCatalog = internal;
    s.startState.characters.forEach(c => { c.research = internal; });
    if (s.transitionToNext) s.transitionToNext.internalContext = internal;
  });
  const richTask = prompts.buildFeaturedVlogVideoTask({
    account: { id: 5, name: '账号', accountParam: 'test', strategy: { markdown: internal }, referenceAccounts: internal, assets: assets.map(a => ({ ...a, aiAnalysis: internal })), weeklyPlans: [{ markdown: internal }], expertRules: [{ rule: internal }] },
    noteTask: { id: 1, topicTitle: '测试', plan: task, writingStyleReference: internal, knowledgeSourceKeys: [internal] },
    template: { ...template, internalContext: internal }, script: richScript,
    framePlan: frames.framePlan.map(f => ({ ...f, fullAssetLibrary: internal })), motionPlan: [],
    music: { id: 1, name: '配乐', tags: [], audioUrl: 'https://example.com/music.mp3', library: internal }, overallDirection: '自然'
  });
  assert.equal(richTask, task, 'full runtime objects must produce the same minimal execution task');
  assert.ok(!richTask.includes('INTERNAL_STRATEGY_RESEARCH_LIBRARY_ONLY_'));
  assert.ok(!('account' in plan), 'execution plan must not contain any account object');
  assert.ok(!('noteTask' in plan), 'execution plan must not contain any noteTask object');
  assert.ok(!task.includes('账号：'));
  assert.ok(!JSON.stringify(plan).includes('selectionReason'), 'selection rationale stays in console, not execution instructions');
  console.log('Full-account and previous-task regression: execution payload contains no planning/research/library context.');
  const stressScript = clone(script);
  stressScript.summary = '概'.repeat(160); stressScript.perspective = '视'.repeat(80);
  stressScript.shots.forEach(s => {
    s.role = '职'.repeat(25); s.description = '描'.repeat(90); s.mainAction = '动'.repeat(45); s.continuityNote = '接'.repeat(45);
    for (const k of Object.keys(s.direction.photography)) s.direction.photography[k] = '摄'.repeat(25);
    for (const k of ['direction','speed','extent']) s.direction.camera[k] = '移'.repeat(25);
    s.direction.focus = '看'.repeat(25); s.direction.action = '动'.repeat(25); s.direction.ending = '停'.repeat(25);
    s.direction.timing = [{ start: 0, end: .5, action: '动'.repeat(20) }, { start: .5, end: 1.5, action: '动'.repeat(20) }, { start: 1.5, end: s.duration, action: '停'.repeat(20) }];
    if (s.transitionToNext) for (const k of ['reason','incomingState','outgoingState']) s.transitionToNext[k] = '接'.repeat(40);
  });
  const longUrl = 'https://example.com/image.jpg?sig=' + 'a'.repeat(400);
  const stressTask = omni.buildOmniTask({ account: { name: '账号', accountParam: 'test' }, noteTask: { id: 1, topicTitle: '测试' }, template, script: stressScript, framePlan: frames.framePlan.map((f,i) => ({ ...f, frameSource: 'asset', assetUrl: longUrl + i, framePrompt: '图'.repeat(180), aiAnalysis: '析'.repeat(100), selectionReason: '因'.repeat(60) })), music: { id: 1, name: '配乐', tags: [], audioUrl: longUrl }, overallDirection: '整'.repeat(90) });
  assert.ok(stressTask.length <= 18000, `stress task ${stressTask.length}`);
  console.log(`Omni six-shot long-field/signed-URL budget: ${stressTask.length} chars`);
  fs.mkdirSync('tmp', { recursive: true });
  fs.writeFileSync('tmp/omni-v3-contract-plan.json', JSON.stringify(plan));
  const large = selection.videoAssetReferences(Array.from({ length: 90 }, (_, i) => ({ ...assets[0], id: i+1, filePath: `${i}.png`, tags: '长标签'.repeat(20) })));
  const seen = new Set();
  reply = r => {
    const group = JSON.parse(r.input.split('本批：')[1]);
    group.forEach(a => seen.add(a.assetKey));
    return { assetKeys: [group.at(-1).assetKey] };
  };
  const selected = await selection.shortlistVideoAssets(large, script.shots, 1400);
  assert.equal(seen.size, 90); assert.ok(selected.assets.some(a => a.assetKey === 'A90'));
  const baseStory = { ...script, productionVersion: undefined };
  reply = () => ({ overallDirection: '自然', shots: script.shots.map((s,i) => ({ order: s.order, role: s.role, description: s.description, frameSource: i === 0 ? 'asset' : 'generate', assetKey: i === 0 ? 'A01' : '', framePrompt: '自然场景' })) });
  await story.planStoryVideoFrames({ account: {}, noteTask: {}, story: baseStory, assets });
  assert.ok(calls.at(-1).input.includes('分析0'), 'story selection must receive image analysis');
  delete process.env.FEATURED_VLOG_OMNI_ENABLED;
  assert.throws(() => omni.buildOmniTask({ script }), /未启用/);
  console.log(`Omni v3: script, analysis selection, full-library batching, task contract and legacy gate passed. Task ${task.length} chars.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
