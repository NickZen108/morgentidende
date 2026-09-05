import {WorkflowEntrypoint,WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import {ChiefDecision,OrderRow} from './contracts';
import {db,rpc} from './db';
import {model} from './models';
type ChiefInput={tick:string;commission?:'first-article-v1'};
export class Chief extends WorkflowEntrypoint<Env,ChiefInput>{
 async run(event:WorkflowEvent<ChiefInput>,step:WorkflowStep){
  const state=await step.do('state',()=>rpc<{settings:{enabled:boolean;max_orders_per_day:number;editorial_policy:string};breaking:{id:string}[]}>(this.env,'v3_editorial_state'));
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
