const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,overrides={}) {const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,structuredClone,require:id=>overrides[id]||require(id)});return mod.exports;}
const cover=load('src/lib/coverProduction.ts');
const batch=load('src/lib/coverBatch.ts',{'./coverProduction':cover});
const input={asset:{id:7,imageUrl:'https://example.com/a.png',name:'room',analysis:'room',tags:''},text:'周末',requiredText:'',requirements:''};
const variants=cover.coverStyles.map(s=>({variantId:s.id,title:'周末',subtitle:'',design:s.guidance}));
let id=0;const uuid=()=>String(++id);
(async()=>{
 const b=batch.createCoverBatch(input,variants,['bold','editorial','poster'],uuid);
 const calls=[],jobs={};let revision=1;let lost=true;let durable;
 const io={checkpoint:async value=>{durable=structuredClone(value);},prepare:async item=>({accountId:1,productionId:1,productionRevision:revision++,kind:'image',mode:'remote_images',assetIds:[7],prompt:batch.buildSingleCoverExecution(input,variants,item.variantId).prompt,options:{imageCount:'1'}}),
 submit:async(payload,key)=>{calls.push(key);jobs[key]={id:'job-'+key};if(lost){lost=false;throw Error('lost response');}return jobs[key];},find:async key=>jobs[key]||null};
 await assert.rejects(batch.submitCoverBatch(b,io),/lost response/);
 assert.equal(calls.length,1);assert.equal(durable.items[0].status,'prepared');
 const restored=structuredClone(durable);await batch.submitCoverBatch(restored,io);
 assert.equal(calls.length,3);assert.equal(new Set(calls).size,3);assert.ok(restored.items.every(i=>i.taskId));
 await batch.submitCoverBatch(restored,io);assert.equal(calls.length,3);
 const pending=batch.createCoverBatch(input,variants,['editorial'],uuid);
 let firstBody;let attempts=0;
 const retryIo={...io,submit:async(body,key)=>{attempts++;if(attempts===1){firstBody=JSON.stringify(body);throw Error('network');}assert.equal(JSON.stringify(body),firstBody);return {id:'found'};},find:async()=>null};
 await assert.rejects(batch.submitCoverBatch(pending,retryIo));await batch.submitCoverBatch(pending,retryIo);assert.equal(attempts,2);
 const conflict=batch.createCoverBatch(input,variants,['bold','poster'],uuid);let submissions=0;
 await assert.rejects(batch.submitCoverBatch(conflict,{...io,prepare:async()=>{throw Error('revision conflict');},submit:async()=>{submissions++;}}),/revision conflict/);assert.equal(submissions,0);
 const uncertain=batch.createCoverBatch(input,variants,['bold'],uuid);uncertain.items[0].status='prepared';
 await assert.rejects(batch.submitCoverBatch(uncertain,{...io,find:async()=>{throw Error('lookup offline');}}),/lookup offline/);
 assert.equal(batch.coverFingerprint(input,variants[0]),batch.coverFingerprint(input,{...variants[0]}));
 assert.notEqual(batch.coverFingerprint(input,variants[0]),batch.coverFingerprint(input,{...variants[0],design:'new'}));
 assert.notEqual(batch.coverFingerprint(input,variants[1]),batch.coverFingerprint({...input,asset:{...input.asset,id:8}},variants[1]));
 const execution=batch.buildSingleCoverExecution(input,variants,'editorial');const plan=JSON.parse(execution.prompt.match(/```json\n([\s\S]*?)\n```/)[1]);
 assert.equal(plan.variantId,'editorial');assert.equal(plan.maxRepairAttempts,2);assert.equal(execution.items.length,1);assert.ok(!execution.prompt.includes('等待用户重试，不自动再次付费'));
 console.log('Cover batches passed: sequential independent submissions, lost response recovery, identical request retry, conflict/lookup stop, per-version invalidation, v1 repair contract.');
})().catch(e=>{console.error(e);process.exitCode=1;});
