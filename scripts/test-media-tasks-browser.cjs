// Uses mocked business/media APIs; never calls a model, uploads a file or changes real user data.
// Start the built app locally, then set MEDIA_TEST_URL and optionally PLAYWRIGHT_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.MEDIA_TEST_URL || 'http://127.0.0.1:3116';
const stamp = new Date().toISOString();
const user = { uid:42,name:'浏览器验收',role:'user',channel:'xhs',signature:'mock-test-signature-not-a-real-token',signatureNearExpired:Date.now()+86400000 };
const cdn = 'https://media-test.invalid';
const image = {type:'image',name:'配图.png',url:cdn+'/final.png',cosPath:'/xhs/generated/42/image.png',sizeBytes:100};
const video = {type:'video',name:'成片.webm',url:cdn+'/final.webm',cosPath:'/xhs/generated/42/video.webm',sizeBytes:200};
const tasks = [
  {id:'image-done',accountId:1,noteTaskId:11,title:'周末咖啡配图',kind:'image',status:'completed',stage:'completed',progress:100,artifacts:[image],createdAt:stamp,updatedAt:stamp},
  {id:'video-done',accountId:1,noteTaskId:12,title:'咖啡店成片',kind:'video',status:'completed',stage:'completed',progress:100,artifacts:[video],createdAt:stamp,updatedAt:stamp},
  {id:'failed-upload',accountId:1,noteTaskId:12,title:'等待补传的视频',kind:'video',status:'failed',stage:'uploading',progress:90,artifacts:[],error:'上传失败，请重试',createdAt:stamp,updatedAt:stamp}
];
const account = {id:1,name:'验收咖啡店',accountParam:'test-account',accountType:'food',stage:'初期',personaBase:'咖啡店',city:'杭州',referenceAccounts:'',assets:[{id:101,filePath:'/xhs/image/a.png',fileUrl:cdn+'/source.png',fileType:'image',sourceType:'真实素材',tags:'咖啡',suitableTypes:'',coverReady:true,used:false,riskNotes:''},{id:102,filePath:'/xhs/video/a.mp4',fileUrl:cdn+'/source.mp4',fileType:'video',sourceType:'真实素材',tags:'咖啡',suitableTypes:'',coverReady:true,used:false,riskNotes:''}],weeklyPlans:[{id:10,weekStart:'2026-11-15',theme:'咖啡日常',frequency:2,noteTasks:[{id:11,type:'image_text',topicTitle:'周末咖啡配图',bodyDraft:'周末到店喝咖啡',status:'待生成'},{id:12,type:'video_text',topicTitle:'咖啡店成片',status:'待生成'}]}]};

