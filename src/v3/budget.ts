import {AsyncLocalStorage} from 'node:async_hooks';
import {rpc,db,DatabaseEnv} from './db';
const context=new AsyncLocalStorage<{orderId:string|null;workflowId:string}>();
export const withCostContext=<T>(value:{orderId:string|null;workflowId:string},fn:()=>Promise<T>)=>context.run(value,fn);
export class BudgetExceeded extends Error {constructor(){super('daily_budget_exhausted');}}
export function rethrowBudget(error:unknown){if(error instanceof BudgetExceeded)throw error;}
// Conservative budget conversion, not an assertion about the invoice exchange rate.
// 10 DKK/USD plus 25% reserve; free allowances are deliberately not spent twice.
export const DKK_PER_USD=12.5;
export type Usage={input_tokens?:number;output_tokens?:number;prompt_tokens?:number;completion_tokens?:number;total_tokens?:number};
export async function paidCall<T>(env:DatabaseEnv,stage:string,model:string,maxUsd:number,fn:()=>Promise<T>,cost:(result:T)=>{usd:number;usage:unknown}|null):Promise<T>{
 const ctx=context.getStore();if(!ctx)throw new Error('cost_context_required');
 const id=crypto.randomUUID(),maxDkk=Math.ceil(maxUsd*DKK_PER_USD*1e6)/1e6;
 if(!await rpc<boolean>(env,'v3_reserve_cost',{p_id:id,p_order:ctx.orderId,p_workflow:ctx.workflowId,p_stage:stage,p_model:model,p_max_dkk:maxDkk}))throw new BudgetExceeded();
 let result:T;
 try{result=await fn();}catch(error){
  // A timeout does not prove the provider stopped billing. Charge the reservation.
  await rpc(env,'v3_settle_cost',{p_id:id,p_dkk:maxDkk,p_usd:null,p_usage:{error:error instanceof Error?error.message:'unknown'},p_uncertain:true});
  throw error;
 }
 const measured=cost(result);
 await rpc(env,'v3_settle_cost',{p_id:id,p_dkk:measured?Math.ceil(measured.usd*DKK_PER_USD*1e6)/1e6:maxDkk,p_usd:measured?.usd??null,p_usage:measured?.usage??{},p_uncertain:!measured});
 return result;
}
export function tokenCost(result:unknown,inputRate:number,outputRate:number,searches=0){
 const r=result as {usage?:Usage;output?:{type?:string}[]};
 const usage=r.usage;const input=usage?.input_tokens??usage?.prompt_tokens,output=usage?.output_tokens??usage?.completion_tokens;
 if(typeof input!=='number'||typeof output!=='number'||!Number.isFinite(input)||!Number.isFinite(output)||input<0||output<0)return null;
 const searchCalls=r.output?.filter(x=>x.type==='web_search_call').length??searches;
 return {usd:(input*inputRate+output*outputRate)/1e6+searchCalls*0.01,usage:{...usage,web_search_calls:searchCalls}};
}
export async function budgetedAI(env:DatabaseEnv&{AI:Ai},name:string,input:Record<string,unknown>,options:Record<string,unknown>={},stage=name):Promise<unknown>{
 const run=env.AI.run.bind(env.AI) as (name:string,input:Record<string,unknown>,options:Record<string,unknown>)=>Promise<unknown>;
 if(name==='openai/gpt-5.6-luna'||name==='openai/gpt-5.6-terra'){
  const terra=name.endsWith('terra'),rate=terra?2:0.2,outputRate=terra?12:1.2;
  const search=Array.isArray(input.tools)&&input.tools.length>0;
  const out=Number(input.max_output_tokens);
  if(!Number.isInteger(out)||out<1||out>7000)throw new Error('output_budget_required');
  if(search&&(terra||input.max_tool_calls!==1))throw new Error('search_budget_requires_single_luna_tool');
  const bytes=new TextEncoder().encode(JSON.stringify(input)).length+1024;
  if(bytes>100000)throw new Error('model_input_budget_exceeded');
  // Search results are provider-controlled. Reserve two full context windows,
  // covering the initial inference and the one permitted tool-result inference.
  const maxInput=search?2*1050000:bytes;
  const maxUsd=(maxInput*rate+out*outputRate)/1e6+(search?0.01:0);
  return paidCall(env,stage,name,maxUsd,()=>run(name,input,options),r=>tokenCost(r,rate,outputRate,search?1:0));
 }
 if(name==='@cf/google/gemma-4-26b-a4b-it'){
  if(input.max_completion_tokens!==16)throw new Error('vision_output_budget_required');
  return paidCall(env,stage,name,(262144*0.1+16*0.3)/1e6,()=>run(name,input,options),r=>tokenCost(r,0.1,0.3));
 }
 if(name==='@cf/black-forest-labs/flux-1-schnell'){
  if(input.steps!==4||input.width!==1024||input.height!==1024)throw new Error('image_budget_required');
  const usd=0.0000528*4*4;
  return paidCall(env,stage,name,usd,()=>run(name,input,options),()=>({usd,usage:{steps:4,width:1024,height:1024,images:1}}));
 }
 throw new Error('unpriced_model');
}

export function costContext(){return context.getStore();}
export async function assignOrderCosts(env:DatabaseEnv,orderId:string){
 const ctx=context.getStore();if(!ctx)throw new Error('cost_context_required');
 await db(env,`v3_costs?workflow_id=eq.${encodeURIComponent(ctx.workflowId)}&order_id=is.null`,'PATCH',{order_id:orderId});
}
