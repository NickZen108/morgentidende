import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const replacements={
 'cloudflare:workers':'export class WorkerEntrypoint {}',
 './v3/chief':'export class Chief {}',
 './v3/production':'export class Production {}',
 './v3/chat-auth':"export class ChatAuthError extends Error {};export async function verifyChatToken(token){if(token!=='test-signed')throw new ChatAuthError();}",
 './v3/direct-publish':'export async function publishDirect(env,command){globalThis.routeTest.direct.push(command);return {status:\'published\',order_id:\'b944f7e9-1c1d-442e-98bf-149863f35193\',headline:command.article.headline,slot:command.slot,article_url:\'https://paper.test/artikel/b944f7e9-1c1d-442e-98bf-149863f35193\'};}',
 './v3/db':'export const db=(...a)=>globalThis.routeTest.db(...a);export const rpc=(...a)=>globalThis.routeTest.rpc(...a);export const boundedText=(r)=>r.text();'
};
await fs.mkdir('reports',{recursive:true});
await build({entryPoints:['src/index.ts'],outfile:'reports/chat-route-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|\.\/v3\/(chief|production|chat-auth|direct-publish|db)|\.\/db)$/},args=>{
  const key=args.path==='./db'?'./v3/db':args.path;
  return {path:key,namespace:'test'};
 });
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:replacements[a.path],loader:'js'}));
}}]});
const {default:app}=await import('../reports/chat-route-test.mjs');
const orderId='b944f7e9-1c1d-442e-98bf-149863f35193';
const submission={kind:'direct_article',submitted_at:'2026-09-06',article:{headline:'A real submitted article',deck:'A sufficiently long deck',paragraphs:['First paragraph','Second paragraph'],category:'liv',source_urls:[],image_query:'A real photo'}};
const created=new Map(),receipts=new Set();let createAttempts=0;const links=[],direct=[];
globalThis.routeTest={direct,
 async rpc(env,name,args){
  if(name==='v3_chat_receipt'){if(receipts.has(args.p_id))return false;receipts.add(args.p_id);return true;}
  if(name==='v3_budget_state')return {limit_dkk:10,committed_dkk:0};
  throw new Error('unexpected RPC '+name);
 },
 async db(env,path,method='GET',body){
  if(path.startsWith('v3_chat_receipts')&&method==='PATCH')return [];
  if(path.startsWith('v3_chat_orders')&&method==='POST'){links.push(body);return [];}
  if(path.startsWith('v3_orders?id=eq.'))return [{id:orderId,status:'pending',original_order:submission}];
  throw new Error('unexpected database call '+path);
 }
};
const env={PUBLIC_ORIGIN:'https://paper.test',CHIEF:{
 async create({id,params}){createAttempts++;if(created.has(id))throw new Error('exists');created.set(id,params);},
 async get(id){if(!created.has(id))throw new Error('not found');return {async status(){return {status:'running'};}};}
}};
const originalFetch=globalThis.fetch;
async function send(command,signed=true){
 globalThis.fetch=async()=>Response.json(command);
 return app.fetch(new Request('https://paper.test/api/chatops/dispatch',{method:'POST',headers:{'Content-Type':'application/json','X-Morgentidende-Commit':'a'.repeat(40),...(signed?{Authorization:'Bearer test-signed'}:{})},body:JSON.stringify(command)}),env);
}
try{
 const first={id:'6feef265-c5ef-4b4e-b087-37b729ed8f19',type:'publish_order',order_id:orderId};
 assert.equal((await send(first,false)).status,401);assert.equal(createAttempts,0);
 const a=await (await send(first)).json();
 const b=await (await send({...first,id:'2263a5d5-c5ef-464e-b087-ababc2d22fc9'})).json();
 assert.equal(created.size,1);assert.equal(a.workflow.id,b.workflow.id);assert.equal(b.workflow.started,false);assert.equal(links.length,2);
 const before=createAttempts;const replay=await (await send(first)).json();assert.equal(replay.already_dispatched,true);assert.equal(createAttempts,before);
 console.log('PASS chat routes: unsigned denied, different commands share one article workflow, replay starts nothing');
 const original={instruction:'Keep this exact instruction and its angle.',category:'viden',mode:'specific',angle:'The specified angle',why_now:'A current event',words:400,primary_source_required:true,opposing_view_required:true};
 const exact=await (await send({id:'6dbfd87b-484c-4cdb-9b57-0b2d35aa21cd',type:'order',order:original})).json();
 assert.deepEqual(created.get(exact.workflow.id).exactOrder,original);
 console.log('PASS chat routes: exact order preserved through authenticated dispatch');
 const publish={id:'0bbef265-c5ef-4b4e-b087-37b729ed8f20',type:'publish_article',slot:'lead',article:{headline:'Direct article is deterministic',deck:'A sufficiently long direct deck',paragraphs:['First direct paragraph','Second direct paragraph'],category:'indland',source_urls:[],image_query:'tractor field'},hero:{url:'https://images.example.test/tractor.jpg',credit:'Example',alt:'Traktor på mark',rights_basis:'cc',license:'CC BY 4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',source_url:'https://example.test/photo'}};
 const published=await (await send(publish)).json();
 assert.equal(published.status,'published');assert.equal(published.slot,'lead');assert.equal(direct.length,1);assert.equal(createAttempts,before+1);assert.equal(direct[0].article.headline,publish.article.headline);
 console.log('PASS chat routes: publish_article goes directly to deterministic publisher and preserves requested slot');
}finally{globalThis.fetch=originalFetch;delete globalThis.routeTest;}
