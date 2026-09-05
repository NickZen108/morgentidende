import {WorkflowEntrypoint,WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import {Dossier,Draft,JournalistResult,Review,OrderRow,nextReviewAction} from './contracts';
import {db,rpc} from './db';
import {model} from './models';
import {selectMedia} from './media';
export class Production extends WorkflowEntrypoint<Env,{orderId:string}>{
 async run(event:WorkflowEvent<{orderId:string}>,step:WorkflowStep){
  const id=event.payload.orderId;
  try {
  const order=await step.do('load-order',async()=>{
   const [row]=await db<OrderRow[]>(this.env,`v3_orders?id=eq.${id}`);
   if(!row)throw new Error('order_not_found');
   if(row.status!=='published')await db(this.env,`v3_orders?id=eq.${id}`,'PATCH',{status:'running'});
   return row;
  });
  if(order.status==='published')return;
  for(let attempt=1;attempt<=2;attempt++){
   const prefix=`attempt-${attempt}`;
   let dossier=await step.do(`${prefix}-desk`,async()=>{
    const dossier=await model(this.env,'desk','Du er Desk på Morgentidende. Research ordren på nettet nu. Ved discovery: vælg én væsentlig historie inden for ordren. Find primærkilder og loyalt gengivne modparter når ordren kræver det. Gem konkrete fakta, præcise citater og usikkerheder.',{original_order:order.original_order},Dossier,true);
    if(order.original_order.primary_source_required&&!dossier.sources.some(s=>s.kind==='primary'))throw new Error('primary_source_missing');
    await db(this.env,'v3_attempts?on_conflict=order_id,attempt','POST',{order_id:id,attempt,stage:'journalist',dossier});
    return dossier;
   });
   let draft:Draft|undefined;
   for(let count=0;count<=3;count++){
    const result=await step.do(`${prefix}-journalist-${count}`,()=>model(this.env,'journalist',`Skriv en veldokumenteret dansk avisartikel ud fra uændret originalordre og dossier. Ingen opdigtede fakta eller citater. ${count<3?'Du må i stedet stille ét specifikt researchspørgsmål til Desk.':'Du har brugt alle tre researchforespørgsler; skriv artiklen med tydelig usikkerhed og uden udokumenterede påstande.'}`,{original_order:order.original_order,dossier,research_requests_remaining:3-count},JournalistResult));
    if(result.kind==='draft'){
     const sourceSet=new Set(dossier.sources.map(s=>s.url));
     if(result.article.source_urls.some(url=>!sourceSet.has(url)))throw new Error('unknown_article_source');
     if(result.article.category!==order.original_order.category)throw new Error('category_mismatch');
     draft=result.article;break;
    }
    if(count===3)throw new Error('research_limit_exceeded');
    const previous=dossier;
    dossier=await step.do(`${prefix}-followup-${count+1}`,async()=>{
     const expanded=await model(this.env,'desk','Besvar Journalistens konkrete researchforespørgsel med ny websøgning. Returnér et samlet, opdateret dossier. Bevar tidligere verificerede kilder og markér modstridende oplysninger.',{original_order:order.original_order,dossier:previous,question:result.question},Dossier,true);
     await db(this.env,`v3_attempts?order_id=eq.${id}&attempt=eq.${attempt}`,'PATCH',{dossier:expanded,research_requests:count+1});return expanded;
    });
   }
   if(!draft)throw new Error('draft_missing');
   const article=draft;
   const media=await step.do(`${prefix}-media`,async()=>{const m=await selectMedia(this.env,article,`${id}-${attempt}`);return {id:m.id,url:m.url,alt:m.alt,credit:m.credit};});
   const review=await step.do(`${prefix}-review`,async()=>{
    const state=await rpc(this.env,'v3_editorial_state');
    const review=await model(this.env,'chief','Kontrollér KUN om artiklen matcher originalordren og om rubrikken er korrekt i forhold til dossier og artikel. Omskriv ikke og bestil ikke ekstra research. Markér alvorlige fejl. Vælg forsideplacering ud fra state; Viden/Liv placeres i deres magasinpladser medmindre historien klart kræver lead.',{original_order:order.original_order,dossier,article,media,state},Review);
    await db(this.env,`v3_attempts?order_id=eq.${id}&attempt=eq.${attempt}`,'PATCH',{draft:article,media_id:media.id,review,stage:nextReviewAction(review,attempt)==='publish'?'approved':'rejected'});return review;
   });
   const action=nextReviewAction(review,attempt);
   if(action==='publish')return await step.do(`${prefix}-publish`,()=>rpc<string>(this.env,'v3_publish',{p_order:id,p_attempt:attempt,p_slot:review.slot}));
   if(action==='drop')break;
  }
  await step.do('drop-order',async()=>{await db(this.env,`v3_orders?id=eq.${id}`,'PATCH',{status:'dropped'});return true;});
  } catch(error) {
   await step.do('mark-failed',async()=>{await db(this.env,`v3_orders?id=eq.${id}&status=neq.published`,'PATCH',{status:'failed'});return true;});
   throw error;
  }
 }
}
