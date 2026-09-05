import {Draft,MediaRow} from './contracts';
import {db,boundedText,ensureFamily} from './db';
import {registerIdentity,identityEligible} from './image-identity';

type Run=(model:string,input:Record<string,unknown>)=>Promise<unknown>;
type VisionResponse={response?:unknown;choices?:{message?:{content?:unknown}}[]};
type ImageBytes={bytes:Uint8Array;mime:string};
const MAX_VISION_BYTES=6_000_000;
const COMMONS_QUERY_LIMIT=8;
const COMMONS_RESULTS_PER_QUERY=12;
const COMMONS_MAX_VISION=24;
const OPENVERSE_QUERY_LIMIT=6;
const OPENVERSE_RESULTS_PER_QUERY=20;
const OPENVERSE_MAX_VISION=20;
const OPENVERSE_LICENSES=new Set(['by','by-sa','cc0','pdm']);
const STOPWORDS=new Set(['den','det','der','de','en','et','og','i','på','til','af','for','fra','med','om','som','har','er','var','bliver','blev','skal','vil','kan','ikke','nyt','nye','efter','før','mod','under','over','ved','siger','ifølge','the','a','an','and','of','to','in','on','for','from','with','after','new']);

export const cooldownEligible=(last:string|null,now=Date.now())=>last===null||Date.parse(last)<=now-10*86400000;

export function generatedPromptVariants(subject:string):string[]{
 return [
  `Editorial pencil illustration, monochrome crosshatching on cream paper. Clearly an illustration, never documentary photography. Subject: ${subject}. Show only neutral, non-documentary context relevant to the topic. No identifiable real people, no logos, no text, no photorealism.`,
  `Symbolic newspaper illustration in monochrome pencil on cream paper. Topic: ${subject}. Use generic objects, architecture, maps or abstract shapes that communicate the subject without depicting an event as fact. No identifiable people, logos, text or photorealism.`,
  `Minimal abstract editorial illustration in monochrome pencil representing the topic: ${subject}. Use only symbolic shapes and generic contextual objects, with no claim to show the actual event. No text, logos, identifiable people or photorealism.`
 ];
}

function contentWords(value:string){
 return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu,' ').split(/\s+/).filter(word=>word.length>2&&!STOPWORDS.has(word));
}

export function photoSearchQueries(article:Pick<Draft,'image_query'|'headline'|'deck'>):string[]{
 const out:string[]=[];
 const push=(value:string)=>{const clean=value.replace(/\s+/g,' ').trim().slice(0,180);if(clean.length>=3&&!out.some(x=>x.toLowerCase()===clean.toLowerCase()))out.push(clean);};
 push(article.image_query);
 const entities=[...`${article.headline} ${article.deck}`.matchAll(/\b[\p{Lu}][\p{L}\p{M}'’.-]{2,}(?:\s+[\p{Lu}][\p{L}\p{M}'’.-]{2,}){0,2}/gu)].map(match=>match[0]).filter(x=>!STOPWORDS.has(x.toLowerCase()));
 for(const entity of entities.slice(0,6))push(entity);
 const imageWords=[...new Set(contentWords(article.image_query))];
 if(imageWords.length>1)push(imageWords.slice(0,5).join(' '));
 const allWords=[...new Set([...imageWords,...contentWords(article.headline),...contentWords(article.deck)])];
 if(allWords.length>1)push(allWords.slice(0,5).join(' '));
 if(entities.length>=2)push(`${entities[0]} ${entities[1]}`);
 return out.slice(0,10);
}

async function eligible(env:Env,family:string){
 const [row]=await db<{last_used_at:string|null}[]>(env,`v3_media_families?id=eq.${encodeURIComponent(family)}`);
 return !row||cooldownEligible(row.last_used_at);
}

function base64(bytes:Uint8Array){
 let binary='';
 for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
 return btoa(binary);
}

