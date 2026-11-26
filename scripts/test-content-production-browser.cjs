// Mocked business and AI endpoints; no real records or paid generation.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const fixtureModule = new Module(path.resolve('scripts/test-vlog-omni.cjs'), module);
fixtureModule.filename = path.resolve('scripts/test-vlog-omni.cjs');
fixtureModule.paths = module.paths;
fixtureModule._compile(fs.readFileSync(fixtureModule.filename,'utf8').split('async function main()')[0] + '\nmodule.exports = photographyScript(script);', fixtureModule.filename);
const script = fixtureModule.exports;
delete script.noteTask;
script.characterSelection = 'unassigned';
script.genericCharacterVersion = 1;
const user = {uid:42,name:'测试',role:'user',channel:'xhs',signature:'mock',signatureNearExpired:Date.now()+86400000};
const account = {id:1,name:'山居民宿',accountParam:'mountain',accountType:'homestay',city:'杭州',assets:[],weeklyPlans:[],referenceAccounts:'',strategy:null};
const template = {id:'template-1',name:'山林的一天',version:1,status:'enabled',outline:'观察山林',beats:[{name:'抵达',shotDuty:'抵达',required:true}],musicTags:['自然']};
const base=process.env.MEDIA_TEST_URL || 'http://localhost:3000';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext();
  await context.addInitScript(user=>{localStorage.setItem('xhs_token',user.signature);localStorage.setItem('xhs_user',JSON.stringify(user));},{...user});
  const page=await context.newPage();
  const works=[], requests=[], errors=[], jobs=[];
  const results = new Map();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const req=route.request(), url=new URL(req.url());
    const json=data=>route.fulfill({json:{status:true,data}});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    if(url.pathname.startsWith('/client/')){
      if(url.pathname.endsWith('/autoLogin'))return json(user);
      if(url.pathname.endsWith('/account/v1/list'))return json({accounts:[account]});
      if(url.pathname.endsWith('/account/v1/detail'))return json(account);
      if(url.pathname.endsWith('/featuredVlog/v1/template/list'))return json({templates:[template]});
      if(url.pathname.endsWith('/featuredVlog/v1/tag/catalog'))return json({dimensions:[],unassignedTags:[]});
      if(url.pathname.endsWith('/production/v1/list'))return json({items:works});
      if(url.pathname.endsWith('/production/v1/detail'))return json(works.find(w=>w.id===Number(url.searchParams.get('id'))));
      if(url.pathname.endsWith('/production/v1/save')){
        const body=req.postDataJSON();requests.push(body);
        let work=works.find(w=>w.id===body.id);
        if(work){assert.equal(body.expectedRevision,work.revision);Object.assign(work,body,{revision:work.revision+1});}
        else {work={...body,id:works.length+1,revision:1};works.push(work);}
        return json(work);
      }
      if(url.pathname.endsWith('/media/v1/generate')){
        const body=req.postDataJSON(); jobs.push(body);
        assert.equal(body.source,'production'); assert.equal(body.productionId,1);
        assert.ok(!body.noteTaskId); assert.equal(body.options.plan.version,3);
        return json({id:'job-1',accountId:1,productionId:1,source:'production',status:'queued',kind:'video',title:'作品视频'});
      }
      if(url.pathname.endsWith('/media/v1/tasks'))return json({items:[],total:0,page:1,pageSize:12});
      if(url.pathname.endsWith('/media/v1/task'))return json({id:'job-1',accountId:1,productionId:1,source:'production',status:'queued',kind:'video',title:'作品视频'});
      if(url.pathname.includes('saveWeeklyPlan')||url.pathname.includes('saveNoteTask'))throw Error('Independent production must not create a plan/note');
      return json({hasReferences:false,items:[],templates:[]});
    }
    if(url.pathname==='/api/productions/vlog'){
      if(req.method()==='POST'){
        const body=req.postDataJSON();requests.push(body);
        assert.ok(!body.account.weeklyPlans);
        assert.ok(!body.account.referenceAccounts);
        assert.ok(!body.noteTask);
        const music={id:1,name:'自然',tags:['自然'],audioUrl:'https://fixture.invalid/music.mp3'};
        const adapted=structuredClone(script); adapted.characterSelection='linchuan';
        const content='# 测试制作任务\n```json\n'+JSON.stringify({version:3,kind:'featured_vlog',shots:script.shots})+'\n```';
        const replies={
          script:{script},
          featured_vlog_context:{template,assets:[],music:[music]},
          adapt_featured_vlog_character:{script:adapted,changes:[],requiresConfirmation:false},
          plan_featured_vlog_frames:{overallDirection:'自然',framePlan:script.shots.map(s=>({order:s.order,frameSource:'generate',framePrompt:'山林'}))},
          select_featured_vlog_music:{music},
          build_featured_vlog_task:{videoPrompt:{content,title:'任务'},openclawTask:{content,title:'任务'}}
        };
        assert.ok(body.action in replies);
        const uuid='mock-'+requests.length; results.set(uuid,replies[body.action]);
        return route.fulfill({json:{async:true,uuid,status:'pending'}});
      }
      return route.fulfill({json:{status:'completed',result:results.get(url.searchParams.get('uuid'))}});
    }
    if(url.origin===base && (url.pathname==='/'||url.pathname.startsWith('/_next/')||/\.(png|svg|jpg|ico)$/.test(url.pathname)))return route.continue();
    if(url.origin===base)return route.fulfill({json:{}});
    return route.abort();
  });
  await page.goto(base);
  await page.getByRole('button',{name:'生成脚本',exact:true}).waitFor();
  await page.getByRole('button',{name:'生成脚本',exact:true}).click();
  await page.getByRole('button',{name:'确认脚本',exact:true}).waitFor();
  assert.equal(works.length,1);
  assert.ok(!works[0].script.noteTask);
  await page.getByRole('button',{name:'确认脚本',exact:true}).click();
  await page.getByRole('heading',{name:'第二步：生成完整视频任务',exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'使用模板参考视频'}).isChecked(),false);
  await page.reload();
  await page.getByRole('heading',{name:'第二步：生成完整视频任务',exact:true}).waitFor();
  await page.getByRole('button',{name:'生成视频并保存',exact:true}).click();
  await page.getByRole('dialog',{name:'任务详情'}).waitFor();
  assert.equal(jobs.length,1);
  assert.ok(works[0].result && works[0].plan);
  await page.getByRole('button',{name:'关闭任务详情',exact:true}).click();
  await page.getByRole('button',{name:'视频方案 Hot',exact:true}).first().click();
  await page.getByRole('heading',{name:'第二步：生成完整视频任务',exact:true}).waitFor();
  await page.getByRole('button',{name:'新建作品',exact:true}).click();
  await page.getByRole('button',{name:'生成脚本',exact:true}).click();
  await page.getByRole('button',{name:'确认脚本',exact:true}).waitFor();
  assert.equal(works.length,2);
  await page.getByRole('button',{name:'Agent运营',exact:true}).first().click();
  await page.getByRole('button',{name:'图片方案',exact:true}).nth(1).click();
  await page.getByRole('heading',{name:'先确定一篇笔记，再决定图片怎么来',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'行业学习',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Standalone production browser passed: no weekly plan/research, script/confirmation, server restore, multiple works, default settings and navigation.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
