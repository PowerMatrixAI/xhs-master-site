const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let response;
let retryableFailures = 0;
const requests = [];
function loadTs(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    process,
    URL,
    require: (id) => id in overrides ? overrides[id] : require(id)
  }, { filename: file });
  return module.exports;
}

const library = loadTs('src/lib/storyCharacters.ts', {
  '@/lib/backendApi': { getBackendApiBaseUrl: () => 'https://backend.example.com/client' },
  '@/lib/xhs-signature': { buildBackendSignedHeaders: () => ({}) },
  '@/lib/backendAiClient': {}
});
const video = loadTs('src/lib/videoPrompts.ts', {
  '@/lib/storyCharacters': library,
  '@/lib/backendAiServerClient': { completeWithBackendAi: async (input) => {
    requests.push(input);
    if (retryableFailures > 0) {
      retryableFailures -= 1;
      return { ok: false, error: 'responses stream error: {"code":"server_error"}' };
    }
    return { ok: true, text: JSON.stringify(response), model: 'mock' };
  } }
});

async function run() {
  const template = library.normalizeStoryCharacterTemplate({
    templateId: 'custom_story',
    name: '自定义故事',
    outline: '一个可以由平台管理员维护的故事模板。',
    requiredScenes: ['第 2 个场景需要对白。']
  });
  assert.ok(template);
  assert.equal(template.id, 'custom_story');
  assert.deepEqual(template.requiredScenes, ['第 2 个场景需要对白。']);

  const cat = library.normalizeStoryCharacter({
    id: 101,
    templateId: 'cat_moon_post',
    name: '橘白猫邮差',
    description: '橘白短毛，绿色邮差挎包。',
    imageUrl: 'https://cdn.example.com/story-characters/cat.png'
  });
  assert.ok(cat);
  assert.equal(cat.id, '101');
  assert.equal(library.characterDownloadUrl(cat), cat.imageUrl);
  assert.throws(() => library.characterDownloadUrl({ ...cat, imageUrl: 'http://localhost:3000/cat.png' }));

  const noteTask = Object.fromEntries(['topicTitle', 'contentType', 'contentGoal', 'targetUser', 'painPoint', 'coreView', 'requiredMaterials', 'recommendedAssets', 'coverCopyDirection', 'commentHook', 'expectedGoal', 'writingStyleName'].map((key) => [key, '测试']));
  const story = { title: '月光邮局', summary: '找信', emotionalArc: '发现', noteTask, character: cat, shots: [1, 2, 3].map((order) => ({ order, beat: '发现', role: '故事', description: '画面', suggestedMaterial: '庭院' })) };
  response = story;
  const generated = await video.generateVideoStoryDraft({ account: {}, noteTask: {}, character: cat, sourceType: 'template', sourceContent: '月光邮局', availableWritingStyles: ['测试'] });
  assert.equal(generated.character.id, cat.id);
  assert.ok(requests.at(-1).input.includes(cat.description));

  const backgroundUrl = 'https://example.com/very-long-background-name.png?signature=must-not-be-echoed';
  response = {
    overallDirection: '月光连贯画面',
    shots: [1,2,3].map((order) => ({
      order,
      role: '故事',
      description: '庭院',
      frameSource: order === 1 ? 'asset' : 'generate',
      assetKey: order === 1 ? 'A01' : '',
      framePrompt: '角色在庭院'
    }))
  };
  retryableFailures = 1;
  const frameRequestCount = requests.length;
  const plannedFrames = await video.planStoryVideoFrames({
    account: { accountType: '文旅', strategy: { markdown: 'FULL_STRATEGY_MUST_NOT_REACH_FRAME_PROMPT' } },
    noteTask: { topicTitle: '月光邮局', contentGoal: '讲故事' },
    story: { ...generated, noteTask: { ...generated.noteTask, writingStyleReference: 'WRITING_STYLE_REFERENCE_MUST_NOT_REACH_FRAME_PROMPT' } },
    assets: [{ id: 9, filePath: 'scenes/garden.png', fileUrl: backgroundUrl, fileType: 'image/png', tags: '庭院', suitableTypes: '故事背景' }]
  });
  assert.equal(requests.length, frameRequestCount + 2);
  assert.equal(plannedFrames.framePlan[0].assetUrl, backgroundUrl);
  assert.equal(plannedFrames.framePlan[1].assetUrl, '');
  const frameRequest = requests.at(-1).input;
  assert.ok(frameRequest.includes('"assetKey": "A01"'));
  assert.ok(frameRequest.includes('"fileName": "garden.png"'));
  assert.ok(frameRequest.includes('严格保留下方 3 个镜头'));
  assert.equal((frameRequest.match(/"framePrompt": ""/g) || []).length, 3);
  assert.ok(!frameRequest.includes(backgroundUrl));
  assert.ok(!frameRequest.includes('FULL_STRATEGY_MUST_NOT_REACH_FRAME_PROMPT'));
  assert.equal(frameRequest.knowledgeSnapshotId, undefined);

  const frames = plannedFrames.framePlan;
  const motions = [1,2,3].map((order) => ({ order, mainVideoPrompt: '缓慢向前', endingTransitionPrompt: '轻轻停下', narrationText: `第${order}段月光旁白` }));
  response = { shots: motions };
  const motionStory = { ...generated, noteTask: { ...generated.noteTask, writingStyleReference: 'WRITING_STYLE_REFERENCE_MUST_NOT_REACH_MOTION_PROMPT' } };
  const plannedMotions = await video.planStoryVideoMotion({ story: motionStory, framePlan: frames });
  assert.equal(JSON.stringify(plannedMotions), JSON.stringify(motions));
  assert.ok(requests.at(-1).input.includes('narrationText'));
  assert.ok(requests.at(-1).input.includes('按顺序直接拼接全部 narrationText'));
  assert.ok(requests.at(-1).input.includes('模板规定的关键对白必须出现在对应 narrationText'));
  assert.ok(requests.at(-1).input.includes('"月光邮局"'));
  assert.ok(!requests.at(-1).input.includes('WRITING_STYLE_REFERENCE_MUST_NOT_REACH_MOTION_PROMPT'));
  const input = { account: { name: '测试', accountParam: 'test' }, noteTask: { id: 42, topicTitle: '故事' }, story: generated, framePlan: frames, motionPlan: plannedMotions };
  const attachmentTask = video.buildStoryVideoTask(input);
  assert.ok(attachmentTask.includes('cat > "$TASK_ROOT/plan.json"'));
  assert.ok(attachmentTask.includes('story-video prepare'));
  assert.ok(attachmentTask.includes('story-video render'));
  assert.ok(attachmentTask.includes('--size 1080x1440'));
  assert.ok(attachmentTask.includes('3:4 构图'));
  assert.ok(attachmentTask.includes('story-video reset'));
  assert.ok(attachmentTask.includes('角色图已提供公网 HTTPS 地址'));
  assert.ok(!attachmentTask.includes('prepare_frame()'));
  assert.ok(!attachmentTask.includes('render_video()'));
  assert.ok(!attachmentTask.includes('ffprobe'));
  assert.ok(attachmentTask.includes(cat.imageUrl));
  const jsonText = attachmentTask.match(/<<'JSON'\n([^\n]+)\nJSON/)?.[1];
  assert.ok(jsonText);
  const taskPlan = JSON.parse(jsonText);
  assert.equal(taskPlan.version, 1);
  assert.equal(taskPlan.character.imageUrl, cat.imageUrl);
  assert.equal(taskPlan.noteTask.id, 42);
  assert.deepEqual(taskPlan.shots.map((shot) => shot.narrationText), motions.map((motion) => motion.narrationText));
  assert.ok(taskPlan.shots.every((shot) => shot.narrationTargetDuration === 4.5));
  const plain = video.buildStoryVideoTask({ ...input, story: { ...generated, character: null } });
  assert.equal(JSON.parse(plain.match(/<<'JSON'\n([^\n]+)\nJSON/)[1]).character, null);
  console.log('PASS: server story-character contract, HTTPS delivery, and compact story-video plan');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
