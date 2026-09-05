import {boundedText} from './db';
const ISSUER='https://token.actions.githubusercontent.com';
export const CHAT_AUDIENCE='morgentidende-v3-chatops';
const REPO='NickZen108/morgentidende';
export class ChatAuthError extends Error {constructor(){super('chatops_unauthorized');}}
function decode(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));}
export function validateClaims(c:Record<string,unknown>,commit:string,now=Date.now()/1000){
 if(c.iss!==ISSUER||c.aud!==CHAT_AUDIENCE||c.repository!==REPO||c.repository_owner_id!=='304098189'||
 c.ref!=='refs/heads/chatops'||c.sub!=='repo:NickZen108@304098189/morgentidende@1357364514:ref:refs/heads/chatops'||
 c.workflow_ref!==`${REPO}/.github/workflows/chatops.yml@refs/heads/chatops`||
 c.event_name!=='push'||c.sha!==commit||typeof c.exp!=='number'||typeof c.iat!=='number'||
 c.exp<=now||c.iat>now+30||c.iat<now-600||c.exp-c.iat>600||
 (typeof c.nbf==='number'&&c.nbf>now+30))throw new ChatAuthError();
}
export async function verifyChatToken(token:string,commit:string,keys?:JsonWebKey[]){
 try{
  if(token.length>16000||!token||!/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(token))throw new ChatAuthError();
  const [h,p,s]=token.split('.');
  const header=JSON.parse(new TextDecoder().decode(decode(h)));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw new ChatAuthError();
  const claims=JSON.parse(new TextDecoder().decode(decode(p)));
  validateClaims(claims,commit);
  if(!keys){
   const response=await fetch(ISSUER+'/.well-known/jwks',{signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new ChatAuthError();
   keys=JSON.parse(await boundedText(response,64000)).keys;
  }
  const jwk=keys?.find(k=>(k as JsonWebKey&{kid?:string}).kid===header.kid);
  if(!jwk||jwk.kty!=='RSA')throw new ChatAuthError();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(s),new TextEncoder().encode(h+'.'+p)))throw new ChatAuthError();
 }catch{throw new ChatAuthError();}
}