async function fetchImageBytes(url:string):Promise<ImageBytes>{
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Morgentidende/3.0 (editorial image verification)'}});
 if(!response.ok)throw new Error(`vision_fetch_${response.status}`);
 const length=Number(response.headers.get('content-length')??0);
 if(length>MAX_VISION_BYTES)throw new Error('vision_image_size');
 const mime=(response.headers.get('content-type')??'image/jpeg').split(';')[0].trim().toLowerCase();
 if(!/^image\/(?:jpeg|png|webp|gif|bmp|svg\+xml)$/.test(mime))throw new Error('vision_content_type');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(!bytes.length||bytes.length>MAX_VISION_BYTES)throw new Error('vision_image_size');
 return {bytes,mime};
}

export function parseVisionDecision(value:unknown):boolean|null{
 if(typeof value==='boolean')return value;
 if(value&&typeof value==='object'&&'suitable' in value){
  const suitable=(value as {suitable?:unknown}).suitable;
  if(typeof suitable==='boolean')return suitable;
 }
 if(typeof value!=='string')return null;
 const text=value.trim().toUpperCase();
 if(!text)return null;
 if(/\b(?:REJECT|UNSUITABLE)\b/.test(text)||/\bNOT\s+SUITABLE\b/.test(text))return false;
 if(/\bSUITABLE\b/.test(text))return true;
 return null;
}

function visionDecision(response:VisionResponse):boolean|null{
 return parseVisionDecision(response.choices?.[0]?.message?.content)??parseVisionDecision(response.response);
}

async function visionBytes(env:Env,bytes:Uint8Array,mime:string,article:Draft):Promise<boolean|null>{
 if(!bytes.length||bytes.length>MAX_VISION_BYTES)throw new Error('vision_image_size');
 const dataUri=`data:${mime};base64,${base64(bytes)}`;
 try{
  const response=await (env.AI.run.bind(env.AI) as Run)('@cf/google/gemma-4-26b-a4b-it',{
   messages:[{role:'user',content:[
    {type:'text',text:`Judge whether this image is suitable as a contextual editorial photo or illustration for this article. It may show a named person, place, institution, object or broader topic rather than the exact event. Reject only if it is materially misleading, unrelated, unreadable or unsafe. Answer with exactly SUITABLE or REJECT. Article: ${article.headline}. ${article.deck}`},
    {type:'image_url',image_url:{url:dataUri}}
   ]}],max_completion_tokens:16,chat_template_kwargs:{enable_thinking:false}
  }) as VisionResponse;
  const decision=visionDecision(response);
  if(decision===null)console.log(JSON.stringify({event:'vision_unparseable'}));
  return decision;
 }catch(error){
  console.log(JSON.stringify({event:'vision_failed',reason:error instanceof Error?error.message:'unknown'}));
  return null;
 }
}

async function vision(env:Env,url:string,article:Draft):Promise<boolean|null>{
 const image=await fetchImageBytes(url);
 return visionBytes(env,image.bytes,image.mime,article);
}

const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').trim();
const freeCommonsLicense=(license:string)=>/^(?:CC BY(?:-SA)?(?: [1-4](?:\.0)?)?|CC0(?: 1\.0)?|Public domain)\b/i.test(license.trim());
async function sha256(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}

