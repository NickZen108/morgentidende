import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatCommand} from '../src/v3/contracts';
import {orderResult,directWorkflowId} from '../src/v3/chat-control';
const uuid='6feef265-c5ef-4b4e-b087-37b729ed8f19';
test('specific command preserves original order and status accepts order and command pointers',()=>{
 const order={instruction:'Skriv præcis om den vedtagne aftale med denne vinkel.',category:'indland',mode:'specific',angle:'Konsekvens for borgerne',why_now:'Aftalen er vedtaget',words:400,primary_source_required:true,opposing_view_required:true};
 assert.deepEqual(ChatCommand.parse({id:uuid,type:'order',order}),{id:uuid,type:'order',order});
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
 assert.notEqual(directWorkflowId(uuid),directWorkflowId('another-order'));
});
