import {db,rpc,boundedText} from './v3/db';
import {ChatCommand,DirectSubmission,Order} from './v3/contracts';
import type {ChiefInput} from './v3/chief';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
export class SignalReceiver extends WorkerEntrypoint<Env>{
 async fetch(request:Request){
  const signal=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),headlines:z.array(z.string().max(400)).max(5),sources:z.array(z.object({publisher:z.string(),url:z.string().url()})).max(12),publisher_count:z.number(),first_seen:z.number(),last_seen:z.number()}).parse(JSON.parse(await boundedText(request,16000)));
  await db(this.env,'v3_signals?on_conflict=id','POST',{id:signal.id,payload:signal});
  return Response.json({ok:true});
 }
}
export {Production} from './v3/production';
export {Chief} from './v3/chief';
async function authorized(request:Request,env:Env){
 if(!env.ADMIN_TOKEN)return false;
 const encoder=new TextEncoder();
 const a=await crypto.subtle.digest('SHA-256',encoder.encode(request.headers.get('Authorization')??''));
 const b=await crypto.subtle.digest('SHA-256',encoder.encode(`Bearer ${env.ADMIN_TOKEN}`));
 return timingSafeEqual(new Uint8Array(a),new Uint8Array(b));
}
async function verifiedChatCommand(request:Request){
 const commit=(request.headers.get('X-Morgentidende-Commit')??'').trim();
 if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('chatops_bad_commit');
 const received=ChatCommand.parse(JSON.parse(await boundedText(request,200_000)));
 const canonicalResponse=await fetch(`https://raw.githubusercontent.com/NickZen108/morgentidende/${commit}/.chatops/command.json`,{headers:{'User-Agent':'Morgentidende-v3-ChatOps/1.0','Accept':'application/json'},signal:AbortSignal.timeout(15000)});
 if(!canonicalResponse.ok)throw new Error('chatops_commit_unverified');
 const canonical=ChatCommand.parse(JSON.parse(await boundedText(canonicalResponse,200_000)));
 if(JSON.stringify(canonical)!==JSON.stringify(received))throw new Error('chatops_payload_mismatch');
 return received;
}
async function startChiefOnce(env:Env,id:string,params:ChiefInput){
 try{await env.CHIEF.create({id,params});return {id,started:true};}
 catch(error){
  try{const instance=await env.CHIEF.get(id);const status=await instance.status();return {id,started:false,status};}
  catch{throw error;}
 }
}
async function dispatchChatCommand(request:Request,env:Env){
 const command=await verifiedChatCommand(request);
 if(command.type==='commission'){
  const workflowId=`chatops-commission-${command.id}`;
  const workflow=await startChiefOnce(env,workflowId,{tick:`chatops:${command.id}`,commission:'chatops-batch-v1',count:command.count,topic:command.topic});
  return Response.json({ok:true,type:command.type,count:command.count,topic:command.topic??null,workflow},{status:202});
 }
 if(command.type==='publish_order'){
  const [row]=await db<{id:string;status:string;original_order:unknown}[]>(env,`v3_orders?id=eq.${encodeURIComponent(command.order_id)}&limit=1`);
  if(!row)throw new Error('chatops_direct_order_not_found');
  DirectSubmission.parse(row.original_order);
  const workflowId=`chatops-direct-${command.id}`;
  const workflow=await startChiefOnce(env,workflowId,{tick:`chatops:${command.id}`,directOrderId:row.id});
  return Response.json({ok:true,type:command.type,order_id:row.id,workflow},{status:202});
 }
 const key=`chatops:article:${command.id}`;
 let [row]=await db<{id:string;status:string}[]>(env,`v3_orders?dedupe_key=eq.${encodeURIComponent(key)}&limit=1`);
 if(!row){
  [row]=await db<{id:string;status:string}[]>(env,'v3_orders','POST',{dedupe_key:key,original_order:{kind:'direct_article',article:command.article,submitted_at:new Date().toISOString()}});
  if(!row)throw new Error('chatops_direct_order_insert_failed');
 }
 const workflowId=`chatops-direct-${command.id}`;
 const workflow=await startChiefOnce(env,workflowId,{tick:`chatops:${command.id}`,directOrderId:row.id});
 return Response.json({ok:true,type:command.type,order_id:row.id,headline:command.article.headline,workflow},{status:202});
}
export default {
 async scheduled(event,env){await env.CHIEF.create({id:`tick-${Math.floor(event.scheduledTime/900000)}`,params:{tick:`tick-${Math.floor(event.scheduledTime/900000)}`}});},
 async fetch(request,env):Promise<Response>{
  const url=new URL(request.url);
  try{
   if(url.pathname==='/api/health')return Response.json({ok:true,version:3});
   if(url.pathname==='/api/chatops/dispatch'&&request.method==='POST')return dispatchChatCommand(request,env);
   if(url.pathname.startsWith('/media/')){
    const object=await env.MEDIA_BUCKET.get(url.pathname.slice(7));
    return object?new Response(object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});
   }
   if(url.pathname==='/api/frontpage'&&request.method==='GET')return Response.json(await db(env,'v3_frontpage?select=slot,article:v3_articles(id,slug,headline,deck,category,published_at,media:v3_media(url,alt,credit,generated))'),{headers:{'Cache-Control':'public,max-age=30'}});
   if(url.pathname.startsWith('/api/article/')&&request.method==='GET'){
    const slug=url.pathname.slice('/api/article/'.length);
    if(!/^[a-f0-9-]{36}$/.test(slug))return new Response('Not found',{status:404});
    const rows=await db<unknown[]>(env,`v3_articles?slug=eq.${slug}&select=slug,headline,deck,paragraphs,category,sources,published_at,media:v3_media(url,original_url,alt,credit,license_documentation,generated)`);
    return rows[0]?Response.json(rows[0]):new Response('Not found',{status:404});
   }
   if(url.pathname.startsWith('/api/admin/')){
    if(!await authorized(request,env))return new Response('Unauthorized',{status:401});
    if(url.pathname==='/api/admin/state')return Response.json(await rpc(env,'v3_editorial_state'));
    if(url.pathname==='/api/admin/diagnostic/models'&&request.method==='POST'){
     const id=`model-probe-${crypto.randomUUID()}`;
     await env.PRODUCTION.create({id,params:{diagnostic:'models-v1'}});
     return Response.json({id,status_url:`/api/admin/diagnostic/models/${id}`},{status:202});
    }
    const diagnostic=url.pathname.match(/^\/api\/admin\/diagnostic\/models\/(model-probe-[a-f0-9-]{36})$/);
    if(diagnostic&&request.method==='GET'){
     const instance=await env.PRODUCTION.get(diagnostic[1]);
     return Response.json(await instance.status());
    }
    if(url.pathname==='/api/admin/order'&&request.method==='POST'){
     const order=Order.parse(JSON.parse(await boundedText(request,16000)));
     const [row]=await db<{id:string}[]>(env,'v3_orders','POST',{dedupe_key:crypto.randomUUID(),original_order:order});
     await env.PRODUCTION.create({id:row.id,params:{orderId:row.id}});return Response.json({id:row.id},{status:202});
    }
   }
   if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
   if(url.pathname.startsWith('/artikel/'))return env.ASSETS.fetch(new Request(new URL('/index.html',url),request));
   return env.ASSETS.fetch(request);
  }catch(error){console.error(JSON.stringify({event:'request_failed',message:error instanceof Error?error.message:'unknown'}));return Response.json({error:'request_failed'},{status:500});}
 }
} satisfies ExportedHandler<Env>;
