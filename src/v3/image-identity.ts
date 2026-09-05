import jpeg from 'jpeg-js';
import {imageFingerprints} from './image-fingerprint';
import {db,rpc} from './db';
import type {MediaRow} from './contracts';
export async function identifyImage(env:Env,url:string):Promise<{hash:string;fingerprints:string[];bytes:Uint8Array}>{
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)throw new Error('identity_image_unavailable');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>4_000_000)throw new Error('identity_image_too_large');chunks.push(part.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 // Unsupported formats are rejected, never treated as a new photo by default.
 const pixels=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:48,tolerantDecoding:false});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {hash,fingerprints:imageFingerprints(pixels),bytes};
}
export async function registerIdentity(env:Env,asset:MediaRow):Promise<MediaRow>{
 const identity=await identifyImage(env,asset.url);
 const key=`verified/${identity.hash}.jpg`;
 await env.MEDIA_BUCKET.put(key,identity.bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const url=`${env.PUBLIC_ORIGIN}/media/${key}`;
 const family=await rpc<string>(env,'v3_register_identity',{p_media:asset.id,p_hash:identity.hash,p_fingerprints:identity.fingerprints});
 await db(env,`v3_media?id=eq.${asset.id}`,'PATCH',{url});
 return {...asset,family_id:family,url};
}
export async function identityEligible(env:Env,asset:MediaRow){
 return rpc<boolean>(env,'v3_identity_eligible',{p_media:asset.id});
}
