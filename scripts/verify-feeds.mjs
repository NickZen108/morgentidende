import fs from 'node:fs';
import {XMLParser} from 'fast-xml-parser';
const feeds=JSON.parse(fs.readFileSync('config/scan-feeds.json','utf8'));
const results=[];
for(let i=0;i<feeds.length;i+=8){
 const batch=await Promise.all(feeds.slice(i,i+8).map(async feed=>{
  try{
   const response=await fetch(feed.url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Morgentidende/3.0 RSS verification'}});
   if(!response.ok)return {...feed,ok:false,status:response.status};
   const reader=response.body.getReader();let text='';let size=0;const decoder=new TextDecoder();
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new Error('oversize');text+=decoder.decode(value,{stream:true});}}finally{await reader.cancel();}
   const xml=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(text);
   const entries=xml.rss?.channel?.item??xml.feed?.entry??xml['rdf:RDF']?.item;
   return {...feed,ok:Boolean(xml.rss?.channel||xml.feed||xml['rdf:RDF']?.channel),status:response.status,entries:entries?(Array.isArray(entries)?entries.length:1):0,final_url:response.url};
  }catch(e){return {...feed,ok:false,error:e.message};}
 }));results.push(...batch);
}
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/scan-feeds.json',JSON.stringify({checked_at:new Date().toISOString(),configured:results.length,healthy:results.filter(r=>r.ok).length,results},null,2));
console.log(JSON.stringify({configured:results.length,healthy:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).map(r=>({publisher:r.publisher,status:r.status,error:r.error}))}));
