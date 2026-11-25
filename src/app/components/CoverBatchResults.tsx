"use client";
import { useEffect, useState } from 'react';
import { coverStyles, type CoverInput, type CoverVariant, type CoverVariantId } from '@/lib/coverProduction';
import { coverFingerprint, type CoverBatch } from '@/lib/coverBatch';
import { activeMediaStatuses, getMediaTask, mediaStatusLabels, type MediaTask } from '@/lib/mediaTasks';
export function CoverBatchResults({batches,input,variants,onRetry,onTasks,disabled}:{batches:CoverBatch[];input?:CoverInput;variants:CoverVariant[];onRetry:(id:CoverVariantId)=>void;onTasks:(id:string)=>void;disabled:boolean}) {
 const [tasks,setTasks]=useState<Record<string,MediaTask>>({});
 const [error,setError]=useState('');
 const ids=Array.from(new Set(batches.flatMap(b=>b.items.flatMap(i=>i.taskId?[i.taskId]:[])))).join(',');
 useEffect(()=>{let live=true;let timer:ReturnType<typeof setTimeout>;
 const poll=async()=>{const results=await Promise.allSettled(ids.split(',').filter(Boolean).map(id=>getMediaTask(id)));if(!live)return;
 setTasks(old=>({...old,...Object.fromEntries(results.flatMap(r=>r.status==='fulfilled'?[[r.value.id,r.value]]:[]))}));
 setError(results.some(r=>r.status==='rejected')?'部分进度暂时无法查询，已保留原任务，请勿重复提交。':'');if(results.some(r=>r.status==='rejected'||(r.status==='fulfilled'&&(activeMediaStatuses.includes(r.value.status)||r.value.status==='unknown'))))timer=setTimeout(poll,5000);};void poll();return()=>{live=false;clearTimeout(timer);};},[ids]);
 return <section className="panel"><h3 className="section-title">三版制作结果</h3>{error&&<p role="alert" className="text-coral">{error}</p>}<div className="mt-4 grid gap-4 md:grid-cols-3">{coverStyles.map(style=>{
 const history=batches.flatMap(b=>b.items.filter(i=>i.variantId===style.id).map(i=>({batch:b,item:i}))).reverse();
 const entry=history[0];const task=entry?.item.taskId?tasks[entry.item.taskId]:undefined;
 const variant=variants.find(v=>v.variantId===style.id);
 const stale=!!entry&&(!input||!variant||entry.item.fingerprint!==coverFingerprint(input,variant));
 const render=(job?:MediaTask)=><>{job?.error&&<p className="text-sm text-coral">{job.error}</p>}{job?.artifacts?.filter(a=>a.type==='image').map(a=><a key={a.url} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={style.name+'成品'} className="w-full rounded object-contain"/><span>查看 / 下载原图</span></a>)}</>;
 return <div key={style.id} className="space-y-3 rounded border border-ink/10 p-3"><h4 className="font-semibold">{style.name}</h4><p>{!entry?'尚未提交':task?mediaStatusLabels[task.status]||task.status:entry.item.status==='planned'?'等待提交':'查询原任务中'}</p>{stale&&<p className="text-amber-700">以下为旧版本，当前输入已变化。</p>}{render(task)}
 {entry?.item.taskId&&<button className="secondary-button" onClick={()=>onTasks(entry.item.taskId!)}>查看任务</button>}
 {task?.status==='failed'&&<><p className="text-xs text-ink/60">重新制作将开启新的付费制作周期，最多再修复两次。</p><button disabled={disabled} className="secondary-button" onClick={()=>onRetry(style.id)}>重新制作此版本</button></>}
 {history.length>1&&<details><summary>历史版本（{history.length-1}）</summary>{history.slice(1).map(e=><div key={e.batch.id} className="mt-3 border-t pt-2"><p>{e.batch.createdAt}</p>{render(e.item.taskId?tasks[e.item.taskId]:undefined)}{e.item.taskId&&<button className="secondary-button" onClick={()=>onTasks(e.item.taskId!)}>查看历史任务</button>}</div>)}</details>}
 </div>;
 })}</div></section>;
}
