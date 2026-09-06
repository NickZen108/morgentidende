import {db,rpc,DatabaseEnv} from './db';
export const directWorkflowId=(orderId:string)=>`direct-order-${orderId}`;
export async function linkChatOrder(env:DatabaseEnv,tick:string,orderId:string){
 const match=/^chatops:([a-f0-9-]{36})$/.exec(tick);if(!match)return;
 await db(env,'v3_chat_orders?on_conflict=command_id,order_id','POST',{command_id:match[1],order_id:orderId});
}
type StatusOrder={id:string;status:string;error_code:string|null;created_at:string;original_order:{instruction?:string;article?:{headline?:string}}};
type Attempt={order_id:string;attempt:number;stage:string;review?:{reason?:string}};
type Published={order_id:string;slug:string;headline:string};
export function orderResult(order:StatusOrder,attempt:Attempt|undefined,article:Published|undefined,origin:string){
 return {order_id:order.id,status:article?'published':order.error_code==='daily_budget_exhausted'?'budget_blocked':order.status,
 phase:attempt?.stage??null,headline:article?.headline??order.original_order.article?.headline??null,
 instruction:order.original_order.instruction??null,
 reason:article?null:order.error_code==='daily_budget_exhausted'?'Dagsbudgettet kan ikke dække næste kald. Ordren kræver genoptagelse.':order.status==='failed'?'Produktionen stoppede med en teknisk fejl.':attempt?.review?.reason??null,
 article_url:article?`${origin}/artikel/${article.slug}`:null,created_at:order.created_at};
}
export async function chatStatus(env:Env,query:{command_id?:string;order_id?:string}){
 if(query.command_id&&query.order_id)throw new Error('choose_command_or_order');
 let ids=query.order_id?[query.order_id]:null;
 let workflow:unknown=null;
 if(query.command_id){
  const links=await db<{order_id:string}[]>(env,`v3_chat_orders?command_id=eq.${query.command_id}&limit=100`);
  ids=links.map(x=>x.order_id);
  const [receipt]=await db<{workflow_id:string;status:string}[]>(env,`v3_chat_receipts?id=eq.${query.command_id}&limit=1`);
  if(receipt){try{workflow=await (await env.CHIEF.get(receipt.workflow_id)).status();}catch{workflow={dispatch_status:receipt.status};}}
 }
 const filter=ids?`id=in.(${ids.join(',')})&`:'';
 const orders=ids?.length===0?[]:await db<StatusOrder[]>(env,`v3_orders?${filter}select=id,status,error_code,created_at,original_order&order=created_at.desc&limit=20`);
 const orderIds=orders.map(x=>x.id).join(',');
 const attempts=orders.length?await db<Attempt[]>(env,`v3_attempts?order_id=in.(${orderIds})&select=order_id,attempt,stage,review&order=attempt.desc`):[];
 const articles=orders.length?await db<Published[]>(env,`v3_articles?order_id=in.(${orderIds})&select=order_id,slug,headline`):[];
 return {ok:true,budget:await rpc(env,'v3_budget_state'),workflow,orders:orders.map(order=>orderResult(order,attempts.find(x=>x.order_id===order.id),articles.find(x=>x.order_id===order.id),env.PUBLIC_ORIGIN))};
}
