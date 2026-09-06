import {DirectAsset,DirectBlock} from './contracts';
import {db,ensureFamily,BoundedTextError,rpc} from './db';
import {readBytes} from './photo-source';
import {identifyBytes} from './image-identity';

const MAX_SOURCE_BYTES=12_000_000;
const ccLicense=(url:string|undefined)=>!!url&&/^https:\/\/creativecommons\.org\/(?:licenses|publicdomain)\//i.test(url);

function validateRights(asset:DirectAsset){
 if((asset.rights_basis==='cc'||asset.rights_basis==='public_domain')&&!ccLicense(asset.license_url))throw new Error('direct_media_license_required');
 if(asset.rights_basis==='publisher_permission'&&!asset.source_url)throw new Error('direct_media_permission_source_required');
}
function decodeBase64(value:string){
 const binary=atob(value);const out=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;
}
async function sourceBytes(asset:DirectAsset){
 if('data_base64' in asset)return {bytes:decodeBase64(asset.data_base64),mime:asset.mime,original:`chat-upload:${crypto.randomUUID()}`};
 const response=await fetch(asset.url,{headers:{'User-Agent':'Morgentidende/3.0 direct publisher'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`direct_media_fetch_${response.status}`);
 const mime=(response.headers.get('content-type')??'').split(';')[0].toLowerCase();
 if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(mime))throw new Error('direct_media_format');
 return {bytes:await readBytes(response,MAX_SOURCE_BYTES),mime,original:asset.source_url??asset.url};
}
async function transform(env:Env,bytes:Uint8Array,role:'hero-desktop'|'hero-mobile'|'inline'){
 const input=env.IMAGES.input(new Response(Uint8Array.from(bytes)).body!);
 const spec=role==='hero-desktop'?{width:1600,height:900,fit:'cover' as const}:role==='hero-mobile'?{width:800,height:450,fit:'cover' as const}:{width:1400,height:1400,fit:'scale-down' as const};
 const output=await input.transform(spec).output({format:'image/jpeg',quality:role==='inline'?88:82,anim:false});
 return readBytes(output.response(),4_000_000);
}
export type PublishedAsset={id:string;url:string;original_url:string;alt:string;credit:string;license_documentation:Record<string,unknown>;variants:Record<string,string>};
async function processAsset(env:Env,asset:DirectAsset,role:'hero'|'inline'):Promise<PublishedAsset>{
 validateRights(asset);
 const source=await sourceBytes(asset);
 const desktop=await transform(env,source.bytes,role==='hero'?'hero-desktop':'inline');
 const identity=await identifyBytes(desktop);
 const family=`direct:${identity.hash}`;
 await ensureFamily(env,family);
 const desktopKey=`direct/${identity.hash}/${role==='hero'?'1600x900':'1400'}.jpg`;
 await env.MEDIA_BUCKET.put(desktopKey,desktop,{httpMetadata:{contentType:'image/jpeg',cacheControl:'public,max-age=31536000,immutable'}});
 const variants:Record<string,string>={desktop:`${env.PUBLIC_ORIGIN}/media/${desktopKey}`};
 if(role==='hero'){
  const mobile=await transform(env,source.bytes,'hero-mobile');
  const mobileKey=`direct/${identity.hash}/800x450.jpg`;
  await env.MEDIA_BUCKET.put(mobileKey,mobile,{httpMetadata:{contentType:'image/jpeg',cacheControl:'public,max-age=31536000,immutable'}});
  variants.mobile=`${env.PUBLIC_ORIGIN}/media/${mobileKey}`;
 }
 const license_documentation={direct_chat:true,rights_basis:asset.rights_basis,license:asset.license,license_url:asset.license_url??null,evidence:asset.source_url??('url' in asset?asset.url:'chat-upload'),verified_at:new Date().toISOString()};
 const original_url=source.original;
 const [row]=await db<{id:string}[]>(env,'v3_media?on_conflict=content_hash','POST',{
  family_id:family,content_hash:identity.hash,original_url,url:variants.desktop,credit:asset.credit,alt:asset.alt,
  license_documentation,rights_verified:true,vision_verified:false,generated:asset.rights_basis==='user_owned',tags:['direct-chat',role],variants
 });
 if(!row)throw new Error('direct_media_insert_failed');
 await rpc(env,'v3_register_identity',{p_media:row.id,p_hash:identity.hash,p_fingerprints:identity.fingerprints});
 return {id:row.id,url:variants.desktop,original_url,alt:asset.alt,credit:asset.credit,license_documentation,variants};
}
async function processBlocks(env:Env,blocks:DirectBlock[]|undefined,paragraphs:string[]){
 const input=blocks??paragraphs.map(text=>({type:'paragraph' as const,text}));
 const out:unknown[]=[];
 for(const block of input){
  if(block.type==='paragraph'||block.type==='subheading'){out.push(block);continue;}
  const media=await processAsset(env,block.asset,'inline');
  out.push({type:block.type,asset:{...media,caption:block.asset.caption??null}});
 }
 return out;
}
export async function publishDirect(env:Env,command:{id:string;article:{headline:string;deck:string;paragraphs:string[];blocks?:DirectBlock[];category:string;source_urls:string[]};slot:string;hero:DirectAsset}){
 const key=`chatops:direct-v2:${command.id}`;
 let [order]=await db<{id:string;status:string}[]>(env,`v3_orders?dedupe_key=eq.${encodeURIComponent(key)}&limit=1`);
 if(!order){
  [order]=await db<{id:string;status:string}[]>(env,'v3_orders','POST',{dedupe_key:key,original_order:{kind:'direct_article_v2',article:command.article,slot:command.slot,submitted_at:new Date().toISOString()}});
  if(!order)throw new Error('direct_order_insert_failed');
 }
 const existing=await db<{slug:string;headline:string}[]>(env,`v3_articles?order_id=eq.${order.id}&select=slug,headline&limit=1`);
 if(existing[0])return {status:'published',order_id:order.id,headline:existing[0].headline,article_url:`${env.PUBLIC_ORIGIN}/artikel/${existing[0].slug}`};
 await db(env,`v3_orders?id=eq.${order.id}`,'PATCH',{status:'running'});
 try{
  const hero=await processAsset(env,command.hero,'hero');
  const blocks=await processBlocks(env,command.article.blocks,command.article.paragraphs);
  const sources=command.article.source_urls.map(url=>({url,title:url,publisher:new URL(url).hostname,kind:'secondary',retrieved_at:new Date().toISOString(),facts:['Kilde angivet i den direkte publiceringspakke.'],quotes:[]}));
  const articleId=await rpc<string>(env,'v3_publish_direct',{p_order:order.id,p_media:hero.id,p_slot:command.slot,p_article:{headline:command.article.headline,deck:command.article.deck,paragraphs:command.article.paragraphs,blocks,category:command.article.category,sources}});
  const [article]=await db<{slug:string;headline:string}[]>(env,`v3_articles?id=eq.${articleId}&select=slug,headline&limit=1`);
  return {status:'published',order_id:order.id,article_id:articleId,headline:article?.headline??command.article.headline,slot:command.slot,hero:{url:hero.url,variants:hero.variants},article_url:`${env.PUBLIC_ORIGIN}/artikel/${article?.slug??order.id}`};
 }catch(error){await db(env,`v3_orders?id=eq.${order.id}`,'PATCH',{status:'failed',error_code:'direct_publish_failed'});throw error;}
}
