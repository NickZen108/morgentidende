import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const replacements={
 './models':'export const model=(...a)=>globalThis.evidenceTest.model(...a);',
 './db':'export const db=(...a)=>globalThis.evidenceTest.db(...a);export const rpc=async()=>({});'
};
await fs.mkdir('reports',{recursive:true});
await build({entryPoints:['src/v3/claim-review.ts'],outfile:'reports/evidence-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^\.\/(models|db)$/},a=>a.importer.endsWith('claim-review.ts')?{path:a.path,namespace:'test'}:undefined);
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:replacements[a.path],loader:'js'}));
}}]});
const {reviewWithEvidence}=await import('../reports/evidence-test.mjs');
const url='https://example.org/reuters-report';
const quote='The European defence index has risen 450% since February 2022.';
const article={headline:'Europæiske forsvarsaktier er steget 450%',deck:'Stigningen er målt siden invasionen i 2022.',paragraphs:['Indekset er steget 450% siden februar 2022.','Opgørelsen gælder dette indeks frem til april 2026.'],category:'penge',source_urls:[url],image_query:'European stock exchange',claims:[{id:'growth',text:'Indekset er steget 450% siden februar 2022.',sources:[{url,publisher:'Reuters',published_at:'2026-04-20',excerpt:quote,scope:'European defence index; February 2022 to April 2026'}]}]};
const step={async do(name,a,b){return (typeof a==='function'?a:b)();}};
const savedFetch=globalThis.fetch;
try{
 for(const scenario of ['supported','fabricated-metadata','unavailable','desk-resolves','budget','contradicted','missing-claim','lost-on-followup']){
  const writes=[];let desks=0,chiefs=0;
  globalThis.fetch=async(input)=>{
   if(scenario==='unavailable')return new Response('Unavailable',{status:503});
   const body=scenario==='fabricated-metadata'?'An unrelated report without that passage.':scenario==='desk-resolves'&&!String(input).endsWith('verified')?'A page without relevant evidence.':quote;
   return new Response(`<html><body><p>${body}</p></body></html>`,{headers:{'Content-Type':'text/html'}});
  };
  globalThis.evidenceTest={
   async db(env,path,method,body){writes.push({path,body});return [];},
   async model(env,role,prompt,input){
    if(role==='desk'){desks++;if(scenario==='budget')throw new Error('daily_budget_exhausted');return {urls:[url+'/verified'],finding:'Targeted source located'};}
    chiefs++;
    assert.match(prompt,/Manglende kilde/);assert.deepEqual(input.article,article);
    const unresolved=scenario==='budget'||(scenario==='desk-resolves'&&chiefs===1)||(scenario==='lost-on-followup'&&chiefs===1);
    const missing=scenario==='missing-claim'||(scenario==='lost-on-followup'&&chiefs>1);
    return {matches_order:true,headline_correct:true,order_mismatch_quote:'',reason:'Assessment',slot:'news-1',claims:[{id:missing?'another':'growth',text:missing?'Opgørelsen gælder dette indeks frem til april 2026.':article.claims[0].text,status:unresolved?'unresolved':scenario==='contradicted'||scenario==='unavailable'?'contradicted':'supported',source_url:scenario==='desk-resolves'&&chiefs>1?url+'/verified':url,source_quote:quote,reason:'Evidence interpretation'}]};
   }
  };
  const result=await reviewWithEvidence({},step,{id:'order',attempt:1,prefix:scenario,article,original_order:{kind:'direct_article',article},dossier:{},media:{id:'media'}});
  const pauses=['fabricated-metadata','unavailable','budget','missing-claim','lost-on-followup'].includes(scenario);
  assert.equal(result.paused,pauses,scenario);
  assert.ok(writes.some(x=>x.body.draft?.claims),'metadata must survive persistence');
  assert.ok(desks<=3);
  if(pauses){assert.ok(writes.some(x=>x.body.status==='paused'));assert.ok(!writes.some(x=>['dropped','failed'].includes(x.body.status)));assert.ok(!writes.some(x=>x.body.stage==='approved'));}
  if(scenario==='budget'){assert.ok(writes.some(x=>x.body.error_code==='daily_budget_exhausted'));assert.equal(chiefs,1);}
  if(scenario==='supported'){assert.equal(desks,0);assert.equal(result.review.serious_error,false);}
  if(scenario==='desk-resolves'){assert.equal(desks,1);assert.equal(result.review.claim_checks[0].source_verified,true);}
  if(scenario==='contradicted'){assert.equal(result.review.serious_error,true);assert.equal(desks,0);}
  console.log('PASS evidence: '+scenario);
 }
}finally{globalThis.fetch=savedFetch;delete globalThis.evidenceTest;}
