import {WorkflowEntrypoint,WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import {ChiefDecision,DirectSubmission,OrderRow,Review} from './contracts';
import {db,rpc} from './db';
import {model} from './models';
import {selectMedia} from './media';
export type ChiefInput={tick:string;commission?:'first-article-v1'|'single-article-test-v1'|'chatops-batch-v1';count?:number;topic?:string;directOrderId?:string};
type EditorialState={settings:{enabled:boolean;max_orders_per_day:number;editorial_policy:string};breaking:{id:string}[]};
export class Chief extends WorkflowEntrypoint<Env,ChiefInput>{
 async run(event:WorkflowEvent<ChiefInput>,step:WorkflowStep){
  const state=await step.do('state',()=>rpc<EditorialState>(this.env,'v3_editorial_state'));
  if(event.payload.directOrderId){
   const id=event.payload.directOrderId;
   try{
    const row=await step.do('direct-load',async()=>{
     const [found]=await db<{id:string;status:string;original_order:DirectSubmission}[]>(this.env,`v3_orders?id=eq.${encodeURIComponent(id)}&limit=1`);
     if(!found)throw new Error('direct_order_not_found');
     if(found.status!=='published')await db(this.env,`v3_orders?id=eq.${encodeURIComponent(id)}`,'PATCH',{status:'running'});
     return found;
    });
    if(row.status==='published')return {status:'already-published',order_id:id};
    const submission=DirectSubmission.parse(row.original_order);
    const article=submission.article;
    const now=new Date().toISOString();
    const dossier={
     subject:article.headline,
     facts:['Færdig artikel indsendt direkte til Media og Chefredaktør; Desk og Journalist er bevidst sprunget over.'],
     uncertainties:[],opposing_views:[],
     sources:article.source_urls.map(url=>({url,title:url,publisher:new URL(url).hostname,kind:'secondary' as const,retrieved_at:now,facts:['Kilde angivet i den direkte indsendte artikel.'],quotes:[]}))
    };
    await step.do('direct-save-attempt',async()=>{await db(this.env,'v3_attempts?on_conflict=order_id,attempt','POST',{order_id:id,attempt:1,stage:'media',dossier,draft:article});return true;});
    const media=await step.do('direct-media',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'3 minutes'},async()=>{
     const m=await selectMedia(this.env,article,`direct-${id}`);return {id:m.id,url:m.url,alt:m.alt,credit:m.credit,generated:m.generated};
    });
    const review=await step.do('direct-chief-review',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'2 minutes'},async()=>{
     const freshState=await rpc(this.env,'v3_editorial_state');
     const result=await model(this.env,'chief','Du er Chefredaktør på Morgentidende. Dette er en færdig artikel indsendt direkte af ejeren og den må ikke omskrives eller sendes til Desk/Journalist. Media har valgt hero. Kontrollér med web search de væsentligste faktuelle påstande hvis nødvendigt, vurder om artiklen kan publiceres som indsendt, om rubrikken er dækkende, og om der er en alvorlig faktuel, juridisk eller redaktionel fejl. serious_error skal være true ved en sådan alvorlig fejl. Vælg samtidig en gyldig forsideplads ud fra state. Returnér kun Review-strukturen.',{direct_submission:true,article,media,state:freshState},Review,true);
     const approved=result.matches_order&&result.headline_correct&&!result.serious_error;
     await db(this.env,`v3_attempts?order_id=eq.${encodeURIComponent(id)}&attempt=eq.1`,'PATCH',{draft:article,media_id:media.id,review:result,stage:approved?'approved':'rejected'});
     return result;
    });
    const approved=review.matches_order&&review.headline_correct&&!review.serious_error;
    if(!approved){await step.do('direct-drop',async()=>{await db(this.env,`v3_orders?id=eq.${encodeURIComponent(id)}`,'PATCH',{status:'dropped'});return true;});return {status:'dropped',order_id:id,reason:review.reason};}
    const articleId=await step.do('direct-publish',()=>rpc<string>(this.env,'v3_publish',{p_order:id,p_attempt:1,p_slot:review.slot}));
    return {status:'published',order_id:id,article_id:articleId,headline:article.headline,media_generated:media.generated};
   }catch(error){
    await step.do('direct-mark-failed',async()=>{await db(this.env,`v3_orders?id=eq.${encodeURIComponent(id)}&status=neq.published`,'PATCH',{status:'failed'});return true;});
    throw error;
   }
  }
  if(event.payload.commission==='chatops-batch-v1'){
   const count=Math.max(1,Math.min(20,event.payload.count??1));
   const topic=event.payload.topic?.trim();
   const started:{order_id:string;order:unknown}[]=[];
   for(let i=0;i<count;i++){
    const batchState=i===0?state:await step.do(`chatops-state-${i+1}`,()=>rpc<EditorialState>(this.env,'v3_editorial_state'));
    const scope=topic?`Brugeren har bestemt emnet eller rammen: "${topic}". Vælg én aktuel, konkret og publicerbar historie inden for denne ramme.`:'Vælg selv emne, kategori og vinkel ud fra den aktuelle nyhedsdag.';
    const decision=await step.do(`chatops-decide-${i+1}`,()=>model(this.env,'chief',`Chatstyret commissioning af Morgentidende v3, artikel ${i+1} af ${count}. ${scope} Vurder forsiden, de seneste 72 timers mix, breaking-signaler og allerede igangsatte ordrer. Undgå overlap med tidligere artikler i samme batch. Vælg kategori, vinkel, længde og kildekrav selv. Det skal være en rigtig artikel, ikke meta om AI, Cloudflare eller testen. Vælg ikke kommentar medmindre brugeren udtrykkeligt har bedt om det. Returnér præcis én ordre og ikke order:null.`,batchState,ChiefDecision));
    if(!decision.order)throw new Error(`chatops_order_missing_${i+1}`);
    const key=`commission:chatops-batch-v1:${event.payload.tick}:${i+1}`;
    const order=await step.do(`chatops-save-${i+1}`,async()=>{
     const existing=await db<OrderRow[]>(this.env,`v3_orders?dedupe_key=eq.${encodeURIComponent(key)}&limit=1`);
     if(existing[0])return existing[0];
     const [created]=await db<OrderRow[]>(this.env,'v3_orders','POST',{dedupe_key:key,original_order:decision.order});
     if(!created)throw new Error(`chatops_order_insert_failed_${i+1}`);return created;
    });
    await step.do(`chatops-start-${i+1}`,async()=>{await this.env.PRODUCTION.create({id:order.id,params:{orderId:order.id}});return order.id;});
    started.push({order_id:order.id,order:decision.order});
   }
   return {status:'started',count:started.length,orders:started,topic:topic??null,automation_enabled:state.settings.enabled};
  }
  if(event.payload.commission==='single-article-test-v1'){
   const decision=await step.do('test-decide',()=>model(this.env,'chief','Engangstest af Morgentidende v3. Du er Chefredaktør og vælger helt selv præcis én rigtig, aktuel nyhedsordre ud fra forsiden, 72-timers-mix, breaking-signaler og den redaktionelle politik. Vælg emne, kategori, vinkel, prioritet og kildekrav selv. Hvis breaking-signalerne ikke giver et stærkt konkret valg, lav en discovery-ordre i den kategori der bedst udfylder forsiden. Det skal være en almindelig nyhedsartikel, ikke en meta-artikel om Cloudflare, AI eller testen. Vælg ikke kommentar. Sigt efter ca. 350-500 ord. Returnér ikke order:null.',state,ChiefDecision));
   if(!decision.order)throw new Error('test_order_missing');
   const key=`commission:single-article-test-v1:${event.payload.tick}`;
   const order=await step.do('test-save-order',async()=>{
    const existing=await db<OrderRow[]>(this.env,`v3_orders?dedupe_key=eq.${encodeURIComponent(key)}&limit=1`);
    if(existing[0])return existing[0];
    const [row]=await db<OrderRow[]>(this.env,'v3_orders','POST',{dedupe_key:key,original_order:decision.order});
    if(!row)throw new Error('test_order_insert_failed');
    return row;
   });
   await step.do('test-start-production',async()=>{await this.env.PRODUCTION.create({id:order.id,params:{orderId:order.id}});return order.id;});
   return {status:'started',order_id:order.id,order:decision.order,automation_enabled:state.settings.enabled,test:'single-article-test-v1'};
  }
  if(event.payload.commission==='first-article-v1'){
   const decision=await step.do('commission-decide',()=>model(this.env,'chief','Commissioning af Morgentidende v3. Vælg præcis én rigtig, aktuel nyhedsordre til avisens første v3-publicering ud fra forsiden, 72-timers-mix, breaking-signaler og den redaktionelle politik. Hvis breaking-signalerne ikke giver et stærkt konkret valg, lav en discovery-ordre i den kategori der bedst udfylder forsiden. Det skal være en almindelig nyhedsartikel, ikke en meta-artikel om Cloudflare, AI eller commissioning. Vælg ikke kommentar. Sigt efter ca. 350-500 ord. Returnér ikke order:null.',state,ChiefDecision));
   if(!decision.order)throw new Error('commission_order_missing');
   const key='commission:first-article-v1';
   const order=await step.do('commission-save-order',async()=>{
    const existing=await db<OrderRow[]>(this.env,`v3_orders?dedupe_key=eq.${encodeURIComponent(key)}&limit=1`);
    if(existing[0])return existing[0];
    const [row]=await db<OrderRow[]>(this.env,'v3_orders','POST',{dedupe_key:key,original_order:decision.order});
    if(!row)throw new Error('commission_order_insert_failed');
    return row;
   });
   await step.do('commission-start-production',async()=>{await this.env.PRODUCTION.create({id:order.id,params:{orderId:order.id}});return order.id;});
   return {status:'started',order_id:order.id,order:decision.order,automation_enabled:state.settings.enabled};
  }
  if(!state.settings.enabled)return {status:'disabled'};
  const decision=await step.do('decide',()=>model(this.env,'chief','Du er Chefredaktør på Morgentidende. Vurder den nuværende forside, produktionen, 72 timers mix og breaking-signaler. Vælg højst én konkret ordre eller kategori-/magasin-discovery. Returnér order:null hvis der ikke er behov. Undgå gentagelser. Prioritér bred geografisk og kildemæssig spredning; en vigtig lokal historie fra én avis er værdifuld, også uden overlap med andre medier. Scan er kun et signal; du afgør dansk relevans, lead eller almindelig artikel. Følg den konfigurerede redaktionelle politik.',state,ChiefDecision));
  if(decision.order){
   const order=await step.do('save-order',async()=>{
    const [row]=await rpc<OrderRow[]>(this.env,'v3_admit_order',{p_key:event.payload.tick,p_order:decision.order});return row??null;
   });
   if(order)await step.do('start-production',async()=>{await this.env.PRODUCTION.create({id:order.id,params:{orderId:order.id}});return order.id;});
  }
  await step.do('mark-signals',async()=>{
   for(const signal of state.breaking)await db(this.env,`v3_signals?id=eq.${encodeURIComponent(signal.id)}`,'PATCH',{processed_at:new Date().toISOString()});
   await rpc(this.env,'v3_refresh_usage');return true;
  });
 }
}
