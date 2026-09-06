import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatCommand} from '../src/v3/contracts';
import {orderResult,chatStatus} from '../src/v3/chat-control';
const uuid='6feef265-c5ef-4b4e-b087-37b729ed8f19';
test('retired order commands are rejected and status accepts order and command pointers',()=>{
 const order={instruction:'Skriv præcis om den vedtagne aftale med denne vinkel.',category:'indland',mode:'specific',angle:'Konsekvens for borgerne',why_now:'Aftalen er vedtaget',words:400,primary_source_required:true,opposing_view_required:true};
 assert.equal(ChatCommand.safeParse({id:uuid,type:'order',order}).success,false);
 assert.ok(ChatCommand.safeParse({id:uuid,type:'status',order_id:uuid}).success);
 assert.ok(ChatCommand.safeParse({id:uuid,type:'status',command_id:uuid}).success);
 assert.equal(ChatCommand.safeParse({id:uuid,type:'order',order:{...order,instruction:'x'}}).success,false);
});
test('published result wins over stale error, rejected result explains decision, budget has explicit state',()=>{
 const order={id:uuid,status:'failed',error_code:'daily_budget_exhausted',created_at:'2026-09-06',original_order:{article:{headline:'Submitted title'}}};
 assert.equal(orderResult(order,undefined,undefined,'https://paper.test').status,'budget_blocked');
 const published=orderResult(order,undefined,{order_id:uuid,slug:'slug',headline:'Title'},'https://paper.test');
 assert.equal(published.status,'published');assert.equal(published.article_url,'https://paper.test/artikel/slug');
 const rejected=orderResult({...order,status:'dropped',error_code:null},{order_id:uuid,attempt:1,stage:'rejected',review:{reason:'Rubrikken stemmer ikke med kilden'}},undefined,'https://paper.test');
 assert.equal(rejected.status,'dropped');assert.equal(rejected.reason,'Rubrikken stemmer ikke med kilden');assert.equal(rejected.article_url,null);
});

test('signed status data joins a command to its article and never returns the submitted body',async()=>{
 const saved=globalThis.fetch;
 const order={id:uuid,status:'published',error_code:null,created_at:'2026-09-06',original_order:{article:{headline:'Title',paragraphs:['PRIVATE BODY']}}};
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('v3_chat_orders?'))return Response.json([{order_id:uuid}]);
  if(url.includes('v3_chat_receipts?'))return Response.json([{workflow_id:'command-workflow',status:'dispatched'}]);
  if(url.includes('v3_orders?'))return Response.json([order]);
  if(url.includes('v3_attempts?'))return Response.json([{order_id:uuid,attempt:1,stage:'published',review:{reason:'approved'}}]);
  if(url.includes('v3_articles?'))return Response.json([{order_id:uuid,slug:'article-slug',headline:'Title'}]);
  if(url.includes('v3_budget_state'))return Response.json({limit_dkk:10,committed_dkk:0});
  throw new Error('Unexpected request');
 };
 try{
  const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test',PUBLIC_ORIGIN:'https://paper.test',CHIEF:{async get(){return {async status(){return {status:'complete'};}};}}};
  const result=await chatStatus(env as unknown as Env,{command_id:uuid});
  assert.equal(result.orders[0].status,'published');assert.equal(result.orders[0].article_url,'https://paper.test/artikel/article-slug');
  assert.equal(JSON.stringify(result).includes('PRIVATE BODY'),false);
  await assert.rejects(chatStatus(env as unknown as Env,{command_id:uuid,order_id:uuid}),/choose_command_or_order/);
 }finally{globalThis.fetch=saved;}
});

