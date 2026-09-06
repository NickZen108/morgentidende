import {z} from 'zod';
import {Slot,ClaimMetadata} from './contracts';

export const Assessment=z.object({
 matches_order:z.boolean(),headline_correct:z.boolean(),
 order_mismatch_quote:z.string().max(600),reason:z.string().max(800),slot:Slot,
 claims:z.array(z.object({id:z.string().max(50),text:z.string().min(5).max(600),status:z.enum(['supported','contradicted','unresolved']),source_url:z.string().max(2000),source_quote:z.string().max(800),reason:z.string().max(400)})).min(1).max(12)
});
export type Snapshot={url:string;retrieved_at:string;text:string;sha256:string;available:boolean};
export const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
export function groundedReview(assessment:z.infer<typeof Assessment>,article:{headline:string;deck:string;paragraphs:string[];claims?:ClaimMetadata[]},snapshots:Snapshot[],previous: {id:string;text:string}[]=[]){
 const articleText=normalize([article.headline,article.deck,...article.paragraphs].join(' '));
 const required=new Map([...previous,...article.claims??[]].map(c=>[c.id,c.text]));
 const checks=assessment.claims.map(c=>{
  const expected=required.get(c.id);
  const source=snapshots.find(s=>s.url===c.source_url&&s.available);
  const grounded=(!expected||normalize(expected)===normalize(c.text))&&articleText.includes(normalize(c.text))&&!!source&&normalize(c.source_quote).length>=20&&normalize(source.text).includes(normalize(c.source_quote));
  return {...c,status:grounded?c.status:'unresolved' as const,source_verified:grounded,source_retrieved_at:source?.retrieved_at??null,source_sha256:source?.sha256??null,reason:grounded?c.reason:'Påstanden eller kildepassagen kunne ikke verificeres i det hentede materiale.'};
 });
 for(const [id,text] of required){if(!checks.some(c=>c.id===id&&normalize(c.text)===normalize(text)))checks.push({id,text,status:'unresolved',source_url:'',source_quote:'',reason:'Påstanden mangler en vurdering.',source_verified:false,source_retrieved_at:null,source_sha256:null});}
 const contradicted=checks.some(c=>c.status==='contradicted');
 const orderMismatch=!assessment.matches_order&&normalize(assessment.order_mismatch_quote).length>=20&&articleText.includes(normalize(assessment.order_mismatch_quote));
 const unresolved=checks.some(c=>c.status==='unresolved')||(!assessment.headline_correct&&!contradicted)||(!assessment.matches_order&&!orderMismatch);
 // An unsupported allegation cannot trigger rejection or a fresh article attempt.
 return {matches_order:assessment.matches_order,headline_correct:assessment.headline_correct,serious_error:!unresolved&&(contradicted||orderMismatch),reason:unresolved?'Afventer kildekontrol: '+checks.filter(c=>c.status==='unresolved').map(c=>c.text).join('; ').slice(0,800):assessment.reason,slot:assessment.slot,evidence_status:unresolved?'unresolved' as const:'verified' as const,verification_version:1,claim_checks:checks};
}

export function publicSourceUrl(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)&&!/(^|\.)(localhost|local|internal|test|invalid)$/i.test(u.hostname);}catch{return false;}
}
export async function fetchSnapshot(url:string):Promise<Snapshot>{
 const empty={url,retrieved_at:new Date().toISOString(),text:'',sha256:'',available:false};
 if(!publicSourceUrl(url))return empty;
 try{
  let target=url;let response:Response|undefined;
  for(let redirects=0;redirects<=3;redirects++){
   response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html,text/plain','User-Agent':'Morgentidende/3 source-verification'}});
   if(response.status>=300&&response.status<400){const next=new URL(response.headers.get('location')??'',target).href;await response.body?.cancel();if(!publicSourceUrl(next))return empty;target=next;continue;}break;
  }
  if(!response?.ok||!response.body||!/text\/(html|plain)/i.test(response.headers.get('content-type')??''))return empty;
  const reader=response.body.getReader(),decoder=new TextDecoder();let raw='',bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>500000)break;raw+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel();}
  const text=normalize(raw.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'"));
  // Persist a bounded source snapshot. A missing passage is unresolved, never disproved.
  const bounded=text.slice(0,12000);
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bounded)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return {...empty,text:bounded,sha256,available:bounded.length>30};
 }catch{return empty;}
}
