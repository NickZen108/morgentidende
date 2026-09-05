import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClaims,verifyChatToken,CHAT_AUDIENCE} from '../src/v3/chat-auth';
import {paidCall,withCostContext,tokenCost,BudgetExceeded} from '../src/v3/budget';
import {licenseEvidence} from '../src/v3/photo-source';
const commit='a'.repeat(40);
const claims={iss:'https://token.actions.githubusercontent.com',aud:CHAT_AUDIENCE,repository:'NickZen108/morgentidende',repository_owner_id:'304098189',ref:'refs/heads/chatops',sub:'repo:NickZen108/morgentidende:ref:refs/heads/chatops',workflow_ref:'NickZen108/morgentidende/.github/workflows/chatops.yml@refs/heads/chatops',event_name:'push',sha:commit,iat:1000,exp:1300};
test('OIDC rejects wrong audience, repo, branch, SHA and expired identity',()=>{
 validateClaims(claims,commit,1100);
 for(const change of [{aud:'wrong'},{repository:'attacker/repo'},{ref:'refs/heads/main'},{sha:'b'.repeat(40)},{exp:1099},{workflow_ref:'wrong'},{event_name:'pull_request'}])assert.throws(()=>validateClaims({...claims,...change},commit,1100));
});
test('OIDC checks signature, not only claims',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{kid:'test'});
 const now=Math.floor(Date.now()/1000),payload={...claims,iat:now,exp:now+300};
 const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const body=encode({alg:'RS256',kid:'test'})+'.'+encode(payload);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body));
 const token=body+'.'+Buffer.from(signature).toString('base64url');
 await verifyChatToken(token,commit,[jwk]);
 await assert.rejects(verifyChatToken(body+'.'+Buffer.alloc(256).toString('base64url'),commit,[jwk]));
});
test('Openverse evidence requires the actual image reference and matching license',()=>{
 const license='https://creativecommons.org/licenses/by/4.0/',image='https://example.org/photo-original-123.jpg';
 const html='<a rel="license" href="'+license+'">CC BY</a><img src="'+image+'">';
 assert.ok(licenseEvidence(html,license,image));
 assert.equal(licenseEvidence('<a href="'+license+'">CC BY</a>',license,image),null);
 assert.equal(licenseEvidence(html,'https://creativecommons.org/licenses/by-sa/4.0/',image),null);
});
test('budget denial prevents provider calls; successful and uncertain calls are accounted',async()=>{
 const original=globalThis.fetch;let allowed=false,calls=0;const settlements:Record<string,unknown>[]=[];
 globalThis.fetch=async(input,init)=>{
  const path=String(input),body=JSON.parse(String(init?.body));
  if(path.includes('v3_reserve_cost'))return Response.json(allowed);
  if(path.includes('v3_settle_cost')){settlements.push(body);return Response.json(null);}
  throw new Error('Unexpected network');
 };
 const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'};
 try{
  await withCostContext({orderId:null,workflowId:'test'},async()=>{
   await assert.rejects(paidCall(env,'desk','test',0.1,async()=>{calls++;return {};},()=>null),BudgetExceeded);
   assert.equal(calls,0);allowed=true;
   await paidCall(env,'desk','test',0.1,async()=>{calls++;return {};},()=>({usd:0.01,usage:{input_tokens:1}}));
   assert.equal(settlements[0].p_dkk,0.125);
   await assert.rejects(paidCall(env,'media','test',0.1,async()=>{throw new Error('timeout');},()=>null));
   assert.equal(settlements[1].p_uncertain,true);assert.equal(settlements[1].p_dkk,1.25);
  });
 }finally{globalThis.fetch=original;}
});
test('cost includes input, output and web searches, missing usage is not free',()=>{
 assert.equal(tokenCost({usage:{input_tokens:1000,output_tokens:100},output:[{type:'web_search_call'}]},0.2,1.2)?.usd,0.01032);
 assert.equal(tokenCost({},0.2,1.2),null);
});
