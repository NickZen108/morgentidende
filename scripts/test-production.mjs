import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const replacements={
 'cloudflare:workers':'export class WorkflowEntrypoint {constructor(ctx,env){this.env=env;}}',
 './models':'export const model=(...args)=>globalThis.productionTest.model(...args);',
 './media':'export const selectMedia=(...args)=>globalThis.productionTest.media(...args);',
 './db':'export const db=(...args)=>globalThis.productionTest.db(...args);export const rpc=(...args)=>globalThis.productionTest.rpc(...args);'
};
await fs.mkdir('reports',{recursive:true});
await build({entryPoints:['src/v3/production.ts'],outfile:'reports/production-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'workflow-boundaries',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|\.\/(models|media|db))$/},args=>args.importer.endsWith('production.ts')?{path:args.path,namespace:'test'}:undefined);
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:replacements[args.path],loader:'js'}));
}}]});
const {Production}=await import('../reports/production-test.mjs');
const original={instruction:'Write the original order',category:'viden'};
for(const scenario of ['publish','fresh-retry','drop','three-questions','fourth-question','provider-failure']){
 const calls=[],writes=[],steps=[];let desks=0,journalists=0,reviews=0,published=0;
 globalThis.productionTest={
  async db(env,path,method='GET',body){writes.push({path,method,body});if(method==='GET')return [{id:'order-test',status:'pending',original_order:original}];return [];},
  async rpc(env,name,body){if(name==='v3_publish'){published++;return 'article-test';}return {};},
  async media(){return {id:'media-test',url:'https://example.org/image.jpg',alt:'test',credit:'test'};},
  async model(env,role,instructions,input,schema){
   calls.push({role,input});assert.deepEqual(input.original_order,original);
   if(scenario==='provider-failure')throw new Error('provider unavailable');
   if(role==='desk'){
    desks++;if(scenario==='fresh-retry'||scenario==='drop')assert.equal(input.dossier,undefined,'fresh attempt leaked previous dossier');
    return {subject:`fresh-${desks}`,facts:['verified'],uncertainties:[],opposing_views:[],sources:[{url:`https://example.org/source-${desks}`} ]};
   }
   if(role==='journalist'){
    journalists++;
    if((scenario==='three-questions'&&journalists<=3)||scenario==='fourth-question')return {kind:'research',question:'Please confirm the date from the original source'};
    return {kind:'draft',article:{headline:'A verified test headline',deck:'A verified test deck',category:'viden',paragraphs:['One','Two'],source_urls:input.dossier.sources.map(x=>x.url),image_query:'science'}};
   }
   reviews++;const approved=scenario==='fresh-retry'?reviews===2:scenario!=='drop';
   return {matches_order:approved,headline_correct:approved,serious_error:!approved,reason:'test',slot:'viden-1'};
  }
 };
 const step={async do(name,fn){steps.push(name);return fn();}};
 const run=()=>new Production({},{}).run({payload:{orderId:'order-test'}},step);
 if(['fourth-question','provider-failure'].includes(scenario)){
  await assert.rejects(run);assert.equal(published,0);assert.ok(writes.some(x=>x.body?.status==='failed'));
 }else{
  await run();assert.equal(published,scenario==='drop'?0:1);
  if(scenario==='drop')assert.ok(writes.some(x=>x.body?.status==='dropped'));
 }
 if(scenario==='fresh-retry'||scenario==='drop'){assert.equal(desks,2);assert.equal(reviews,2);}
 if(scenario==='three-questions'||scenario==='fourth-question'){assert.equal(desks,4);assert.equal(journalists,4);}
 assert.equal(new Set(steps).size,steps.length,'workflow step names collide');
 console.log(`PASS production: ${scenario}`);
}
delete globalThis.productionTest;
const probes=[];
await new Production({},{AI:{async run(name,input,options){
 assert.equal(input.max_output_tokens,128);assert.equal(input.tools,undefined);
 assert.deepEqual(options,{gateway:{id:'default'}});probes.push(name);return {status:'completed',output_text:'OK'};
}}}).run({payload:{diagnostic:'models-v1'}},{async do(name,options,fn){assert.equal(options.retries.limit,0);return fn();}});
assert.deepEqual(probes,['openai/gpt-5.6-luna','openai/gpt-5.6-terra']);
console.log('PASS production: bounded model diagnostic');

