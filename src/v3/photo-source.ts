import {boundedText} from './db';
import {paidCall} from './budget';
export type ImageBytes={bytes:Uint8Array;mime:string};
export async function readBytes(response:Response,limit=6_000_000){
 if(!response.ok||!response.body)throw new Error('image_fetch_failed');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit)throw new Error('image_too_large');chunks.push(part.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function normalizePhoto(env:Env,source:ImageBytes):Promise<ImageBytes>{
 if(source.mime==='image/jpeg'&&source.bytes.length<3_000_000)return source;
 if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(source.mime))throw new Error('unsupported_photo_format');
 const bytes=await paidCall(env,'media-transform','cloudflare-images',0.0005,async()=>{
  const output=await env.IMAGES.input(new Response(Uint8Array.from(source.bytes)).body!).transform({width:1600,height:1200,fit:'scale-down'}).output({format:'image/jpeg',quality:85,anim:false});
  return readBytes(output.response(),4_000_000);
 },()=>({usd:0.0005,usage:{transformations:1}}));
 return {bytes,mime:'image/jpeg'};
}
const normalize=(url:string)=>url.replace(/^http:/,'https:').replace(/\/$/,'').toLowerCase();
export function licenseEvidence(html:string,licenseUrl:string,imageUrl:string){
 const expected=normalize(licenseUrl);
 if(!/^https:\/\/creativecommons.org\/(licenses|publicdomain)\//.test(expected))return null;
 const links=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi)];
 const found=links.find(m=>normalize(m[1])===expected);
 const basename=new URL(imageUrl).pathname.split('/').pop()??'';
 // A generic footer license alone is insufficient: require a reference to this image.
 if(!found||basename.length<8||!html.includes(basename))return null;
 return {license_url:licenseUrl,license_excerpt:found[0].slice(0,1600),image_url:imageUrl};
}
export async function verifySourceLicense(landing:string,license:string,image:string){
 const response=await fetch(landing,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Morgentidende/3.0 (license verification)'}});
 if(!response.ok)return null;
 const html=await boundedText(response,2_000_000);
 const evidence=licenseEvidence(html,license,image);if(!evidence)return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 return {...evidence,source_url:response.url||landing,source_sha256:hash,verified_at:new Date().toISOString()};
}
