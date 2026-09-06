import {reviewWithEvidence} from './claim-review';
import {WorkflowEntrypoint,WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import {withCostContext,budgetedAI} from './budget';
import {z} from 'zod';
import {Dossier,Draft,JournalistResult,Review,OrderRow,nextReviewAction} from './contracts';
import {db,rpc} from './db';
import {model,modelResponseText,ModelResponse} from './models';
import {selectMedia} from './media';
const DeskWebProbe=z.object({fact:z.string().min(1).max(500),source_url:z.string().url()});
type ProductionInput={orderId?:string;diagnostic?:'models-v1'|'desk-web-v1'|'desk-terra-v1'|'prepublish-v1'};
const AI_STEP={retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'2 minutes'} as const;
const MEDIA_STEP={retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'3 minutes'} as const;
export class Production extends WorkflowEntrypoint<Env,ProductionInput>{
 async run(event:WorkflowEvent<ProductionInput>,step:WorkflowStep){
  return withCostContext({orderId:event.payload.orderId??null,workflowId:event.instanceId},()=>this.execute(event,step));
 }
 async execute(event:WorkflowEvent<ProductionInput>,step:WorkflowStep){
  const workflowCost={orderId:event.payload.orderId??null,workflowId:event.instanceId};
  // Commissioning probes never create or publish articles. The prepublish probe may register one media asset.
  if(event.payload.diagnostic){
   if(event.payload.diagnostic==='models-v1'){
    const results=[];
    for(const name of ['openai/gpt-5.6-luna','openai/gpt-5.6-terra']){
     results.push(await step.do(`probe-${name.split('/')[1]}`,{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,async()=>{
      const run=this.env.AI.run.bind(this.env.AI) as (name:string,input:Record<string,unknown>,options:Record<string,unknown>)=>Promise<unknown>;
      const response=await budgetedAI(this.env,name,{input:'Reply with exactly OK.',reasoning:{effort:'low'},max_output_tokens:128,store:false},{gateway:{id:'default'}},name,workflowCost) as ModelResponse;
      if(response.status&&response.status!=='completed')throw new Error(`probe_${name.split('/')[1]}_${response.status}`);
      const text=modelResponseText(response).trim();
      if(text!=='OK')throw new Error(`probe_${name.split('/')[1]}_unexpected_output`);
      return {model:name,ok:true};
     })));
    }
    return results;
   }
   if(event.payload.diagnostic==='desk-web-v1'){
    return await step.do('probe-desk-web',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,async()=>{
     const result=await model(this.env,'desk','Commissioning only. Use web search to verify one current public fact about Cloudflare Workers Workflows from an official Cloudflare source. Keep the answer short and include the exact source URL.',{question:'What is one current capability of Cloudflare Workers Workflows? Use an official Cloudflare source.'},DeskWebProbe,true,'desk',workflowCost);
     return {model:'openai/gpt-5.6-luna',web_search:true,...result};
    }));
   }
   if(event.payload.diagnostic==='desk-terra-v1'){
    const original_order={instruction:'Skriv en kort dansk forklarende artikel om en aktuel, dokumenteret egenskab ved Cloudflare Workers Workflows.',category:'viden' as const,mode:'specific' as const,angle:'Forklar egenskaben nøgternt for en teknisk interesseret læser.',why_now:'Commissioning af Morgentidende v3.',words:180,primary_source_required:true,opposing_view_required:false};
    const dossier=await step.do('probe-desk-dossier',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,()=>model(this.env,'desk','Commissioning only. Research one current capability of Cloudflare Workers Workflows. Use web search, prefer an official Cloudflare primary source, and return a compact but real editorial dossier with exact URLs. Do not invent quotes.',{original_order},Dossier,true,'desk',workflowCost)));
    if(!dossier.sources.some(source=>source.kind==='primary'))throw new Error('probe_primary_source_missing');
    const result=await step.do('probe-terra-draft',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,()=>model(this.env,'journalist','Commissioning only. Write the requested short Danish article from the dossier. Do not request more research. Use only facts and source URLs present in the dossier. No invented quotations.',{original_order,dossier,research_requests_remaining:0},JournalistResult,false,'journalist',workflowCost)));
    if(result.kind!=='draft')throw new Error('probe_terra_requested_research');
    const allowed=new Set(dossier.sources.map(source=>source.url));
    if(result.article.source_urls.some(url=>!allowed.has(url)))throw new Error('probe_terra_unknown_source');
    if(result.article.category!==original_order.category)throw new Error('probe_terra_category_mismatch');
    return {desk_model:'openai/gpt-5.6-luna',terra_model:'openai/gpt-5.6-terra',web_search:true,dossier_subject:dossier.subject,dossier_sources:dossier.sources.map(source=>({publisher:source.publisher,kind:source.kind,url:source.url})),headline:result.article.headline,deck:result.article.deck,paragraphs:result.article.paragraphs,source_urls:result.article.source_urls};
   }
   if(event.payload.diagnostic==='prepublish-v1'){
    const original_order={instruction:'Skriv en kort dansk forklarende artikel om en aktuel, dokumenteret egenskab ved Cloudflare Workers Workflows.',category:'viden' as const,mode:'specific' as const,angle:'Forklar egenskaben nøgternt for en teknisk interesseret læser.',why_now:'Commissioning af Morgentidende v3 før første publicering.',words:180,primary_source_required:true,opposing_view_required:false};
    const dossier=await step.do('probe-prepublish-desk',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,()=>model(this.env,'desk','Commissioning only. Research one current capability of Cloudflare Workers Workflows. Use web search, prefer an official Cloudflare primary source, and return a compact production-shaped dossier with exact URLs. Do not invent quotes.',{original_order},Dossier,true,'desk',workflowCost)));
    if(!dossier.sources.some(source=>source.kind==='primary'))throw new Error('probe_primary_source_missing');
    const journalist=await step.do('probe-prepublish-terra',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,()=>model(this.env,'journalist','Commissioning only. Write the requested short Danish article from the dossier. Do not request more research. Use only facts and source URLs present in the dossier. No invented quotations.',{original_order,dossier,research_requests_remaining:0},JournalistResult,false,'journalist',workflowCost)));
    if(journalist.kind!=='draft')throw new Error('probe_terra_requested_research');
    const allowed=new Set(dossier.sources.map(source=>source.url));
    if(journalist.article.source_urls.some(url=>!allowed.has(url)))throw new Error('probe_terra_unknown_source');
    if(journalist.article.category!==original_order.category)throw new Error('probe_terra_category_mismatch');
    const article=journalist.article;
    const media=await step.do('probe-prepublish-media',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,async()=>{
     const asset=await selectMedia(this.env,article,'commissioning-prepublish-v1',{original_order,dossier});
     return {id:asset.id,url:asset.url,alt:asset.alt,credit:asset.credit,generated:asset.generated};
    }));
    const state={commissioning:true,occupied_slots:[],available_slots:['lead','top-1','top-2','top-3','news-1','news-2','news-3','news-4','viden-1','viden-2','liv-1','liv-2']};
    const review=await step.do('probe-prepublish-chief',{retries:{limit:0,delay:'1 second'}},()=>withCostContext(workflowCost,()=>model(this.env,'chief','Commissioning only. Kontrollér KUN om artiklen matcher originalordren, om rubrikken er korrekt i forhold til dossier og artikel, og vælg en gyldig forsideplads ud fra den oplyste commissioning-state. Omskriv ikke og bestil ikke ekstra research. Der bliver ikke publiceret noget i denne test.',{original_order,dossier,article,media,state},Review,false,'chief',workflowCost)));
    return {desk_model:'openai/gpt-5.6-luna',terra_model:'openai/gpt-5.6-terra',chief_model:'openai/gpt-5.6-luna',web_search:true,headline:article.headline,source_urls:article.source_urls,media,review,would_publish:nextReviewAction(review,1)==='publish'};
   }
   throw new Error('unknown_diagnostic');
  }
  const id=event.payload.orderId;
  if(!id)throw new Error('order_id_required');
  const orderCost={orderId:id,workflowId:event.instanceId};
  try {
  const order=await step.do('load-order',async()=>{
   const [row]=await db<OrderRow[]>(this.env,`v3_orders?id=eq.${id}`);
   if(!row)throw new Error('order_not_found');
   if(row.status!=='published')await db(this.env,`v3_orders?id=eq.${id}`,'PATCH',{status:'running',error_code:null});
   return row;
  });
  if(order.status==='published')return;
  for(let attempt=1;attempt<=2;attempt++){
   const prefix=`attempt-${attempt}`;
   let dossier=await step.do(`${prefix}-desk`,AI_STEP,()=>withCostContext(orderCost,async()=>{
    const dossier=await model(this.env,'desk','Du er Desk på Morgentidende. Research ordren på nettet nu. Ved discovery: vælg én væsentlig historie inden for ordren. Find primærkilder og loyalt gengivne modparter når ordren kræver det. Gem konkrete fakta, præcise citater og usikkerheder.',{original_order:order.original_order},Dossier,true,'desk',orderCost);
    if(order.original_order.primary_source_required&&!dossier.sources.some(s=>s.kind==='primary'))throw new Error('primary_source_missing');
    await db(this.env,'v3_attempts?on_conflict=order_id,attempt','POST',{order_id:id,attempt,stage:'journalist',dossier});
    return dossier;
   }));
   let draft:Draft|undefined;
   for(let count=0;count<=3;count++){
    const result=await step.do(`${prefix}-journalist-${count}`,AI_STEP,()=>withCostContext(orderCost,()=>model(this.env,'journalist',`Skriv en veldokumenteret dansk avisartikel ud fra uændret originalordre og dossier. Ingen opdigtede fakta eller citater. Vedlæg claims for centrale tal og påstande med præcis artikeltekst, stabilt id og kildens URL, publisher, published_at, excerpt og scope (mål/indeks, periode og afgrænsning). ${count<3?'Du må i stedet stille ét specifikt researchspørgsmål til Desk.':'Du har brugt alle tre researchforespørgsler; skriv artiklen med tydelig usikkerhed og uden udokumenterede påstande.'}`,{original_order:order.original_order,dossier,research_requests_remaining:3-count},JournalistResult,false,'journalist',orderCost)));
    if(result.kind==='draft'){
     const sourceSet=new Set(dossier.sources.map(s=>s.url));
     if(result.article.source_urls.some(url=>!sourceSet.has(url)))throw new Error('unknown_article_source');
     if(result.article.category!==order.original_order.category)throw new Error('category_mismatch');
     draft=result.article;break;
    }
    if(count===3)throw new Error('research_limit_exceeded');
    const previous=dossier;
    dossier=await step.do(`${prefix}-followup-${count+1}`,AI_STEP,()=>withCostContext(orderCost,async()=>{
     const expanded=await model(this.env,'desk','Besvar Journalistens konkrete researchforespørgsel med ny websøgning. Returnér et samlet, opdateret dossier. Bevar tidligere verificerede kilder og markér modstridende oplysninger.',{original_order:order.original_order,dossier:previous,question:result.question},Dossier,true,'desk',orderCost);
     await db(this.env,`v3_attempts?order_id=eq.${id}&attempt=eq.${attempt}`,'PATCH',{dossier:expanded,research_requests:count+1});return expanded;
    }));
   }
   if(!draft)throw new Error('draft_missing');
   const article=draft;
   await step.do(`${prefix}-save-draft`,async()=>{await db(this.env,`v3_attempts?order_id=eq.${id}&attempt=eq.${attempt}`,'PATCH',{draft:article,stage:'media'});return true;});
   const media=await step.do(`${prefix}-media`,MEDIA_STEP,()=>withCostContext(orderCost,async()=>{const m=await selectMedia(this.env,article,`${id}-${attempt}`,{original_order:order.original_order,dossier});return {id:m.id,url:m.url,alt:m.alt,credit:m.credit};}));
   const checked=await reviewWithEvidence(this.env,step,{id,attempt,prefix,article,media,original_order:order.original_order,dossier,workflowId:event.instanceId});
   if(checked.paused)return {status:'paused',order_id:id,reason:checked.reason};
   const review=checked.review;
   const action=nextReviewAction(review,attempt);
   if(action==='publish')return await step.do(`${prefix}-publish`,()=>rpc<string>(this.env,'v3_publish',{p_order:id,p_attempt:attempt,p_slot:review.slot}));
   if(action==='drop')break;
  }
  await step.do('drop-order',async()=>{await db(this.env,`v3_orders?id=eq.${id}`,'PATCH',{status:'dropped'});return true;});
  } catch(error) {
   if(error instanceof Error&&error.message==='daily_budget_exhausted'){
    await step.do('pause-budget',async()=>{await db(this.env,`v3_orders?id=eq.${id}&status=neq.published`,'PATCH',{status:'paused',error_code:'daily_budget_exhausted'});return true;});
    return {status:'paused',order_id:id,reason:'Dagsbudgettet kan ikke dække næste trin. Ordren er gemt.'};
   }
   await step.do('mark-failed',async()=>{await db(this.env,`v3_orders?id=eq.${id}&status=neq.published`,'PATCH',{status:'failed',error_code:error instanceof Error&&error.message==='daily_budget_exhausted'?'daily_budget_exhausted':'production_failed'});return true;});
   throw error;
  }
 }
}
