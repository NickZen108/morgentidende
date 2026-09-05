import {z} from 'zod';
import {Draft,MediaRow} from './contracts';
import {db,boundedText,ensureFamily} from './db';
import {registerIdentity,identityEligible} from './image-identity';
type Run=(model:string,input:Record<string,unknown>)=>Promise<unknown>;
export const cooldownEligible=(last:string|null,now=Date.now())=>last===null||Date.parse(last)<=now-10*86400000;
async function eligible(env:Env,family:string){const [row]=await db<{last_used_at:string|null}[]>(env,`v3_media_families?id=eq.${encodeURIComponent(family)}`);return !row||cooldownEligible(row.last_used_at);}
async function vision(env:Env,url:string,article:Draft):Promise<boolean>{
 const response=await (env.AI.run.bind(env.AI) as Run)('@cf/google/gemma-4-26b-a4b-it',{messages:[{role:'user',content:[{type:'text',text:`Is this image suitable as a contextual illustration for this article? Reject misleading documentary claims, irrelevant images or unreadable graphics. Return JSON {"suitable":boolean}. Article: ${article.headline}. ${article.deck}`},{type:'image_url',image_url:{url}}]}],max_completion_tokens:400,response_format:{type:'json_object'}}) as {response?:string;choices?:{message:{content:string}}[]};
 return z.object({suitable:z.boolean()}).parse(JSON.parse(response.response??response.choices?.[0]?.message.content??'{}')).suitable;
}
const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').trim();
export async function selectMedia(env:Env,article:Draft,job:string):Promise<MediaRow>{
 const terms=article.image_query.toLowerCase().split(/\W+/).filter(x=>x.length>3);
 const archive=await db<MediaRow[]>(env,'v3_media?rights_verified=eq.true&order=usage_count_30d.asc&limit=100');
 for(const asset of archive){
  if(!asset.tags.some(tag=>terms.includes(tag))||!await eligible(env,asset.family_id))continue;
  try{
   const identified=await registerIdentity(env,asset);
   if(!await identityEligible(env,identified))continue;
   if(!await vision(env,identified.url,article))continue;
   await db(env,`v3_media?id=eq.${asset.id}`,'PATCH',{vision_verified:true});
   return identified;
  }catch{continue;}
 }
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:article.image_query,gsrnamespace:'6',gsrlimit:'5',prop:'imageinfo',iiprop:'url|sha1|extmetadata',iiurlwidth:'1600'}).toString();
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Morgentidende/3.0 (editorial image attribution)'}});
  if(!response.ok)throw new Error('commons_unavailable');
  const data=JSON.parse(await boundedText(response)) as {query?:{pages?:Record<string,{pageid:number;imageinfo?:{url:string;thumburl?:string;descriptionurl:string;sha1:string;extmetadata:Record<string,{value:string}>}[]}>}};
  for(const page of Object.values(data.query?.pages??{})){
   const info=page.imageinfo?.[0];if(!info)continue;
   const license=plain(info.extmetadata.LicenseShortName?.value??'');
   const licenseUrl=info.extmetadata.LicenseUrl?.value??'';
   if(!/^(CC BY(?:-SA)? [1-4]\.0|CC0|Public domain)$/i.test(license)||!licenseUrl.startsWith('https://'))continue;
   const family=`commons:${page.pageid}`;
   if(!await eligible(env,family))continue;
   const assetUrl=info.thumburl??info.url;
   if(!await vision(env,assetUrl,article))continue;
   await ensureFamily(env,family);
   const [asset]=await db<MediaRow[]>(env,'v3_media?on_conflict=original_url','POST',{
    family_id:family,content_hash:info.sha1,original_url:info.descriptionurl,url:assetUrl,
    credit:plain(info.extmetadata.Artist?.value??'Wikimedia Commons'),alt:plain(info.extmetadata.ImageDescription?.value??article.image_query).slice(0,600),
    license_documentation:{license,license_url:licenseUrl,evidence:info.extmetadata,verified_at:new Date().toISOString()},
    rights_verified:true,vision_verified:true,tags:terms,generated:false
   });
   try{const identified=await registerIdentity(env,asset);if(await identityEligible(env,identified))return identified;}catch{continue;}
  }
 }catch(error){console.log(JSON.stringify({event:'commons_failed',reason:error instanceof Error?error.message:'unknown'}));}
 const key=`generated/${job}.jpg`;
 let object=await env.MEDIA_BUCKET.get(key);
 if(!object){
  const result=await env.AI.run('@cf/black-forest-labs/flux-1-schnell',{prompt:`Editorial pencil illustration, monochrome crosshatching on cream paper. Clearly an illustration, never documentary photography. No text. Subject: ${article.image_query}`,steps:4});
  if(!result.image)throw new Error('flux_image_missing');
  const bytes=Uint8Array.from(atob(result.image),x=>x.charCodeAt(0));
  await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  object=await env.MEDIA_BUCKET.get(key);
 }
 if(!object)throw new Error('generated_image_missing');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await object.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const family=`flux:${hash}`;
 const publicUrl=`${env.PUBLIC_ORIGIN}/media/${key}`;
 if(!await vision(env,publicUrl,article))throw new Error('generated_image_rejected');
 await ensureFamily(env,family);
 const [asset]=await db<MediaRow[]>(env,'v3_media?on_conflict=original_url','POST',{
  family_id:family,content_hash:hash,original_url:publicUrl,url:publicUrl,credit:'AI-illustration · Morgentidende / FLUX',alt:`Illustration: ${article.image_query}`,
  license_documentation:{license:'FLUX.1-schnell Apache-2.0',license_url:'https://huggingface.co/black-forest-labs/FLUX.1-schnell/blob/main/LICENSE',evidence:{provider:'Cloudflare Workers AI',model:'@cf/black-forest-labs/flux-1-schnell',prompt:article.image_query,object:key},verified_at:new Date().toISOString()},
  rights_verified:true,vision_verified:true,generated:true,tags:terms
 });
 const identified=await registerIdentity(env,asset);
 if(!await identityEligible(env,identified))throw new Error('generated_image_identity_cooldown');
 return identified;
}
