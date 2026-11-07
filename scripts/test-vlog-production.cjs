const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    { module,exports:module.exports,process,URL,crypto:webcrypto,TextEncoder,structuredClone, require:id=>id.startsWith('.') ? load(path.join(path.dirname(file),id+'.ts')) : id.startsWith('@/') ? load('src/'+id.slice(2)+'.ts') : require(id) });
  cache.set(file,module.exports);return module.exports;
}
const production=load('src/lib/vlogProduction.ts');
const adaptation=load('src/lib/vlogCharacterAdaptation.ts');
const omni=load('src/lib/featuredVlogOmni.ts');
const clone=v=>JSON.parse(JSON.stringify(v));
const state=people=>({location:'庭院',characters:people?[{id:'A',position:'石径',pose:'观察',view:'front'}]:[],props:[]});
const source={productionVersion:3,timingVersion:2,sceneVersion:1,genericCharacterVersion:1,characterSelection:'unassigned',title:'庭院周末',summary:'观察庭院与树林',perspective:'旁观',moodTags:['自然'],musicTags:['轻松'],noteTask:{topicTitle:'庭院'},characters:[{id:'A',appearance:'游客A',props:[]}],shots:[1,2,3].map(order=>({order,beat:'观察',role:'发现自然',description:'庭院景色',suggestedMaterial:'庭院',subjectPresence:order===2?'traveler':'environment',startState:state(order===2),endState:state(order===2),mainAction:order===2?'游客观察树林':'树叶摇动',characterChanges:[],continuityNote:'自然衔接',duration:7,transitionToNext:order===3?null:{type:'cut',duration:0,reason:'衔接',outgoingState:'树木',incomingState:'庭院'},direction:{focus:'自然',photography:{scale:'全景',height:'平视',angle:'侧面',composition:'偏左',depth:'前景树木'},camera:{type:'fixed',direction:'正面',speed:'静止',extent:'不移动'},action:'观察',timing:[{start:0,end:7,action:'观察'}],ending:'停留'}}))};
const context={template:{id:'t',version:1,referenceVideoId:1,referenceVideo:{id:1,version:1,name:'风格',videoUrl:'https://example.com/style.mp4'}},assets:[1,2,3].map(id=>({id,fileUrl:`https://example.com/${id}.jpg`,filePath:`${id}.jpg`,aiAnalysis:'庭院',tags:'自然'})),music:[{id:1,name:'音乐',tags:['自然'],durationSeconds:30,audioUrl:'https://example.com/music.mp3'}]};
async function main(){
  process.env.FEATURED_VLOG_OMNI_ENABLED='true';
  let persisted, saves=0, counts={}, failMusic=false, failSave=false, pendingMusic=false, lost=false;
  const key=production.productionScope(1,'test',2,'t');
  const options={key,taskId:7,source,choice:'linchuan',resolution:'720p',context, persist:async d=>{persisted=clone(d);},save:async()=>{saves++;if(failSave)throw Error('network');},request:async(action,body,pending,resume)=>{
    if (!resume) counts[action]=(counts[action]||0)+1;
    if(action==='adapt_featured_vlog_character') {
      const direct=adaptation.directVlogBinding(body.featuredVlogScript,options.choice);
      if(direct)return direct;
      const patch={shots:[{order:2,mainAction:'树木随风摇动',description:'观察庭院树木',action:'树木摇动',timingActions:['树木摇动']}]};
      return adaptation.applyVlogCharacterPatch(body.featuredVlogScript,options.choice,patch);
    }
    if(action==='plan_featured_vlog_frames')return{overallDirection:'自然',framePlan:context.assets.map((a,i)=>({order:i+1,frameSource:'asset',assetUrl:a.fileUrl,framePrompt:'保留庭院',selectionReason:'匹配',role:'自然',description:'庭院'}))};
    if(action==='select_featured_vlog_music'){
      if(failMusic)throw new production.VlogStageFailedError('选曲失败');
      if(pendingMusic){await pending('music-uuid');pendingMusic=false;throw Error('网络中断');}
      if(lost)throw new production.VlogTaskLostError('任务状态已丢失');
      return{music:context.music[0]};
    }
    const content=omni.buildOmniTask({script:body.featuredVlogScript,characterSelection:options.choice,resolution:options.resolution,template:context.template,framePlan:body.framePlan,music:body.selectedMusic,noteTask:{id:7},overallDirection:'自然'});
    return{videoPrompt:{content,title:'任务'},openclawTask:{content,title:'任务'}};
  }};
  const run=async extra=>production.runVlogProduction({...options,existing:persisted,...extra});
  let draft=await run();assert.equal(draft.stages.save.status,'completed');assert.equal(saves,1);
  const first=clone(counts);options.resolution='1080p';await run();
  for(const name of ['adapt_featured_vlog_character','plan_featured_vlog_frames','select_featured_vlog_music']) assert.equal(counts[name],first[name]);
  assert.equal(counts.build_featured_vlog_task,2);
  options.choice='shenhe';await run();assert.equal(counts.plan_featured_vlog_frames,first.plan_featured_vlog_frames);assert.equal(counts.select_featured_vlog_music,first.select_featured_vlog_music);
  failSave=true;options.resolution='720p';await assert.rejects(()=>run(),/保存失败/);const beforeSave=clone(counts);failSave=false;await run({context:undefined,getContext:async()=>{throw Error('must not query resources during save retry')},options:{saveOnly:true}});assert.deepEqual(counts,beforeSave);
  failMusic=true;await assert.rejects(()=>run({options:{force:'music'}}),/选曲失败/);const beforeRetry=counts.plan_featured_vlog_frames;failMusic=false;await run();assert.equal(counts.plan_featured_vlog_frames,beforeRetry);
  options.choice='none';draft=await run();assert.equal(draft.waitingConfirmation,true);const beforeConfirm=clone(counts);
  await run({options:{confirm:persisted.stages.adapt.fingerprint}});assert.equal(counts.adapt_featured_vlog_character,beforeConfirm.adapt_featured_vlog_character);assert.equal(persisted.lastSuccess.script.characters.length,0);assert.equal(source.characters.length,1);
  pendingMusic=true;await assert.rejects(()=>run({options:{force:'music'}}),/网络中断/);assert.equal(persisted.stages.music.uuid,'music-uuid');const submits=counts.select_featured_vlog_music;
  persisted=clone(persisted);await run();assert.equal(counts.select_featured_vlog_music,submits,'resume UUID without resubmitting');
  pendingMusic=true;await assert.rejects(()=>run({options:{force:'music'}}));lost=true;await assert.rejects(()=>run(),/丢失/);const beforeLost=clone(counts);await assert.rejects(()=>run(),/丢失/);assert.deepEqual(counts,beforeLost);lost=false;await run({options:{retryLost:true}});
  const oldFrames=counts.plan_featured_vlog_frames;context.assets[0].aiAnalysis='更新分析';await run();assert.equal(counts.plan_featured_vlog_frames,oldFrames+1);
  const renewed=counts.plan_featured_vlog_frames;context.assets[0].fileUrl+='?signature=renewed';await run();assert.equal(counts.plan_featured_vlog_frames,renewed);assert.ok(persisted.lastSuccess.result.videoPrompt.content.includes('signature=renewed'));
  assert.notEqual(key,production.productionScope(2,'test',2,'t'));assert.notEqual(key,production.productionScope(1,'prod',2,'t'));
  assert.throws(()=>adaptation.applyVlogCharacterPatch(source,'shenhe',{shots:[{order:2,duration:9}]}),/不允许/);
  assert.throws(()=>adaptation.applyVlogCharacterPatch(source,'shenhe',{shots:[{order:2,mainAction:'喝茶'}]}),/核心动作/);
  assert.equal(adaptation.directVlogBinding(source,'shenhe').calls,0);
  assert.equal(adaptation.directVlogBinding({...source,genericCharacterVersion:undefined},'shenhe'),null);
  const beforeStore=clone(counts);await assert.rejects(()=>run({persist:async()=>{throw Error('quota')}}),/保存到本地/);assert.deepEqual(counts,beforeStore);
  console.log('Production: parameter reuse, actor binding, confirmation, save retry, stage retry, UUID recovery, lost-task stop, asset invalidation and URL refresh passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
