const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let response;
const requests = [];
function loadTs(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    exports: module.exports, module, process, URL,
    require: (id) => id in overrides ? overrides[id] : require(id)
  }, { filename: file });
  return module.exports;
}
const library = loadTs('src/lib/storyCharacters.ts');
const video = loadTs('src/lib/videoPrompts.ts', {
  '@/lib/storyCharacters': library,
  '@/lib/backendAiServerClient': { completeWithBackendAi: async (input) => {
    requests.push(input);
    return { ok: true, text: JSON.stringify(response), model: 'mock' };
  } }
});

async function run() {
  assert.equal(library.getStoryCharacters('cat_moon_post').length, 2);
  assert.equal(library.getStoryCharacters('niu_lai_dream').length, 2);
  for (const template of ['dog_reverse_map', 'fox_borrowed_moon', 'rabbit_last_train']) {
    assert.equal(library.getStoryCharacters(template).length, 2);
    assert.throws(() => library.resolveStoryCharacter(template));
  }
  assert.throws(() => library.resolveStoryCharacter('cat_moon_post'));
  assert.throws(() => library.resolveStoryCharacter('cat_moon_post', 'niu-brown'));
  const cat = library.resolveStoryCharacter('cat_moon_post', 'cat-orange');
  assert.equal(library.characterDownloadUrl(cat, ''), '');
  assert.throws(() => library.characterDownloadUrl(cat, 'http://localhost:3000'));
  assert.throws(() => library.characterDownloadUrl(cat, 'https://192.168.1.2'));
  assert.equal(library.characterDownloadUrl(cat, 'https://site.example.com'), 'https://site.example.com/story-characters/cat-orange.png');
  for (const template of ['cat_moon_post', 'dog_reverse_map', 'niu_lai_dream', 'fox_borrowed_moon', 'rabbit_last_train']) {
    for (const item of library.getStoryCharacters(template)) {
      const data = fs.readFileSync(path.join('public', item.imagePath));
      assert.equal(data.subarray(1, 4).toString(), 'PNG');
      assert.ok(data.length > 10000);
    }
  }

  const noteTask = Object.fromEntries(['topicTitle', 'contentType', 'contentGoal', 'targetUser', 'painPoint', 'coreView', 'requiredMaterials', 'recommendedAssets', 'coverCopyDirection', 'commentHook', 'expectedGoal', 'writingStyleName'].map((key) => [key, '测试']));
  const story = { title: '月光邮局', summary: '找信', emotionalArc: '发现', noteTask, shots: [1,2,3].map((order) => ({ order, beat: '发现', role: '故事', description: '画面', suggestedMaterial: '庭院' })) };
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
  const plannedFrames = await video.planStoryVideoFrames({
    account: { accountType: '文旅', strategy: { markdown: 'FULL_STRATEGY_MUST_NOT_REACH_FRAME_PROMPT' } },
    noteTask: { topicTitle: '月光邮局', contentGoal: '讲故事' },
    story: generated,
    assets: [{ id: 9, filePath: 'scenes/garden.png', fileUrl: backgroundUrl, fileType: 'image/png', tags: '庭院', suitableTypes: '故事背景' }]
  });
  assert.equal(plannedFrames.framePlan[0].assetUrl, backgroundUrl);
  assert.equal(plannedFrames.framePlan[1].assetUrl, '');
  const frameRequest = requests.at(-1).input;
  assert.ok(frameRequest.includes('"assetKey": "A01"'));
  assert.ok(frameRequest.includes('"fileName": "garden.png"'));
  assert.ok(frameRequest.includes('严格保留下方 3 个镜头'));
  assert.equal((frameRequest.match(/"framePrompt": ""/g) || []).length, 3);
  assert.ok(!frameRequest.includes(backgroundUrl));
  assert.ok(!frameRequest.includes('FULL_STRATEGY_MUST_NOT_REACH_FRAME_PROMPT'));

  const frames = plannedFrames.framePlan;
  const motions = [1,2,3].map((order) => ({ order, mainVideoPrompt: '缓慢向前', endingTransitionPrompt: '轻轻停下', narrationText: `第${order}段月光旁白` }));
  response = { shots: motions };
  const plannedMotions = await video.planStoryVideoMotion({ story: generated, framePlan: frames });
  assert.equal(JSON.stringify(plannedMotions), JSON.stringify(motions));
  assert.ok(requests.at(-1).input.includes('narrationText'));
  assert.ok(requests.at(-1).input.includes('按顺序直接拼接全部 narrationText'));
  assert.ok(requests.at(-1).input.includes('模板规定的关键对白必须出现在对应 narrationText'));
  const input = { account: { name: '测试', accountParam: 'test' }, noteTask: { id: 42, topicTitle: '故事' }, story: generated, framePlan: frames, motionPlan: plannedMotions };
  delete process.env.STORY_CHARACTER_PUBLIC_BASE_URL;
  const attachmentTask = video.buildStoryVideoTask(input);
  assert.ok(attachmentTask.includes('cat > "$TASK_ROOT/plan.json"'));
  assert.ok(attachmentTask.includes('story-video prepare'));
  assert.ok(attachmentTask.includes('story-video render'));
  assert.ok(attachmentTask.includes('--size 1080x1440'));
  assert.ok(attachmentTask.includes('3:4 构图'));
  assert.ok(!attachmentTask.includes('9:16'));
  assert.ok(attachmentTask.includes('story-video reset'));
  assert.ok(attachmentTask.includes('character-reference.png'));
  assert.ok(!attachmentTask.includes('prepare_frame()'));
  assert.ok(!attachmentTask.includes('render_video()'));
  assert.ok(!attachmentTask.includes('ffprobe'));
  const jsonText = attachmentTask.match(/<<'JSON'\n([^\n]+)\nJSON/)?.[1];
  assert.ok(jsonText);
  const taskPlan = JSON.parse(jsonText);
  assert.equal(taskPlan.version, 1);
  assert.equal(taskPlan.noteTask.id, 42);
  assert.deepEqual(taskPlan.shots.map((shot) => shot.narrationText), motions.map((motion) => motion.narrationText));
  const second = video.buildStoryVideoTask({ ...input, story: { ...generated, character: library.resolveStoryCharacter('cat_moon_post', 'cat-gray') } });
  assert.notEqual(JSON.parse(second.match(/<<'JSON'\n([^\n]+)\nJSON/)[1]).character.id, taskPlan.character.id);
  process.env.STORY_CHARACTER_PUBLIC_BASE_URL = 'https://site.example.com';
  const publicTask = video.buildStoryVideoTask(input);
  assert.ok(publicTask.includes('https://site.example.com/story-characters/cat-orange.png'));
  assert.ok(!publicTask.includes('由用户随任务附带'));
  delete process.env.STORY_CHARACTER_PUBLIC_BASE_URL;
  const plain = video.buildStoryVideoTask({ ...input, story: { ...story, character: null } });
  assert.equal(JSON.parse(plain.match(/<<'JSON'\n([^\n]+)\nJSON/)[1]).character, null);
  console.log('PASS: compact story-video plan, staged CLI commands, character delivery, and narration contract');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
