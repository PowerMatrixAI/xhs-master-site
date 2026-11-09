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
const templateRules = load('src/lib/featuredVlogTemplateRules.ts');
const vlogSelection = load('src/lib/featuredVlogAssetSelection.ts');
const story = load('src/lib/videoPrompts.ts');
const clone = x => JSON.parse(JSON.stringify(x));
function photographyScript(value) {
  const s=clone(value); s.photographyVersion=1;
  s.shots.forEach(shot=>Object.assign(shot.direction, {subjectRole:shot.subjectPresence==='environment'?'environment':'life',subjectPresentation:shot.subjectPresence==='environment'?'无人':'人物偏侧小比例',focusTarget:'空间',camera:{...shot.direction.camera,startFrame:'前景与空间',endFrame:'空间整体',visualChange:shot.direction.camera.type==='fixed'?'自然光影变化':'前景退出空间展开',reason:'观察空间关系'}}));
  return s;
}
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
  const paraphrased = clone(script);
  paraphrased.characters[0].appearance = '林川，米色衬衫、灰绿色长裤，携带深棕色肩包';
  assert.doesNotThrow(() => omni.validateOmniScript(paraphrased), 'identity must not depend on exact appearance wording');
  const wrongIdentity = clone(script);
  wrongIdentity.characters.push({ id: 'B', appearance: '另一位游客', props: [] });
  assert.throws(() => omni.validateOmniScript(wrongIdentity), /人物标识/);
  const renamed = clone(script);
  renamed.characters[0].id = 'traveler_1';
  renamed.shots.forEach(s => { for (const state of [s.startState,s.endState]) state.characters.forEach(c=>c.id='traveler_1'); });
  omni.normalizeOmniCast(renamed.characters, renamed.shots);
  assert.doesNotThrow(()=>omni.validateOmniScript(renamed));
  assert.equal(renamed.characters[0].id,'A');
  assert.throws(()=>omni.normalizeOmniCast([{id:'A'},{id:'B'}],[]),/独立人物/);
  const invalid = clone(script); invalid.shots[0].direction.timing[0].end = 3;
  assert.throws(() => omni.validateOmniScript(invalid), /时长/);
  invalid.shots[0].direction = undefined;
  assert.throws(() => omni.validateOmniScript(invalid), /摄影/);
  reply = () => photographyScript(script);
  const generated = await prompts.generateFeaturedVlogScript({ account: {}, noteTask: {}, template, availableWritingStyles: ['测试'] });
  assert.equal(generated.script.productionVersion, 3);
  assert.ok(!calls.at(-1).input.includes('林川'));
  assert.ok(!calls.at(-1).input.includes(omni.LINCHUAN.appearance));
  assert.equal(generated.script.characterSelection, 'unassigned');
  assert.equal(generated.script.characters[0].appearance, '游客A，具体外观在第二步选择');
  assert.equal(generated.script.photographyVersion,1);
  assert.ok(!calls.at(-1).input.includes('主角倾向为20-30岁成年女性'));
  const planningTemplate = JSON.parse(calls.at(-1).input.split('平台模板：\n')[1].split('\n\n用户补充要求：')[0]);
  assert.equal(planningTemplate.beats[0].mainContent, template.beats[0].shotDuty);
  assert.equal(planningTemplate.beats[0].required, true);
  assert.equal(planningTemplate.visualGuidance, '自然摄影质感');
  const annotated = '展示建筑与山谷的关系。 【景别】远景；【机位】高位俯拍；【运镜】缓慢环绕。原片对照：00:00–00:06 建筑。';
  const parsedBeat = templateRules.parseVlogBeatContent(annotated);
  assert.equal(parsedBeat.mainContent, '展示建筑与山谷的关系。');
  assert.ok(parsedBeat.cameraReference.viewpoint.includes('高位俯拍'));
  assert.ok(parsedBeat.cameraReference.movement.includes('环绕'));
  assert.ok(parsedBeat.cameraReference.sourceNote.includes('00:00–00:06'));
  assert.equal(parsedBeat.cameraReference.raw, annotated.slice(annotated.indexOf('【景别】')));
  for (const legacy of ['展示住宿与自然的关系', '普通文字【未知标记】全部保留']) {
    assert.equal(templateRules.parseVlogBeatContent(legacy).mainContent, legacy);
  }
  for (const partial of ['内容目标。【机位】俯拍', '内容目标。【机位】俯拍【机位】侧面', '内容目标。【运镜】']) {
    const parsed = templateRules.parseVlogBeatContent(partial);
    assert.equal(parsed.mainContent, '内容目标。');
    assert.equal(parsed.cameraReference.raw, partial.slice(partial.indexOf('【')));
  }
  assert.equal(templateRules.parseVlogBeatContent('【机位】俯拍').mainContent, '【机位】俯拍');
  const annotatedTemplate = { ...template, beats: [{ ...template.beats[0], shotDuty: annotated }] };
  reply = () => photographyScript(script);
  await prompts.generateFeaturedVlogScript({ account: {}, noteTask: {}, template: annotatedTemplate, availableWritingStyles: ['测试'] });
  const softTemplate = JSON.parse(calls.at(-1).input.split('平台模板：\n')[1].split('\n\n用户补充要求：')[0]);
  assert.equal(softTemplate.beats[0].mainContent, parsedBeat.mainContent);
  assert.equal(softTemplate.beats[0].required, true);
  assert.ok(softTemplate.beats[0].cameraReference.viewpoint.includes('俯拍'));
  assert.equal(annotatedTemplate.beats[0].shotDuty, annotated, 'planning must not mutate backend records');
  assert.ok(calls.at(-1).input.includes('未读图的暂定摄影设计'));
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
    reply = () => photographyScript(sample);
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
  assert.equal(plan.character.id, '324641305202280');
  assert.equal(plan.character.bindName, '林川-山林周末Vlog');
  const makeTask = (s, resolution) => prompts.buildFeaturedVlogVideoTask({ script: s, template, framePlan: frames.framePlan, motionPlan: [], noteTask: { id: 1 }, music: { audioUrl: 'https://example.com/music.mp3' }, resolution, overallDirection: '自然' });
  const getPlan = task => JSON.parse(task.match(/```json\n([\s\S]*?)\n```/)[1]);
  const photo = photographyScript(script);
  const photoPlan=getPlan(makeTask(photo));
  assert.equal(photoPlan.photographyVersion,1);
  assert.deepEqual(photoPlan.shots[1].direction,photo.shots[1].direction);
  const missing=clone(photo); delete missing.shots[1].direction.camera.endFrame;
  assert.throws(()=>omni.validateOmniScript(missing),/镜头 2.*endFrame/);
  const badRole=clone(photo); badRole.shots[0].direction.subjectRole='foreground';
  assert.throws(()=>omni.validateOmniScript(badRole),/冲突/);
  const hintModule=load('src/lib/vlogPhotography.ts');
  photo.shots.forEach(s=>s.direction.camera.type='fixed');
  assert.doesNotThrow(()=>omni.validateOmniScript(photo));
  assert.ok(hintModule.photographyHints(photo).some(h=>h.includes('连续固定')));
  assert.ok(hintModule.photographyHints(photo).some(h=>h.includes('主要动作文字相同')));
  const repeatedPeople=photographyScript(script);
  repeatedPeople.shots.slice(0,3).forEach(s=>{s.subjectPresence='traveler';s.startState=state(true);s.endState=state(true);s.direction.subjectRole='life';s.direction.subjectPresentation=s.order===2?'人物偏左、全身':'人物偏左全身';});
  assert.ok(hintModule.photographyHints(repeatedPeople).some(h=>h.includes('人物作用及呈现文字相同')));
  repeatedPeople.shots.slice(0,2).forEach(s=>{s.mainAction=s.order===1?'坐到床沿':'在溪边坐下';s.startState.characters[0].pose='站立';s.endState.characters[0].pose='坐定';});
  assert.ok(hintModule.photographyHints(repeatedPeople).some(h=>h.includes('从站立到坐姿')));
  assert.equal(getPlan(makeTask(script)).generation.resolution, '720p');
  assert.equal(getPlan(makeTask(script, '1080p')).generation.resolution, '1080p');
  assert.ok(makeTask(script, '1080p').includes('resolution=1080p'));
  assert.throws(() => makeTask(script, '4k'), /清晰度/);
  assert.throws(() => makeTask(script, null), /清晰度/);
  const environment = clone(script);
  environment.characters = [];
  environment.shots.forEach(s => { s.subjectPresence = 'environment'; s.startState = state(false); s.endState = state(false); });
  const environmentTask = makeTask(environment, '1080p');
  assert.ok(!('character' in getPlan(environmentTask)));
  assert.ok(!environmentTask.includes('<<<324641305202280>>>'));
  assert.ok(getPlan(environmentTask).shots.every(s => s.subjectPresence === 'environment'));
  const conflict = clone(script);
  conflict.shots[1].subjectPresence = 'environment';
  assert.throws(() => omni.validateOmniScript(conflict), /纯环境/);
  const hands = clone(script);
  hands.shots[1].subjectPresence = 'pov';
  hands.shots[1].startState.characters[0].view = 'hands';
  hands.shots[1].endState.characters[0].view = 'hands';
  assert.equal(getPlan(makeTask(hands)).character.id, omni.LINCHUAN.id);
  const entering = clone(script);
  entering.shots[1].startState = state(false);
  entering.shots[1].characterChanges = [{ id: 'A', type: 'enter', reason: '由画外走入' }];
  assert.equal(getPlan(makeTask(entering)).character.id, omni.LINCHUAN.id);
  const paraphrasedTask = omni.buildOmniTask({ script: paraphrased, template, framePlan: frames.framePlan, noteTask: { id: 1 }, music: { audioUrl: 'https://example.com/music.mp3' }, overallDirection: '自然' });
  const paraphrasedPlan = JSON.parse(paraphrasedTask.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(paraphrasedPlan.character.id, '324641305202280', 'paraphrased appearance must still bind the preset Element');
  assert.ok(task.includes('kling element_get 324641305202280'));
  assert.ok(!task.includes('324475410205532'));
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
  for (const instruction of ['plan.shots[].direction仅为暂定拍法', '看完本片全部实际图片', '不锁死原图裁切与机位', 'cameraMovement分别写起幅', 'request.arguments.prompt必须等于refinement.prompt', '不直接执行或拼接plan.direction', '核心动作无法成立时停止报告', '不能替代读图', '用户接受偏差仍保留说明']) {
    assert.ok(task.includes(instruction), instruction);
  }
  assert.equal(plan.shots[0].direction.camera.type, script.shots[0].direction.camera.type, 'original plan remains unchanged; adaptation belongs in refinement');
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
  const stress1080 = stressTask.replace('"resolution":"720p"', '"resolution":"1080p"');
  assert.ok(stress1080.length <= 18000);
  console.log(`Omni six-shot long-field/signed-URL budget: ${stressTask.length} chars`);
  const photoStress=photographyScript(stressScript);
  photoStress.shots.forEach(s=>{
    s.description='描'.repeat(50);s.mainAction='动'.repeat(30);s.continuityNote='接'.repeat(25);
    s.direction.subjectPresentation='呈'.repeat(15);s.direction.focusTarget='焦'.repeat(15);
    for(const k of Object.keys(s.direction.photography)) s.direction.photography[k]='摄'.repeat(15);
    for(const k of ['focus','action','ending']) s.direction[k]='意'.repeat(15);
    for(const k of ['direction','speed','extent','startFrame','endFrame','visualChange','reason']) s.direction.camera[k]='摄'.repeat(15);
    if(s.transitionToNext) for(const k of ['reason','incomingState','outgoingState'])s.transitionToNext[k]='接'.repeat(25);
  });
  const photoStressTask=omni.buildOmniTask({noteTask:{id:1},template,script:photoStress,framePlan:frames.framePlan.map((f,i)=>({...f,frameSource:'asset',assetUrl:longUrl+i,framePrompt:'图'.repeat(180),aiAnalysis:'析'.repeat(100)})),music:{id:1,name:'配乐',tags:[],audioUrl:longUrl},overallDirection:'整'.repeat(90)});
  assert.ok(photoStressTask.length<=18000,`photography stress ${photoStressTask.length}`);
  console.log(`Photography six-shot long-field/signed-URL budget: ${photoStressTask.length} chars`);
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

  // Cached scripts can contain camera prose in otherwise content-bearing fields.
  const cached = clone(script);
  cached.shots.forEach(s => {
    s.description = '俯拍建筑与山谷，展示住宿与自然的关系';
    s.role = '建筑环境全景';
    s.suggestedMaterial = '高位俯拍庭院，必须可环绕';
    s.mainAction = '人物走向窗边；运镜：缓慢推进';
    s.direction.photography.angle = 'CAMERA_REFERENCE_TOP_DOWN_ONLY';
    s.cameraReference = { movement: 'CACHED_CAMERA_REFERENCE' };
    s.startState.characters.forEach(c => { c.pose = '自然站立，摄影机高位俯拍'; });
  });
  const beforeCached = JSON.stringify(cached);
  const contentOnly = vlogSelection.featuredVlogForAssetSelection(cached);
  assert.ok(!/俯拍|全景|环绕|运镜|摄影机|CAMERA_REFERENCE|direction|transitionToNext/.test(JSON.stringify(contentOnly)));
  assert.ok(contentOnly.shots[0].description.includes('建筑与山谷'));
  assert.ok(contentOnly.shots[0].mainAction.includes('人物走向窗边'));
  assert.equal(contentOnly.shots[1].startState.characters.length, 1);
  assert.ok(!('view' in contentOnly.shots[1].startState.characters[0]));
  assert.equal(JSON.stringify(cached), beforeCached);
  assert.ok(vlogSelection.vlogSelectionContent('人物仰视山体，低角度仰拍的建筑').includes('人物观看山体'));
  assert.ok(vlogSelection.vlogSelectionContent('人物走向窗边，建筑与山谷同框').includes('人物走向窗边'));
  assert.equal(vlogSelection.vlogSelectionContent('必须高位斜俯拍的庭院'), '庭院');
  assert.equal(vlogSelection.vlogSelectionContent('镜头从人物背后跟随游客穿过门洞'), '游客穿过门洞');
  const levelAssets = Array.from({ length: 90 }, (_, i) => ({ ...assets[0], id: i+1, filePath: `${i}.png`,
    tags: '庭院'.repeat(60), aiAnalysis: '平视图片，建筑、山谷与庭院同框，具备人物行走通道。'.repeat(15) }));
  let screeningCalls = 0, finalSelectionCalls = 0;
  reply = r => {
    if (r.input.includes('\n本批：')) {
      screeningCalls++;
      const shotInput = JSON.parse(r.input.split('镜头：')[1].split('\n本批：')[0]);
      assert.equal(JSON.stringify(shotInput), JSON.stringify(contentOnly.shots));
      assert.ok(r.input.includes(vlogSelection.VLOG_ASSET_SELECTION_RULES));
      const group = JSON.parse(r.input.split('\n本批：')[1]);
      return { assetKeys: [group[0].assetKey] };
    }
    finalSelectionCalls++;
    const selectionScript = JSON.parse(r.input.split('\n脚本：')[1].split('\n素材：')[0]);
    assert.equal(JSON.stringify(selectionScript), JSON.stringify(contentOnly));
    assert.ok(r.input.includes('不能仅因不符合参考拍法拒绝图片'));
    assert.ok(r.input.includes('不能勉强使用内容不相关的图片'));
    return { overallDirection: '按实际平视图片读图适配', shots: cached.shots.map((s,i) => ({ order: s.order,
      source: i === 0 ? 'asset' : 'generate', assetKey: i === 0 ? 'A01' : '',
      sceneDescription: i === 0 ? '保留原图平视透视、建筑与山谷关系' : '内容无匹配素材时生成无人环境',
      selectionReason: i === 0 ? '建筑与山谷同框，可承接内容' : '缺少内容匹配素材' })) };
  };
  const adapted = await prompts.planFeaturedVlogFrames({ script: cached, template: annotatedTemplate, assets: levelAssets, credentials: {} });
  assert.ok(screeningCalls > 0 && finalSelectionCalls === 1);
  assert.equal(adapted.framePlan[0].frameSource, 'asset');
  assert.equal(adapted.framePlan[0].assetUrl, levelAssets[0].fileUrl);
  assert.ok(adapted.framePlan[0].framePrompt.includes('平视'));
  assert.equal(adapted.framePlan[1].frameSource, 'generate');
  const adaptedTask = prompts.buildFeaturedVlogVideoTask({ script: cached, template: annotatedTemplate,
    framePlan: adapted.framePlan, motionPlan: [], noteTask: { id: 42 }, music: { audioUrl: 'https://example.com/music.mp3' } });
  assert.ok(adaptedTask.includes('不锁死原图裁切与机位'));
  assert.ok(adaptedTask.includes('不补造未知房间、建筑背面或路线'));
  assert.equal(JSON.stringify(cached), beforeCached);
  console.log('Camera adaptation: tagged/legacy parsing, content-only screening and selection, level-image mapping and execution contract passed.');
  const legacyCached = { ...cached, productionVersion: undefined };
  reply = r => {
    const frameScript = JSON.parse(r.input.split('脚本：\n')[1].split('\n\n摄影处理：')[0]);
    assert.ok(!/俯拍|环绕|CAMERA_REFERENCE|direction|endState/.test(JSON.stringify(frameScript)));
    assert.equal(frameScript.shots[1].startState.characters[0].view, 'front', 'face orientation is retained for refinement, not source-image selection');
    return { overallDirection: '保留实际图片透视', shots: contentOnly.shots.map((s,i) => ({
      order: s.order, role: s.role, description: '仅起始瞬间', frameSource: i === 0 ? 'asset' : 'generate',
      assetKey: i === 0 ? 'A01' : '', framePrompt: '保留实际图片的平视角度与空间' })) };
  };
  const legacyFrames = await prompts.planFeaturedVlogFrames({ script: legacyCached, template: annotatedTemplate, assets, credentials: {} });
  assert.equal(legacyFrames.framePlan[0].assetUrl, assets[0].fileUrl);
  assert.equal(legacyFrames.framePlan[0].role, cached.shots[0].role, 'API metadata retains the original content role');
  assert.ok(legacyFrames.framePlan[0].framePrompt.includes('平视'));
  const baseStory = { ...script, productionVersion: undefined };
  reply = () => ({ overallDirection: '自然', shots: script.shots.map((s,i) => ({ order: s.order, role: s.role, description: s.description, frameSource: i === 0 ? 'asset' : 'generate', assetKey: i === 0 ? 'A01' : '', framePrompt: '自然场景' })) });
  await story.planStoryVideoFrames({ account: {}, noteTask: {}, story: baseStory, assets });
  assert.ok(calls.at(-1).input.includes('分析0'), 'story selection must receive image analysis');
  assert.ok(!calls.at(-1).input.includes(vlogSelection.VLOG_ASSET_SELECTION_RULES), 'vlog camera policy must not change story selection');
  const originalScript = JSON.stringify(script);
  const characterCatalog = load('src/lib/vlogCharacters.ts');
  assert.equal((await prompts.adaptFeaturedVlogCharacter({ script, characterSelection: 'linchuan' })).calls, 0);
  reply = () => clone(script);
  const assigned = await prompts.adaptFeaturedVlogCharacter({ script: generated.script, characterSelection: 'linchuan' });
  assert.equal(assigned.calls, 0, 'new generic scripts bind the selected preset without AI');
  assert.equal(assigned.script.characterSelection, 'linchuan');
  assert.equal(JSON.stringify(assigned.script.shots.map(s=>s.direction)),JSON.stringify(generated.script.shots.map(s=>s.direction)));
  const feminine = await prompts.adaptFeaturedVlogCharacter({script:generated.script,characterSelection:'shenhe'});
  assert.equal(feminine.calls,0);
  assert.equal(JSON.stringify(feminine.script.shots.map(s=>s.direction)),JSON.stringify(generated.script.shots.map(s=>s.direction)));
  const adaptationModule=load('src/lib/vlogCharacterAdaptation.ts');
  const emptyPatch={shots:generated.script.shots.map(s=>({order:s.order,mainAction:'水面自然流动',description:'观察自然',action:'水面自然流动',focus:'水流',ending:'水流延伸',composition:'石块偏侧',depth:'水面与远岸',focusTarget:'水面',camera:{type:'fixed',direction:'朝向水面',speed:'固定',extent:'稳定观察',startFrame:'水面绕石',endFrame:'水面绕石',visualChange:'水纹持续变化',reason:'观察自然细节'},timingActions:s.direction.timing.map(()=>'水面自然流动')}))};
  emptyPatch.shots.forEach(p=>Object.assign(p,{scale:'环境中景',height:'低位',angle:'朝向水面'}));
  emptyPatch.summary='观察自然空间';emptyPatch.perspective='环境观察';
  emptyPatch.shots.slice(0,-1).forEach(p=>p.transitionText={reason:'空间承接',outgoingState:'水面',incomingState:'树影'});
  const emptyPhoto=adaptationModule.applyVlogCharacterPatch(generated.script,'none',emptyPatch).script;
  assert.doesNotThrow(()=>omni.validateOmniScript(emptyPhoto));
  assert.ok(emptyPhoto.shots.every(s=>s.direction.subjectRole==='environment' && s.direction.subjectPresentation==='无人' && !s.startState.characters.length));
  const emptyFollow=clone(emptyPhoto);emptyFollow.shots[1].direction.camera.type='follow';
  assert.throws(()=>omni.validateOmniScript(emptyFollow),/无人模式不能沿用人物跟随/);
  assert.throws(()=>adaptationModule.applyVlogCharacterPatch(generated.script,'none',{summary:'环境',perspective:'环境',shots:[]}),/无人适配/);
  for (const empty of [null,{}]) {
    const withEmpty=clone(emptyPatch);withEmpty.shots.at(-1).transitionText=empty;
    assert.equal(adaptationModule.applyVlogCharacterPatch(generated.script,'none',withEmpty).script.shots.at(-1).transitionToNext,null);
  }
  const invalidLast=clone(emptyPatch);invalidLast.shots.at(-1).transitionText={reason:'新增末镜转场'};
  assert.throws(()=>adaptationModule.applyVlogCharacterPatch(generated.script,'none',invalidLast),/转场补丁/);
  assert.equal(generated.script.characterSelection, 'unassigned');
  assert.throws(() => omni.buildOmniTask({ script: generated.script }), /适配/);
  const female = clone(script);
  female.title = '沈禾的周末';
  female.characters[0].appearance = characterCatalog.VLOG_CHARACTERS.shenhe.appearance;
  reply = request => {
    assert.ok(request.input.includes('325994250221723'));
    return { title: female.title, shots: [] };
  };
  const femaleResult = await prompts.adaptFeaturedVlogCharacter({ script, characterSelection: 'shenhe' });
  const femaleTask = prompts.buildFeaturedVlogVideoTask({ script: femaleResult.script, characterSelection: 'shenhe', template, framePlan: frames.framePlan, motionPlan: [], noteTask: { id: 50 }, music: { audioUrl: 'https://example.com/music.mp3' } });
  const femalePlan = JSON.parse(femaleTask.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(femalePlan.character.id, '325994250221723');
  assert.ok(femaleTask.includes('<<<325994250221723>>>') && !femaleTask.includes('324641305202280'));
  assert.throws(() => omni.buildOmniTask({ script, characterSelection: 'shenhe' }), /适配/);
  const noPeople = clone(environment);
  noPeople.title = '田园慢时光';
  noPeople.shots.forEach(s => { s.mainAction = '草木随风轻动'; s.direction.action = '草木随风轻动'; });
  reply = request => {
    assert.ok(request.input.includes('不添加任何人物'));
    return { title: noPeople.title, shots: script.shots.filter(s=>s.startState.characters.length).map(s=>({ order:s.order, mainAction:'草木随风轻动', description:'观察环境变化', action:'草木随风轻动', timingActions:s.direction.timing.map(()=> '草木随风轻动') })) };
  };
  const emptyResult = await prompts.adaptFeaturedVlogCharacter({ script, characterSelection: 'none' });
  const emptyTask = prompts.buildFeaturedVlogVideoTask({ script: emptyResult.script, characterSelection: 'none', template, framePlan: frames.framePlan, motionPlan: [], noteTask: { id: 51 }, music: { audioUrl: 'https://example.com/music.mp3' } });
  const emptyPlan = JSON.parse(emptyTask.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(emptyPlan.characterSelection, 'none');
  assert.ok(!emptyPlan.character && !emptyTask.includes('<<<'));
  fs.writeFileSync('tmp/omni-v3-character-contract-plans.json', JSON.stringify([femalePlan, emptyPlan]));
  reply = () => script;
  await assert.rejects(() => prompts.adaptFeaturedVlogCharacter({ script, characterSelection: 'none' }), /不允许修改/);
  const changedTimeline = clone(female);
  changedTimeline.shots[0].transitionToNext = { ...changedTimeline.shots[0].transitionToNext, type: 'dissolve', duration: .25 };
  reply = () => changedTimeline;
  await assert.rejects(() => prompts.adaptFeaturedVlogCharacter({ script, characterSelection: 'shenhe' }), /不允许修改/);
  assert.equal(JSON.stringify(script), originalScript, 'production adaptation must not overwrite the confirmed script');
  console.log('Vlog characters: preset binding, environment-only adaptation, timeline locks and unchanged source script passed.');
  delete process.env.FEATURED_VLOG_OMNI_ENABLED;
  assert.throws(() => omni.buildOmniTask({ script }), /未启用/);
  console.log(`Omni v3: script, analysis selection, full-library batching, task contract and legacy gate passed. Task ${task.length} chars.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
