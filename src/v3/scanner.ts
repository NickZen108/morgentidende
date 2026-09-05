import {XMLParser} from 'fast-xml-parser';
import {boundedText} from './db';
import feeds from '../../config/scan-feeds.json';
import {diverseSignals} from './signal-selection';
export interface FeedItem {url:string;title:string;published:number;publisher:string}
export function canonical(raw:string){const u=new URL(raw);for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||['fbclid','gclid'].includes(k))u.searchParams.delete(k);u.hash='';return u.toString();}
export function parseFeed(xml:string,publisher:string,now=Date.now()):FeedItem[]{
 const parsed=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(xml);
 if(!parsed.rss?.channel&&!parsed.feed&&!parsed['rdf:RDF']?.channel)throw new Error('not_rss_or_atom');
 const items=parsed.rss?.channel?.item??parsed.feed?.entry??parsed['rdf:RDF']?.item??[];
 return (Array.isArray(items)?items:[items]).flatMap((item:Record<string,unknown>)=>{
  const links=Array.isArray(item.link)?item.link:[item.link];
  const link=links.find(x=>typeof x==='string'||x?.['@_rel']==='alternate')??links[0];
  const url=typeof link==='string'?link:link?.['@_href'];
  const title=typeof item.title==='string'?item.title:(item.title as Record<string,string>)?.['#text'];
  const published=Date.parse(String(item.pubDate??item.published??item.updated??item['dc:date']??''));
  if(!url||!title||!Number.isFinite(published)||published<now-2*3600000||published>now+300000)return [];
  try{const normalized=canonical(url);if(!/^https?:\/\//.test(normalized))return [];return [{url:normalized,title:title.slice(0,400),published,publisher}];}catch{return [];}
 });
}
export function fingerprint(title:string){return title.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>3).sort().join(' ');}
export function similarHeadlines(a:string,b:string){
 const left=new Set(fingerprint(a).split(' ').filter(Boolean)),right=new Set(fingerprint(b).split(' ').filter(Boolean));
 const shared=[...left].filter(x=>right.has(x)).length;
 return shared>=3&&shared/(left.size+right.size-shared)>=0.55;
}
export default {
 async scheduled(_event,env,ctx){ctx.waitUntil(scan(env));},
 async fetch(){return Response.json({ok:true,service:'scan',configured_publishers:feeds.length});}
} satisfies ExportedHandler<ScanEnv>;
async function scan(env:ScanEnv){
 await env.SCAN_DB.exec('CREATE TABLE IF NOT EXISTS seen(url TEXT PRIMARY KEY, title TEXT NOT NULL, publisher TEXT NOT NULL, observed INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS feed_health(publisher TEXT PRIMARY KEY, checked INTEGER, ok INTEGER, items INTEGER); CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY, payload TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);');
 const now=Date.now();let items:FeedItem[]=[];
 for(let i=0;i<feeds.length;i+=6){
  const batch=await Promise.allSettled(feeds.slice(i,i+6).map(async feed=>{
   try{const response=await fetch(feed.url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Morgentidende/3.0 RSS'}});if(!response.ok)throw new Error('feed_http_error');const found=parseFeed(await boundedText(response),feed.publisher,now);await env.SCAN_DB.prepare('INSERT OR REPLACE INTO feed_health VALUES(?,?,?,?)').bind(feed.publisher,now,1,found.length).run();return found;}
   catch{await env.SCAN_DB.prepare('INSERT OR REPLACE INTO feed_health VALUES(?,?,?,?)').bind(feed.publisher,now,0,0).run();return [];}
  }));
  for(const result of batch)if(result.status==='fulfilled')items.push(...result.value);
 }
 for(const item of items){await env.SCAN_DB.prepare('INSERT OR IGNORE INTO seen VALUES(?,?,?,?)').bind(item.url,item.title,item.publisher,now).run();}
 const recent=await env.SCAN_DB.prepare('SELECT * FROM seen WHERE observed>=?').bind(now-1800000).all<{url:string;title:string;publisher:string;observed:number}>();
 const groups=new Map<string,typeof recent.results>();
 for(const item of recent.results){const key=[...groups.keys()].find(k=>similarHeadlines(k,item.title))??fingerprint(item.title);if(!key)continue;const group=groups.get(key)??[];group.push(item);groups.set(key,group);}
 for(const [key,group] of groups){
  const publishers=new Set(group.map(x=>x.publisher));
  // Independent local reporting must reach the chief even without corroborating headlines.
  // Source count is context, never a prerequisite for an editorial signal.
  if(!group.some(x=>x.observed===now))continue;
  const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${new Date(now).toISOString().slice(0,10)}:${key}`)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  await env.SCAN_DB.prepare('INSERT OR IGNORE INTO signals(id,payload) VALUES(?,?)').bind(id,JSON.stringify({id,headlines:group.slice(0,5).map(x=>x.title),sources:group.slice(0,12).map(x=>({publisher:x.publisher,url:x.url})),publisher_count:publishers.size,first_seen:Math.min(...group.map(x=>x.observed)),last_seen:Math.max(...group.map(x=>x.observed))})).run();
 }
 await env.SCAN_DB.prepare("DELETE FROM signals WHERE json_extract(payload,'$.last_seen')<?").bind(now-2*3600000).run();
 const pending=await env.SCAN_DB.prepare('SELECT id,payload FROM signals WHERE delivered=0').all<{id:string;payload:string}>();
 const selected=diverseSignals(pending.results,new Map(feeds.map(feed=>[feed.publisher,feed.country])),Math.floor(now/900000));
 for(const signal of selected){
  if(JSON.parse(signal.payload).last_seen<now-2*3600000){await env.SCAN_DB.prepare('UPDATE signals SET delivered=1 WHERE id=?').bind(signal.id).run();continue;}
  try{const response=await env.NEWSROOM.fetch('https://internal/internal/signal',{method:'POST',body:signal.payload});if(response.ok)await env.SCAN_DB.prepare('UPDATE signals SET delivered=1 WHERE id=?').bind(signal.id).run();}catch{console.log(JSON.stringify({event:'signal_delivery_failed',id:signal.id}));}
 }
 await env.SCAN_DB.prepare('DELETE FROM seen WHERE observed<?').bind(now-3*86400000).run();
 console.log(JSON.stringify({event:'scan_complete',configured:feeds.length,items:items.length,signals:selected.length}));
}
