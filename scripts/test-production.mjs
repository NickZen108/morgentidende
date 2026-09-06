import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const replacements={
 './claim-review':`export async function reviewWithEvidence(env,step,input){const t=globalThis.productionTest;if(t.pauseReview)return {paused:true,reason:'Awaiting evidence'};const review=await t.model(env,'chief','test boundary',input);await t.db(env,'v3_attempts','PATCH',{review,draft:input.article,stage:review.serious_error?'rejected':'approved'});return {paused:false,review};}`,
 'cloudflare:workers':'export class WorkflowEntrypoint {constructor(ctx,env){this.env=env;}}',
 './budget':`export const withCostContext=(context,fn)=>fn();export const budgetedAI=(env,...args)=>env.AI.run(...args);`,
 './models':`export const model=(...args)=>globalThis.productionTest.model(...args);
export const modelResponseText=(result)=>result.output_text??result.output?.flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text??'').join('\\n')??'';`,
 './media':'export const selectMedia=(...args)=>globalThis.productionTest.media(...args);',
 './db':'export const db=(...args)=>globalThis.productionTest.db(...args);export const rpc=(...args)=>globalThis.productionTest.rpc(...args);'
};
await fs.mkdir('reports',{recursive:true});
await build({entryPoints:['src/v3/production.ts'],outfile:'reports/production-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'workflow-boundaries',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|\.\/(models|media|db|budget|claim-review))$/},args=>args.importer.endsWith('production.ts')?{path:args.path,namespace:'test'}:undefined);
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:replacements[args.path],loader:'js'}));
}}]});
const {Production}=await import('../reports/production-test.mjs');
const original={instruction:'Write the original order',category:'viden'};
for(const scenario of ['publish','fresh-retry','drop','three-questions','fourth-question','provider-failure','budget-failure','paused-review']){
 const calls=[],writes=[],steps=[],configs=[];let desks=0,journalists=0,reviews=0,published=0;
 globalThis.productionTest={
  pauseReview:scenario==='paused-review',
  async db(env,path,method='GET',body){writes.push({path,method,body});if(method==='GET')return [{id:'order-test',status:'pending',original_order:original}];return [];},
  async rpc(env,name,body){if(name==='v3_publish'){published++;return 'article-test';}return {};},
  async media(env,article,job,context){assert.deepEqual(context.original_order,original);assert.ok(context.dossier);return {id:'media-test',url:'https://example.org/image.jpg',alt:'test',credit:'test'};},
  async model(env,role,instructions,input,schema){
   calls.push({role,input});assert.deepEqual(input.original_order,original);
   if(scenario==='budget-failure')throw new Error('daily_budget_exhausted');
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
 const step={async do(name,configOrFn,maybeFn){steps.push(name);const fn=maybeFn??configOrFn;if(maybeFn)configs.push({name,config:configOrFn});return fn();}};
 const run=()=>new Production({},{}).run({payload:{orderId:'order-test'}},step);
 if(scenario==='paused-review'){const outcome=await run();assert.equal(outcome.status,'paused');assert.equal(published,0);assert.ok(!writes.some(x=>x.body?.status==='dropped'));}else if(scenario==='budget-failure'){const outcome=await run();assert.equal(outcome.status,'paused');assert.equal(published,0);assert.ok(writes.some(x=>x.body?.status==='paused'));}else if(['fourth-question','provider-failure'].includes(scenario)){
  await assert.rejects(run);assert.equal(published,0);assert.ok(writes.some(x=>x.body?.status==='failed'));
 }else{
  await run();assert.equal(published,scenario==='drop'?0:1);
  if(scenario==='drop')assert.ok(writes.some(x=>x.body?.status==='dropped'));
 }
 if(scenario==='budget-failure')assert.ok(writes.some(x=>x.body?.error_code==='daily_budget_exhausted'));
 if(scenario==='fresh-retry'||scenario==='drop'){assert.equal(desks,2);assert.equal(reviews,2);}
 if(scenario==='three-questions'||scenario==='fourth-question'){assert.equal(desks,4);assert.equal(journalists,4);}
 for(const entry of configs.filter(x=>/-(desk|journalist-|followup-|review)$/.test(x.name)||/-journalist-/.test(x.name)||/-followup-/.test(x.name))){assert.equal(entry.config.retries.limit,1);assert.equal(entry.config.timeout,'2 minutes');}
 for(const entry of configs.filter(x=>/-media$/.test(x.name))){assert.equal(entry.config.retries.limit,1);assert.equal(entry.config.timeout,'3 minutes');}
 assert.equal(new Set(steps).size,steps.length,'workflow step names collide');
 console.log(`PASS production: ${scenario}`);
}
delete globalThis.productionTest;
const probes=[];
await new Production({},{AI:{async run(name,input,options){
 assert.equal(input.max_output_tokens,128);assert.equal(input.tools,undefined);
 assert.deepEqual(options,{gateway:{id:'default'}});probes.push(name);return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]};
}}}).run({payload:{diagnostic:'models-v1'}},{async do(name,options,fn){assert.equal(options.retries.limit,0);return fn();}});
assert.deepEqual(probes,['openai/gpt-5.6-luna','openai/gpt-5.6-terra']);
console.log('PASS production: bounded model diagnostic');
let deskProbeCalls=0;
globalThis.productionTest={
 async model(env,role,instructions,input,schema,search){
  deskProbeCalls++;assert.equal(role,'desk');assert.equal(search,true);assert.match(instructions,/web search/i);assert.ok(input.question);
  return {fact:'Cloudflare Workflows can run durable multi-step applications.',source_url:'https://developers.cloudflare.com/workflows/'};
 }
};
const deskProbe=await new Production({},{}).run({payload:{diagnostic:'desk-web-v1'}},{async do(name,options,fn){assert.equal(name,'probe-desk-web');assert.equal(options.retries.limit,0);return fn();}});
assert.equal(deskProbeCalls,1);
assert.equal(deskProbe.web_search,true);
assert.equal(deskProbe.model,'openai/gpt-5.6-luna');
assert.equal(deskProbe.source_url,'https://developers.cloudflare.com/workflows/');
console.log('PASS production: bounded Desk web-search diagnostic');
delete globalThis.productionTest;
const terraProbeRoles=[];
globalThis.productionTest={
 async model(env,role,instructions,input,schema,search){
  terraProbeRoles.push(role);
  if(role==='desk'){
   assert.equal(search,true);assert.equal(input.original_order.category,'viden');
   return {subject:'Cloudflare Workers Workflows',facts:['Workflows support durable multi-step execution.'],uncertainties:[],opposing_views:[],sources:[{url:'https://developers.cloudflare.com/workflows/learn/architecture/',title:'Architecture',publisher:'Cloudflare',kind:'primary',retrieved_at:'2026-09-05T00:00:00Z',facts:['Workflows support durable multi-step execution.'],quotes:[]}]};
  }
  assert.equal(role,'journalist');assert.equal(search,false);assert.equal(input.research_requests_remaining,0);
  return {kind:'draft',article:{headline:'Cloudflare Workflows kan køre flertrinsforløb robust',deck:'Tjenesten er bygget til langvarige processer, der kan fortsætte gennem ventetid og fejl.',category:'viden',paragraphs:['Cloudflare Workers Workflows er en tjeneste til flertrinsforløb.','Ifølge Cloudflares egen dokumentation er systemet designet til holdbar udførelse.'],source_urls:['https://developers.cloudflare.com/workflows/learn/architecture/'],image_query:'Cloudflare Workers Workflows'}};
 }
};
const terraProbe=await new Production({},{}).run({payload:{diagnostic:'desk-terra-v1'}},{async do(name,options,fn){assert.equal(options.retries.limit,0);return fn();}});
assert.deepEqual(terraProbeRoles,['desk','journalist']);
assert.equal(terraProbe.web_search,true);
assert.equal(terraProbe.desk_model,'openai/gpt-5.6-luna');
assert.equal(terraProbe.terra_model,'openai/gpt-5.6-terra');
assert.equal(terraProbe.source_urls[0],'https://developers.cloudflare.com/workflows/learn/architecture/');
console.log('PASS production: Luna dossier to Terra draft diagnostic');
delete globalThis.productionTest;
const prepublishRoles=[];let prepublishMediaCalls=0;
globalThis.productionTest={
 async model(env,role,instructions,input,schema,search){
  prepublishRoles.push(role);
  if(role==='desk'){
   assert.equal(search,true);assert.equal(input.original_order.category,'viden');
   return {subject:'Cloudflare Workers Workflows',facts:['Workflows support durable multi-step execution.'],uncertainties:[],opposing_views:[],sources:[{url:'https://developers.cloudflare.com/workflows/learn/architecture/',title:'Architecture',publisher:'Cloudflare',kind:'primary',retrieved_at:'2026-09-05T00:00:00Z',facts:['Workflows support durable multi-step execution.'],quotes:[]}]};
  }
  if(role==='journalist'){
   assert.equal(input.research_requests_remaining,0);
   return {kind:'draft',article:{headline:'Cloudflare Workflows kan køre flertrinsforløb robust',deck:'Tjenesten er bygget til langvarige processer, der kan fortsætte gennem ventetid og fejl.',category:'viden',paragraphs:['Cloudflare Workers Workflows er en tjeneste til flertrinsforløb.','Ifølge Cloudflares egen dokumentation er systemet designet til holdbar udførelse.'],source_urls:['https://developers.cloudflare.com/workflows/learn/architecture/'],image_query:'Cloudflare Workers Workflows'}};
  }
  assert.equal(role,'chief');assert.equal(input.media.id,'media-commissioning');assert.equal(input.state.commissioning,true);
  return {matches_order:true,headline_correct:true,serious_error:false,reason:'Commissioning article is consistent with the dossier.',slot:'viden-1'};
 },
 async media(env,article,job){prepublishMediaCalls++;assert.equal(job,'commissioning-prepublish-v1');assert.equal(article.category,'viden');return {id:'media-commissioning',url:'https://example.org/commissioning.jpg',alt:'Commissioning image',credit:'Commissioning',generated:false};}
};
const prepublish=await new Production({},{}).run({payload:{diagnostic:'prepublish-v1'}},{async do(name,options,fn){assert.equal(options.retries.limit,0);return fn();}});
assert.deepEqual(prepublishRoles,['desk','journalist','chief']);
assert.equal(prepublishMediaCalls,1);
assert.equal(prepublish.web_search,true);
assert.equal(prepublish.chief_model,'openai/gpt-5.6-luna');
assert.equal(prepublish.media.id,'media-commissioning');
assert.equal(prepublish.review.slot,'viden-1');
assert.equal(prepublish.would_publish,true);
console.log('PASS production: bounded prepublish diagnostic');
delete globalThis.productionTest;
