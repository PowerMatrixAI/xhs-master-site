// All business/AI/media responses are mocked; no external generation.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.MEDIA_TEST_URL||'http://localhost:3000';
const user={uid:42,name:'测试',role:'user',channel:'xhs',signature:'mock',signatureNearExpired:Date.now()+86400000};
const account={id:1,name:'民宿',accountParam:'stay',accountType:'homestay_hotel_camp',assets:[{id:7,fileUrl:'https://cover.invalid/room.png',filePath:'room.png',fileType:'image',tags:'客房',aiAnalysis:'房间及窗户'}],weeklyPlans:[],referenceAccounts:''};
const variants=['bold','editorial','poster'].map(variantId=>({variantId,title:'山林周末',subtitle:'秦岭',design:'按原图留白排版'}));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext();
  await context.addInitScript(user=>{localStorage.setItem('xhs_token',user.signature);localStorage.setItem('xhs_user',JSON.stringify(user));localStorage.setItem('xhs-active-page','productionImages');},user);
  const page=await context.newPage();
  const errors=[], submissions=[], works=[], retryCalls=[];
  let planning=0, rejectSubmit=true, job;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const req=route.request(),url=new URL(req.url());
   const json=data=>route.fulfill({json:{status:true,data}});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
   if(url.hostname==='cover.invalid')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
   if(url.pathname.startsWith('/client/')){
    if(url.pathname.endsWith('/autoLogin'))return json(user);
    if(url.pathname.endsWith('/account/v1/list'))return json({accounts:[account]});
    if(url.pathname.endsWith('/account/v1/detail'))return json(account);
    if(url.pathname.endsWith('/production/v1/list'))return json({items:works});
    if(url.pathname.endsWith('/production/v1/detail'))return json(works[0]);
    if(url.pathname.endsWith('/production/v1/save')){
     const body=req.postDataJSON();assert.equal(body.kind,'cover_image');assert.equal(body.title,body.input.text);assert.ok(!body.templateId);
     if(works.length){assert.equal(body.expectedRevision,works[0].revision);Object.assign(works[0],body,{revision:works[0].revision+1});}
     else works.push({...body,id:12,revision:1});
     return json(works[0]);
    }
    if(url.pathname.endsWith('/media/v1/generate')){
     const body=req.postDataJSON();submissions.push(body);
     assert.equal(body.mode,'cover_image');assert.equal(body.kind,'image');assert.ok(!body.noteTaskId);assert.equal(body.assetIds.length,1);
     if(rejectSubmit){rejectSubmit=false;return route.fulfill({json:{status:false,message:'模拟提交超时，请重试'}});}
     job={id:'cover-job',accountId:1,productionId:12,source:'production',kind:'image',mode:'cover_image',status:'partially_completed',title:body.options.title,items:body.options.items.map((i,n)=>({variantId:i.variantId,name:i.name,status:n===1?'failed':'completed',error:n===1?'模拟失败':undefined,artifacts:n===1?[]:[{variantId:i.variantId,type:'image',name:i.name,url:'https://cover.invalid/'+i.variantId+'.png',cosPath:i.variantId,sizeBytes:100}]}))};
     works[0].latestTaskId=job.id;return json(job);
    }
    if(url.pathname.endsWith('/media/v1/task'))return json(job);
    if(url.pathname.endsWith('/media/v1/retry')){
     const body=req.postDataJSON();retryCalls.push(body);assert.equal(body.variantId,'editorial');assert.ok(body.requestId);
     job.items[1].status='running';job.status='running';return json(job);
    }
    if(url.pathname.includes('saveWeeklyPlan')||url.pathname.includes('saveNoteTask'))throw Error('Unexpected note/weekly mutation');
    return json({items:[],templates:[]});
   }
   if(url.pathname==='/api/productions/cover'){
    if(req.method()==='POST'){planning++;assert.equal(req.postDataJSON().input.asset.id,7);return route.fulfill({json:{uuid:'plan-1',status:'pending'}});}
    return route.fulfill({json:{status:'completed',result:{variants}}});
   }
   if(url.origin===base&&(url.pathname==='/'||url.pathname.startsWith('/_next/')||/\.(png|svg|ico)$/.test(url.pathname)))return route.continue();
   if(url.origin===base)return route.fulfill({json:{}});
   return route.abort();
  });
  await page.goto(base);
  await page.getByRole('button',{name:'选择素材 7',exact:true}).click();
  await page.getByLabel('主题或原始文字').fill('周末去秦岭');
  await page.getByLabel('必须保留的信息',{exact:false}).fill('秦岭');
  await page.getByRole('button',{name:'生成三版方案',exact:true}).click();
  await page.getByRole('heading',{name:'确认三版文字与设计'}).waitFor();
  assert.equal(planning,1);
  await page.getByLabel('bold主标题',{exact:true}).fill('秦岭，住进山里');
  await page.getByRole('button',{name:'确认文字并生成三张封面',exact:true}).click();
  await page.getByRole('alert').getByText('模拟提交超时，请重试').waitFor();
  await page.getByRole('button',{name:'确认文字并生成三张封面',exact:true}).click();
  await page.getByRole('heading',{name:'封面制作结果'}).waitFor();
  assert.equal(submissions.length,2);
  assert.deepEqual(submissions[0],submissions[1]);
  assert.ok(submissions[0].options.items[0].editPrompt.includes('秦岭，住进山里'));
  assert.equal(submissions[0].options.items.length,3);
  await page.reload();
  await page.getByRole('heading',{name:'封面制作结果'}).waitFor();
  assert.equal(await page.getByLabel('bold主标题',{exact:true}).inputValue(),'秦岭，住进山里');
  await page.getByRole('button',{name:'重试此版本',exact:true}).click();
  await page.getByRole('button',{name:'重试此版本',exact:true}).waitFor({state:'detached'});
  assert.equal(retryCalls.length,1);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('Cover browser passed: single image, editable variants, stable submission retry, restore, partial success, per-item retry and mobile layout.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
