import {WorkflowEntrypoint,WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import {ChiefDecision,OrderRow} from './contracts';
import {db,rpc} from './db';
import {model} from './models';
export class Chief extends WorkflowEntrypoint<Env,{tick:string}>{
 async run(event:WorkflowEvent<{tick:string}>,step:WorkflowStep){
  const state=await step.do('state',()=>rpc<{settings:{enabled:boolean;max_orders_per_day:number;editorial_policy:string};breaking:{id:string}[]}>(this.env,'v3_editorial_state'));
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
