import test from 'node:test';
import assert from 'node:assert/strict';
import {groundedReview,publicSourceUrl} from '../src/v3/claim-evidence';
const text='Indekset steg med 450% i perioden.';
const source={url:'https://example.org/report',available:true,text:'The index rose by 450% during the period.',retrieved_at:'2026-09-06',sha256:'abc'};
const article={headline:'Indeks stiger',deck:'En dokumenteret stigning',paragraphs:[text]};
const assessment={matches_order:true,headline_correct:true,order_mismatch_quote:'',reason:'OK',slot:'lead' as const,claims:[{id:'one',text,status:'supported' as const,source_url:source.url,source_quote:source.text,reason:'Same index and period'}]};
test('retrieved support is required; metadata and invented article claims cannot prove facts',()=>{
 assert.equal(groundedReview(assessment,article,[source]).evidence_status,'verified');
 assert.equal(groundedReview(assessment,article,[]).evidence_status,'unresolved');
 const wrong={...assessment,claims:[{...assessment.claims[0],text:'En helt anden påstand som ikke står i artiklen.'}]};
 assert.equal(groundedReview(wrong,article,[source]).serious_error,false);
 assert.equal(groundedReview(wrong,article,[source]).evidence_status,'unresolved');
});
test('unsupported headline doubts pause, and prior unresolved claims cannot disappear',()=>{
 assert.equal(groundedReview({...assessment,headline_correct:false},article,[source]).evidence_status,'unresolved');
 assert.equal(groundedReview(assessment,article,[source],[{id:'missing',text:'Another required claim'}]).evidence_status,'unresolved');
});
test('external evidence URLs reject private IPs, credentials, insecure and local hosts',()=>{
 for(const url of ['http://example.org','https://127.0.0.1','https://[::1]','https://localhost','https://a.internal','https://user:secret@example.org','https://example.org:8443'])assert.equal(publicSourceUrl(url),false,url);
 assert.equal(publicSourceUrl('https://www.reuters.com/world/report'),true);
});
