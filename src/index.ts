import {db,rpc,boundedText} from './v3/db';
import {Order} from './v3/contracts';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
export class SignalReceiver extends WorkerEntrypoint<Env>{
 async fetch(request:Request){
  const signal=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),headlines:z.array(z.string().max(400)).max(5),sources:z.array(z.object({publisher:z.string(),url:z.string().url()})).max(12),publisher_count:z.number(),first_seen:z.number(),last_seen:z.number()}).parse(JSON.parse(await boundedText(request,16000)));
  await db(this.env,'v3_signals?on_conflict=id','POST',{id:signal.id,payload:signal});
  // The scheduled chief reads the collected batch; a busy feed must not
  // cause one paid editorial model call for every incoming headline.
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
export default {
 async scheduled(event,env){await env.CHIEF.create({id:`tick-${Math.floor(event.scheduledTime/900000)}`,params:{tick:`tick-${Math.floor(event.scheduledTime/900000)}`}});},
 async fetch(request,env):Promise<Response>{
  const url=new URL(request.url);
  try{
   if(url.pathname==='/api/health')return Response.json({ok:true,version:3});
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
