const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function load(file, overrides={}) {
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,require:id=>overrides[id]||require(id)});
 return mod.exports;
}
const cover=load('src/lib/coverProduction.ts');
const input={asset:{id:7,imageUrl:'https://example.com/room.jpg',name:'客房',analysis:'窗边',tags:'民宿'},text:'周末住进山里',requiredText:'秦岭',requirements:''};
const variants=cover.coverStyles.map(s=>({variantId:s.id,title:'秦岭的周末',subtitle:'住进山林',design:s.guidance}));
const validated=cover.validateCoverVariants(variants,input);
assert.equal(validated.length,3);
assert.throws(()=>cover.validateCoverVariants([variants[0],variants[0],variants[1]],input));
assert.throws(()=>cover.validateCoverVariants(variants.map(v=>({...v,title:'山林'})),input));
const edited=variants.map((v,i)=>i===0?{...v,title:'秦岭，今晚住这里'}:v);
const plan={version:1,kind:'cover_image',input,variants:edited};
const result=cover.buildCoverExecution(plan,['bold','editorial','poster']);
assert.equal(result.items.length,3);
assert.ok(result.items.every(i=>i.imageUrl===input.asset.imageUrl));
assert.ok(result.items[0].editPrompt.includes('秦岭，今晚住这里'));
assert.ok(!result.items[0].editPrompt.includes('秦岭的周末'));
assert.equal(cover.buildCoverExecution(plan,['poster']).items.length,1);
assert.throws(()=>cover.buildCoverExecution(plan,['unknown']));
assert.throws(()=>cover.coverInputSchema.parse({...input,asset:{...input.asset,imageUrl:'http://localhost/file'}}));
const old={input,variants,confirmedVariantIds:['bold','editorial','poster']};
assert.deepEqual(Array.from(cover.coverConfirmations(old,input,edited,[])),['editorial','poster']);
assert.deepEqual(Array.from(cover.coverConfirmations(old,{...input,text:'新主题'},edited,[])),[]);
let captured;
const llm=load('src/lib/coverProductionLlm.ts',{
 './coverProduction':cover,
 './backendAiServerClient':{completeWithBackendAi:async request=>{captured=request;return {ok:true,text:JSON.stringify({variants}),model:'mock'};}}
});
(async()=>{
 const planned=await llm.planCovers(input,{name:'民宿'}, {});
 assert.equal(planned.variants.length,3);
 assert.ok(!captured.input.includes('weeklyPlan'));
 console.log('Cover planning passed: exact confirmed text, three styles, same source, required facts, selective invalidation and single-version execution.');
})().catch(e=>{console.error(e);process.exitCode=1;});
(async()=>{
 const calls=[];
 const api=load('src/lib/contentProductions.ts',{'./api':{
  ApiResponseFormatError: class extends Error {},
  authRequest:async(path,opts)=>{calls.push({path,body:opts?.body}); return {status:true,data:{...opts?.body,id:9,revision:2,accountId:1,kind:'image'}};}
 }});
 const saved=await api.saveCoverProduction(1,{input,variants,confirmed:true,confirmedVariantIds:['bold','editorial','poster']},undefined,'create-id',result);
 assert.equal(calls[0].body.kind,'image');
 assert.equal(calls[0].body.settings.imageSourceMode,'remote_images');
 assert.equal(calls[0].body.settings.imageCount,'3');
 assert.equal(calls[0].body.settings.selectedAssets[0].id,7);
 assert.equal(calls[0].body.result.openclawTask.content,result.prompt);
 assert.equal(saved.input.text,input.text);
 assert.equal(saved.variants.length,3);
 assert.equal(saved.result.imagePrompt.content,JSON.stringify(result.items));
 await api.saveCoverProduction(1,{input,variants,confirmed:false},saved,'unused');
 assert.equal(calls[1].body.expectedRevision,2);
 assert.equal(calls[1].body.requestId,undefined);
 assert.equal(calls[1].body.confirmed,false);
 console.log('Cover image API adapter passed: settings/result, revision and round-trip.');
})().catch(e=>{console.error(e);process.exitCode=1;});