async function tryCommons(env:Env,article:Draft,terms:string[]):Promise<MediaRow|null>{
 let checked=0;
 const seen=new Set<number>();
 for(const query of photoSearchQueries(article).slice(0,COMMONS_QUERY_LIMIT)){
  const url=new URL('https://commons.wikimedia.org/w/api.php');
  url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:String(COMMONS_RESULTS_PER_QUERY),prop:'imageinfo',iiprop:'url|sha1|extmetadata',iiurlwidth:'1800'}).toString();
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Morgentidende/3.0 (editorial image attribution)'}});
   if(!response.ok)continue;
   const data=JSON.parse(await boundedText(response)) as {query?:{pages?:Record<string,{pageid:number;title?:string;imageinfo?:{url:string;thumburl?:string;descriptionurl:string;sha1:string;extmetadata:Record<string,{value:string}>}[]}>}};
   for(const page of Object.values(data.query?.pages??{})){
    if(seen.has(page.pageid)||checked>=COMMONS_MAX_VISION)continue;
    seen.add(page.pageid);
    const info=page.imageinfo?.[0];if(!info)continue;
    const license=plain(info.extmetadata.LicenseShortName?.value??'');
    const licenseUrl=info.extmetadata.LicenseUrl?.value??'';
    if(!freeCommonsLicense(license))continue;
    if(!licenseUrl.startsWith('https://')&&!/^Public domain$/i.test(license))continue;
    const family=`commons:${page.pageid}`;
    if(!await eligible(env,family))continue;
    const assetUrl=info.thumburl??info.url;
    let image:ImageBytes;
    try{image=await fetchImageBytes(assetUrl);}catch{continue;}
    if(image.mime!=='image/jpeg')continue;
    checked++;
    if(await visionBytes(env,image.bytes,image.mime,article)!==true)continue;
    await ensureFamily(env,family);
    const [asset]=await db<MediaRow[]>(env,'v3_media?on_conflict=original_url','POST',{
     family_id:family,content_hash:info.sha1,original_url:info.descriptionurl,url:assetUrl,
     credit:plain(info.extmetadata.Artist?.value??'Wikimedia Commons'),alt:plain(info.extmetadata.ImageDescription?.value??page.title??article.image_query).slice(0,600),
     license_documentation:{license,license_url:licenseUrl||info.descriptionurl,evidence:info.extmetadata,query,verified_at:new Date().toISOString()},
     rights_verified:true,vision_verified:true,tags:[...new Set([...terms,...contentWords(query)])],generated:false
    });
    try{const identified=await registerIdentity(env,asset);if(await identityEligible(env,identified))return identified;}catch{continue;}
   }
  }catch(error){console.log(JSON.stringify({event:'commons_search_failed',query,reason:error instanceof Error?error.message:'unknown'}));}
 }
 return null;
}

type OpenverseImage={id?:string;url?:string;thumbnail?:string;foreign_landing_url?:string;title?:string;creator?:string;creator_url?:string;license?:string;license_version?:string;license_url?:string;source?:string;provider?:string;watermarked?:boolean};
async function tryOpenverse(env:Env,article:Draft,terms:string[]):Promise<MediaRow|null>{
 let checked=0;
 const seen=new Set<string>();
 for(const query of photoSearchQueries(article).slice(0,OPENVERSE_QUERY_LIMIT)){
  const url=new URL('https://api.openverse.org/v1/images/');
  url.search=new URLSearchParams({q:query,page_size:String(OPENVERSE_RESULTS_PER_QUERY),license_type:'commercial'}).toString();
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Morgentidende/3.0 (open-license photo discovery)','Accept':'application/json'}});
   if(!response.ok)continue;
   const data=JSON.parse(await boundedText(response,500_000)) as {results?:OpenverseImage[]};
   for(const item of data.results??[]){
    if(checked>=OPENVERSE_MAX_VISION)break;
    const id=item.id??item.foreign_landing_url??item.url??'';
    if(!id||seen.has(id))continue;seen.add(id);
    const license=(item.license??'').toLowerCase();
    if(!OPENVERSE_LICENSES.has(license)||!item.license_url?.startsWith('https://')||!item.foreign_landing_url?.startsWith('http'))continue;
    if(item.watermarked===true)continue;
    const family=`openverse:${id}`;
    if(!await eligible(env,family))continue;
    let chosenUrl='';let image:ImageBytes|undefined;
    for(const candidate of [item.url,item.thumbnail]){
     if(!candidate?.startsWith('http'))continue;
     try{const fetched=await fetchImageBytes(candidate);if(fetched.mime==='image/jpeg'){chosenUrl=candidate;image=fetched;break;}}catch{continue;}
    }
    if(!image||!chosenUrl)continue;
    checked++;
    if(await visionBytes(env,image.bytes,image.mime,article)!==true)continue;
    const hash=await sha256(image.bytes);
    await ensureFamily(env,family);
    const [asset]=await db<MediaRow[]>(env,'v3_media?on_conflict=original_url','POST',{
     family_id:family,content_hash:hash,original_url:item.foreign_landing_url,url:chosenUrl,
     credit:[item.creator,item.source||item.provider].filter(Boolean).join(' / ')||'Openverse',alt:(item.title||article.image_query).slice(0,600),
     license_documentation:{license,license_version:item.license_version??null,license_url:item.license_url,creator_url:item.creator_url??null,source:item.source??null,provider:item.provider??null,discovered_via:'Openverse',query,verified_at:new Date().toISOString()},
     rights_verified:true,vision_verified:true,tags:[...new Set([...terms,...contentWords(query)])],generated:false
    });
    try{const identified=await registerIdentity(env,asset);if(await identityEligible(env,identified))return identified;}catch{continue;}
   }
  }catch(error){console.log(JSON.stringify({event:'openverse_search_failed',query,reason:error instanceof Error?error.message:'unknown'}));}
 }
 return null;
}

