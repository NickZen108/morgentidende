import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const replacements={
 './claim-review':`export async function reviewWithEvidence(env,step,input){const t=globalThis.chiefTest;if(t.pauseReview)return {paused:true,reason:'Awaiting evidence'};const review=await t.model(env,'chief','test boundary',{...input,direct_submission:true},null,true);await t.db(env,'v3_attempts','PATCH',{review,draft:input.article,stage:review.serious_error?'rejected':'approved'});return {paused:false,review};}`,
 './chat-control':'export const linkChatOrder=async()=>{}',
 './budget':'export const withCostContext=(_,fn)=>fn();export const assignOrderCosts=async()=>{}',
 'cloudflare:workers':'export class WorkflowEntrypoint {constructor(ctx,env){this.env=env;}}',
 './models':'export const model=(...args)=>globalThis.chiefTest.model(...args);',
 './db':'export const db=(...args)=>globalThis.chiefTest.db(...args);export const rpc=(...args)=>globalThis.chiefTest.rpc(...args);',
 './media':'export const selectMedia=(...args)=>globalThis.chiefTest.selectMedia(...args);'
};
await fs.mkdir('reports',{recursive:true});
await build({entryPoints:['src/v3/chief.ts'],outfile:'reports/chief-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'chief-boundaries',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|\.\/(models|db|media|budget|chat-control|claim-review))$/},args=>args.importer.endsWith('chief.ts')?{path:args.path,namespace:'test'}:undefined);
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
for(const payload of [{tick:'old',directOrderId:'old'},{tick:'old',commission:'exact-order-v1'},{tick:'old',commission:'chatops-batch-v1'}]){
 await assert.rejects(new Chief({},env).run({payload},runStep),/unsupported_chief_input/);
}
console.log('PASS chief: retired chat entrypoints rejected before production work');
let creates=0,gets=0;
await new Chief({},{PRODUCTION:{async create(){creates++;throw new Error('already exists');},async get(){gets++;return {async status(){return {status:'running'};}};}}}).startProduction('existing-order');
assert.equal(creates,1);assert.equal(gets,1);
console.log('PASS chief: production creation retry recognizes existing workflow');

delete globalThis.chiefTest;

