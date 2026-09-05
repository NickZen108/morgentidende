export interface DatabaseEnv { SUPABASE_URL:string; SUPABASE_SERVICE_ROLE_KEY:string }
export async function boundedText(response:Response|Request,limit=2_000_000):Promise<string>{
 if(!response.body) return '';
 const reader=response.body.getReader(); const decoder=new TextDecoder(); let size=0;let text='';
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('response_too_large');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel();}
}
export async function db<T>(env:DatabaseEnv,path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:`return=representation${path.includes('on_conflict=')?',resolution=merge-duplicates':''}`},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const text=await boundedText(res);
 if(!res.ok)throw new Error(`database_${res.status}:${text.slice(0,300)}`);
 return (text?JSON.parse(text):null) as T;
}
export const rpc=<T>(env:DatabaseEnv,name:string,body:unknown={})=>db<T>(env,`rpc/${name}`,'POST',body);
export async function ensureFamily(env:DatabaseEnv,id:string){
 const res=await fetch(`${env.SUPABASE_URL}/rest/v1/v3_media_families?on_conflict=id`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({id}),signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error('family_insert_failed');
}