export async function selectMedia(env:Env,article:Draft,job:string):Promise<MediaRow>{
 const terms=[...new Set(contentWords(`${article.image_query} ${article.headline}`))];
 const archive=await db<MediaRow[]>(env,'v3_media?rights_verified=eq.true&generated=eq.false&order=usage_count_30d.asc&limit=200');
 for(const asset of archive){
  if(!asset.tags.some(tag=>terms.includes(tag.toLowerCase()))||!await eligible(env,asset.family_id))continue;
  try{
   const identified=await registerIdentity(env,asset);
   if(!await identityEligible(env,identified))continue;
   if(await vision(env,identified.url,article)!==true)continue;
   await db(env,`v3_media?id=eq.${asset.id}`,'PATCH',{vision_verified:true});
   return identified;
  }catch{continue;}
 }

 const commons=await tryCommons(env,article,terms);if(commons)return commons;
 const openverse=await tryOpenverse(env,article,terms);if(openverse)return openverse;
 console.log(JSON.stringify({event:'real_photo_exhausted',queries:photoSearchQueries(article)}));

 const prompts=generatedPromptVariants(article.image_query);
 for(let variant=0;variant<prompts.length;variant++){
  const prompt=prompts[variant];
  const key=`generated/${job}-v${variant+1}.jpg`;
  let object=await env.MEDIA_BUCKET.get(key);
  if(!object){
   const result=await env.AI.run('@cf/black-forest-labs/flux-1-schnell',{prompt,steps:4});
   if(!result.image){console.log(JSON.stringify({event:'flux_image_missing',variant:variant+1}));continue;}
   const bytes=Uint8Array.from(atob(result.image),x=>x.charCodeAt(0));
   await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});object=await env.MEDIA_BUCKET.get(key);
  }
  if(!object)continue;
  const imageBytes=new Uint8Array(await object.arrayBuffer());
  const visionResult=await visionBytes(env,imageBytes,'image/jpeg',article);
  if(visionResult===false){console.log(JSON.stringify({event:'generated_image_rejected',variant:variant+1}));continue;}
  const hash=await sha256(imageBytes);const family=`flux:${hash}`;if(!await eligible(env,family))continue;
  const publicUrl=`${env.PUBLIC_ORIGIN}/media/${key}`;await ensureFamily(env,family);
  const [asset]=await db<MediaRow[]>(env,'v3_media?on_conflict=original_url','POST',{
   family_id:family,content_hash:hash,original_url:publicUrl,url:publicUrl,credit:'AI-illustration · Morgentidende / FLUX',alt:`Illustration: ${article.image_query}`,
   license_documentation:{license:'FLUX.1-schnell Apache-2.0',license_url:'https://huggingface.co/black-forest-labs/FLUX.1-schnell/blob/main/LICENSE',evidence:{provider:'Cloudflare Workers AI',model:'@cf/black-forest-labs/flux-1-schnell',prompt,object:key,variant:variant+1},verified_at:new Date().toISOString()},
   rights_verified:true,vision_verified:visionResult===true,generated:true,tags:terms
  });
  try{const identified=await registerIdentity(env,asset);if(await identityEligible(env,identified))return identified;}catch(error){console.log(JSON.stringify({event:'generated_identity_failed',variant:variant+1,reason:error instanceof Error?error.message:'unknown'}));}
 }
 throw new Error('generated_image_variants_exhausted');
}