async function main(){
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(({user})=>{
      localStorage.setItem('xhs_token',user.signature);localStorage.setItem('xhs_user',JSON.stringify(user));
      // Reproduce browsers/HTTP origins without the secure-context randomUUID API.
      Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true});
    }, {user});
    const page=await context.newPage();
    // A tiny synthetic VP8 clip, verified playable when authored; no external media/network needed.
    const clip=fs.readFileSync(path.join(__dirname,'fixtures/media-preview.webm'));
    const errors=[]; const generated=[]; const retries=[]; const submissions=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      const json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:true,data,message:'',code:''})});
      if(url.hostname==='media-test.invalid') return route.fulfill({status:200,contentType:/\.(mp4|webm)$/.test(url.pathname)?'video/webm':'image/png',body:/\.(mp4|webm)$/.test(url.pathname)?clip:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
      if(url.pathname.startsWith('/client/')){
        if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
        if(url.pathname.endsWith('/login/v1/autoLogin'))return json(user);
        if(url.pathname.endsWith('/account/v1/list'))return json({accounts:[{id:1,name:account.name}]});
        if(url.pathname.endsWith('/account/v1/detail'))return json(account);
        if(url.pathname.endsWith('/media/v1/tasks')){
          const filtered=tasks.filter(t=>(!url.searchParams.get('kind')||t.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('status')||t.status===url.searchParams.get('status')));
          return json({items:filtered,total:filtered.length,page:1,pageSize:12});
        }
        if(url.pathname.endsWith('/media/v1/task'))return json(tasks.find(t=>t.id===url.searchParams.get('id')));
        if(url.pathname.endsWith('/media/v1/retry')){
          const body=req.postDataJSON();retries.push(body);
          const child={...tasks.find(t=>t.id===body.id),id:'upload-retry',status:'uploading',stage:'uploading',retryOf:body.id,error:''};
          tasks.unshift(child);return json(child);
        }
        if(url.pathname.endsWith('/media/v1/generate')){
          const body=req.postDataJSON();submissions.push(body);
          if(submissions.length===1)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:false,message:'模拟提交失败，请重试',code:'TEST_FAILURE'})});
          generated.push(body);
          const job={id:'created-'+generated.length,...body,title:'新媒体任务',status:'queued',stage:'queued',progress:0,artifacts:[],createdAt:stamp,updatedAt:stamp};
          tasks.unshift(job);return json(job);
        }
        return json({items:[],templates:[]});
      }
      if(url.origin===base && !url.pathname.startsWith('/api/'))return route.continue();
      if(url.origin===base)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accounts:[],templates:[],items:[]})});
      return route.abort();
    });
    await page.goto(base);
    await page.getByRole('button',{name:'生成任务',exact:true}).first().click();
    await page.getByRole('heading',{name:'周末咖啡配图',exact:true}).waitFor();
    await page.getByRole('button',{name:'预览周末咖啡配图',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'任务详情'});
    await dialog.getByRole('img',{name:'配图.png'}).waitFor();
    assert.equal(await dialog.getByRole('img',{name:'配图.png'}).getAttribute('src'),image.url);
    await page.getByRole('button',{name:'关闭任务详情'}).click();
    await page.getByRole('button',{name:'预览咖啡店成片',exact:true}).click();
    assert.equal(await dialog.locator('video').getAttribute('src'),video.url);
    assert.equal(await dialog.locator('video').getAttribute('controls'),'');
    const playback=await dialog.locator('video').evaluate(async el=>{el.muted=true;await el.play();await new Promise(resolve=>setTimeout(resolve,200));el.pause();return {time:el.currentTime,width:el.videoWidth};});
    assert.ok(playback.time>0 && playback.width===320,'CDN media could not play');
    await page.getByRole('button',{name:'关闭任务详情'}).click();
    await page.getByRole('button',{name:'重试上传',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'确认',exact:true}).click();
    await dialog.getByText('上传到云端 · 任务 upload-retry').waitFor();
    assert.deepEqual(retries,[{id:'failed-upload'}]);
    await page.getByRole('button',{name:'关闭任务详情'}).click();
    await page.getByRole('combobox',{name:'筛选类型'}).selectOption('image');
    await page.getByText('共 1 个任务',{exact:true}).waitFor();
    await page.getByRole('button',{name:'图片方案',exact:true}).first().click();
    await page.getByRole('button',{name:/^AI 辅助图/}).click();
    await page.getByRole('button',{name:'生成图片并保存',exact:true}).first().click();
    await page.getByRole('alertdialog').getByText('模拟提交失败，请重试',{exact:true}).waitFor();
    await page.getByRole('alertdialog').getByRole('button',{name:'确认',exact:true}).click();
    await page.getByRole('button',{name:'生成图片并保存',exact:true}).first().click();
    await page.getByRole('dialog',{name:'任务详情'}).getByText('排队中 · 任务 created-1').waitFor();
    assert.equal(submissions[0].requestId,submissions[1].requestId,'Retrying submission must reuse the original idempotency key');
    assert.match(generated[0].requestId,/^\d+-[a-z0-9]+$/);
    assert.equal(generated[0].kind,'image');assert.equal(generated[0].accountId,1);assert.equal(generated[0].noteTaskId,11);assert.ok(generated[0].requestId);
    assert.ok(!('account' in generated[0].options));assert.ok(!('openclawImagePaths' in generated[0].options));
    await page.getByRole('button',{name:'关闭任务详情'}).click();
    await page.getByRole('button',{name:'视频方案',exact:true}).first().click();
    await page.locator('button').filter({has:page.locator('video[src="'+cdn+'/source.mp4"]')}).click();
    await page.getByRole('button',{name:'生成视频并保存',exact:true}).click();
    await page.getByRole('dialog',{name:'任务详情'}).getByText('排队中 · 任务 created-2').waitFor();
    assert.equal(generated[1].kind,'video');assert.equal(generated[1].noteTaskId,12);assert.deepEqual(generated[1].assetIds,[102]);
    assert.notEqual(generated[0].requestId,generated[1].requestId);
    const running=tasks.find(t=>t.id==='created-2');running.status='running';running.stage='generating';running.progress=50;
    await page.getByRole('dialog',{name:'任务详情'}).getByText('媒体制作中 · 任务 created-2').waitFor();
    running.status='completed';running.stage='completed';running.progress=100;running.artifacts=[video];
    await page.getByRole('dialog',{name:'任务详情'}).locator('video').waitFor();
    await page.getByRole('button',{name:'关闭任务详情'}).click();
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile layout overflows');
    if(process.env.MEDIA_TEST_SCREENSHOT)await page.screenshot({path:process.env.MEDIA_TEST_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Media tasks browser checks passed: missing randomUUID, submission retry with the same key, CDN image/video playback, upload retry, filters, image/video submission, mobile layout.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
