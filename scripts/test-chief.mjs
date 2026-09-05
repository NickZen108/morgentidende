import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const replacements={
 './chat-control':'export const linkChatOrder=async()=>{}',
 './budget':'export const withCostContext=(_,fn)=>fn();export const assignOrderCosts=async()=>{}',
 'cloudflare:workers':'export class WorkflowEntrypoint {constructor(ctx,env){this.env=env;}}',
 './models':'export const model=(...args)=>globalThis.chiefTest.model(...args);',
 './db':'export const db=(...args)=>globalThis.chiefTest.db(...args);export const rpc=(...args)=>globalThis.chiefTest.rpc(...args);',
 './media':'export const selectMedia=(...args)=>globalThis.chiefTest.selectMedia(...args);'
};
await fs.mkdir('reports',{recursive:true});
await build({entryPoints:['src/v3/chief.ts'],outfile:'reports/chief-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'chief-boundaries',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|\.\/(models|db|media|budget|chat-control))$/},args=>args.importer.endsWith('chief.ts')?{path:args.path,namespace:'test'}:undefined);
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:replacements[args.path],loader:'js'}));
}}]});
const {Chief}=await import('../reports/chief-test.mjs');
const state={settings:{enabled:false,max_orders_per_day:12,editorial_policy:'Test policy'},breaking:[]};
const runStep={async do(name,a,b){const fn=typeof a==='function'?a:b;return fn();}};
let modelCalls=0,productionCalls=[];
globalThis.chiefTest={
 async rpc(env,name){assert.equal(name,'v3_editorial_state');return state;},
 async db(){throw new Error('db should not be called while disabled');},
 async model(){modelCalls++;throw new Error('model should not be called while disabled');},
 async selectMedia(){throw new Error('media should not be called while disabled');}
};
const disabled=await new Chief({},{PRODUCTION:{}}).run({payload:{tick:'tick-test'}},runStep);
assert.deepEqual(disabled,{status:'disabled'});assert.equal(modelCalls,0);
console.log('PASS chief: normal automation remains disabled');
const order={instruction:'Find og skriv dagens vigtigste aktuelle udlandsnyhed',category:'udland',mode:'discovery',angle:'Nøgtern nyhedsartikel',why_now:'Aktuel nu',words:400,primary_source_required:false,opposing_view_required:true};
globalThis.chiefTest={
 async rpc(env,name){assert.equal(name,'v3_editorial_state');return state;},
 async db(env,path,method='GET',body){
  if(method==='GET'){assert.match(path,/dedupe_key=eq\.commission%3Afirst-article-v1/);return [];}
  assert.equal(path,'v3_orders');assert.equal(method,'POST');assert.equal(body.dedupe_key,'commission:first-article-v1');assert.deepEqual(body.original_order,order);return [{id:'order-live-1',status:'pending',original_order:order}];
 },
 async model(env,role,instructions,input){modelCalls++;assert.equal(role,'chief');assert.match(instructions,/første v3-publicering/);assert.match(instructions,/Returnér ikke order:null/);assert.deepEqual(input,state);return {order,reason:'commission'};},
 async selectMedia(){throw new Error('media should not be called');}
};
productionCalls=[];
const env={PRODUCTION:{async create(input){productionCalls.push(input);return {};}}};
const steps=[];
const commissioned=await new Chief({},env).run({payload:{tick:'commission-first-article-v1',commission:'first-article-v1'}},{async do(name,a,b){steps.push(name);const fn=typeof a==='function'?a:b;return fn();}});
assert.equal(commissioned.status,'started');assert.equal(commissioned.order_id,'order-live-1');assert.equal(commissioned.automation_enabled,false);assert.deepEqual(commissioned.order,order);
assert.deepEqual(productionCalls,[{id:'order-live-1',params:{orderId:'order-live-1'}}]);
assert.deepEqual(steps,['state','commission-decide','commission-save-order','commission-start-production']);
console.log('PASS chief: one-shot commissioning starts exactly one Production instance while automation is disabled');
let batchIndex=0;productionCalls=[];
globalThis.chiefTest={
 async rpc(env,name){assert.equal(name,'v3_editorial_state');return state;},
 async db(env,path,method='GET',body){
  if(method==='GET')return [];
  if(path==='v3_orders'&&method==='POST'){batchIndex++;return [{id:`batch-${batchIndex}`,status:'pending',original_order:body.original_order}];}
  throw new Error(`unexpected db ${method} ${path}`);
 },
 async model(env,role,instructions){assert.equal(role,'chief');assert.match(instructions,/energi/);return {order:{...order,instruction:`Energi artikel ${batchIndex+1}`},reason:'batch'};},
 async selectMedia(){throw new Error('media should not be called');}
};
const batchEnv={PRODUCTION:{async create(input){productionCalls.push(input);return {};}}};
const batch=await new Chief({},batchEnv).run({payload:{tick:'chatops-test',commission:'chatops-batch-v1',count:2,topic:'energi'}},runStep);
assert.equal(batch.status,'started');assert.equal(batch.count,2);assert.equal(batch.topic,'energi');assert.equal(batch.automation_enabled,false);assert.equal(productionCalls.length,2);
console.log('PASS chief: chat batch starts requested number of distinct production orders while automation is disabled');
const directArticle={headline:'Direkte artikel til Morgentidende',deck:'Dette er en færdig artikel, som går direkte gennem Media og Chefredaktøren.',paragraphs:['Første afsnit i den direkte artikel.','Andet afsnit i den direkte artikel.'],category:'indland',source_urls:[],image_query:'Danmark Christiansborg'};
const directSubmission={kind:'direct_article',article:directArticle,submitted_at:'2026-09-05T13:00:00.000Z'};
let publishedArgs=null,mediaCalls=0;
globalThis.chiefTest={
 async rpc(env,name,body){
  if(name==='v3_editorial_state')return state;
  if(name==='v3_publish'){publishedArgs=body;return 'article-direct-1';}
  throw new Error(`unexpected rpc ${name}`);
 },
 async db(env,path,method='GET',body){
  if(method==='GET'&&path.startsWith('v3_orders?id=eq.direct-order'))return [{id:'direct-order',status:'pending',original_order:directSubmission}];
  if(method==='PATCH')return [];
  if(method==='POST'&&path.startsWith('v3_attempts'))return [];
  throw new Error(`unexpected db ${method} ${path}`);
 },
 async model(env,role,instructions,input,schema,webSearch){assert.equal(role,'chief');assert.equal(webSearch,true);assert.equal(input.direct_submission,true);return {matches_order:true,headline_correct:true,serious_error:false,reason:'ok',slot:'news-1'};},
 async selectMedia(env,article){mediaCalls++;assert.equal(article.headline,directArticle.headline);return {id:'media-1',url:'https://example.com/image.jpg',alt:'alt',credit:'credit',generated:false};}
};
const direct=await new Chief({},{PRODUCTION:{}}).run({payload:{tick:'chatops-direct-test',directOrderId:'direct-order'}},runStep);
assert.equal(direct.status,'published');assert.equal(direct.article_id,'article-direct-1');assert.equal(mediaCalls,1);assert.deepEqual(publishedArgs,{p_order:'direct-order',p_attempt:1,p_slot:'news-1'});
console.log('PASS chief: direct article bypasses Desk/Journalist, gets Media, Chief review, and publication');

let exactSaved=null;productionCalls=[];
globalThis.chiefTest={
 async rpc(env,name){assert.equal(name,'v3_editorial_state');return state;},
 async db(env,path,method='GET',body){if(method==='GET')return [];exactSaved=body.original_order;return [{id:'exact-order',status:'pending',original_order:body.original_order}];},
 async model(){throw new Error('Exact order must not be rewritten by a model');},
 async selectMedia(){throw new Error('Unexpected media');}
};
const exact=await new Chief({},{PRODUCTION:{async create(input){productionCalls.push(input);}}}).run({payload:{tick:'chatops:exact-test',commission:'exact-order-v1',exactOrder:order}},runStep);
assert.deepEqual(exactSaved,order);assert.deepEqual(exact.order,order);assert.equal(productionCalls.length,1);
console.log('PASS chief: exact instruction reaches production unchanged, without extra model calls');
let creates=0,gets=0;
await new Chief({},{PRODUCTION:{async create(){creates++;throw new Error('already exists');},async get(){gets++;return {async status(){return {status:'running'};}};}}}).startProduction('existing-order');
assert.equal(creates,1);assert.equal(gets,1);
console.log('PASS chief: production creation retry recognizes existing workflow');

delete globalThis.chiefTest;
