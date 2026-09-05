import fs from 'node:fs/promises';
const audience='morgentidende-v3-chatops';
const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
url.searchParams.set('audience',audience);
const auth=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
if(!auth.ok)throw new Error('GitHub identity unavailable');
const {value:token}=await auth.json();
if(!token)throw new Error('GitHub identity missing');
console.log('::add-mask::'+token);
const body=await fs.readFile('.chatops/command.json','utf8');
for(let attempt=0;attempt<4;attempt++){
 const response=await fetch('https://morgentidende-v3.nicolaipetersen108.workers.dev/api/chatops/dispatch',{
  method:'POST',headers:{'Content-Type':'application/json','X-Morgentidende-Commit':process.env.GITHUB_SHA,Authorization:'Bearer '+token},
  body,signal:AbortSignal.timeout(60000)
 });
 const text=await response.text();
 if(response.ok){console.log(text);break;}
 if(response.status<500||attempt===3)throw new Error('Dispatch failed: '+response.status+' '+text);
 await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
}
