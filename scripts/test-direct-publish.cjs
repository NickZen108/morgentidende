const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const snapshot={files:new Proxy({}, {get:(_,file)=>fs.readFileSync(path.join(root,file),'utf8')})};
function load(file,mocks={},cache={}){
 if(cache[file])return cache[file].exports;
 const source=snapshot.files[file];if(!source)throw new Error('Missing source '+file);
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};cache[file]=module;
 const req=name=>name in mocks?mocks[name]:name.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),name))+'.ts',mocks,cache):name.startsWith('node:')?require(name):require(name);
 new Function('require','module','exports',output)(req,module,module.exports);return module.exports;
}
const {ChatCommand,DirectAsset}=load('src/v3/contracts.ts');
const base={id:'48d7a8d3-09a2-4fbe-97cf-3204a3b68bb5',type:'publish_article',slot:'lead',hero:{url:'https://upload.wikimedia.org/photo.jpg',rights_basis:'cc',license:'CC BY-SA 2.0',license_url:'https://creativecommons.org/licenses/by-sa/2.0/',credit:'Photographer',alt:'Photo'},article:{headline:'A complete approved article',deck:'A complete approved deck',paragraphs:['First paragraph','Second paragraph'],category:'indland',image_query:'Unused',source_urls:[]}};
const results=[];
async function probe(name,fn){await fn();results.push(name);console.log('CONFIRMED '+name);}
function fixture(options={}){
 let order=null,published=null;const calls=[],writes=[],puts=[];
 const db={
  ensureFamily:async()=>{},
  async db(env,p,method='GET',body){
   calls.push(['db',p,method]);
   if(p.startsWith('v3_orders?dedupe_key'))return order?[order]:[];
   if(p==='v3_orders'){order={id:'test-order',status:'pending'};return [order];}
   if(p.startsWith('v3_orders?')&&method==='PATCH'){if(p.includes('status=neq.published')&&order.status==='published')return [];writes.push(body);Object.assign(order,body);return [];}
   if(p.startsWith('v3_articles?order_id'))return published?[published]:[];
   if(p.startsWith('v3_articles?id=')){if(options.failReadback)throw new Error('database_readback_failed');return published?[published]:[];}
   if(p.startsWith('v3_media?')){writes.push(body);return [{id:'media-'+body.content_hash}];}
   throw new Error('Unexpected DB '+p);
  },
  async rpc(env,name,body){calls.push(['rpc',name,body]);if(name==='v3_register_identity')return 'family';if(name==='v3_publish_direct'){if(options.failPublish)throw new Error('database_publish_failed');published={id:'article',slug:'test-order',headline:base.article.headline};order.status='published';return 'article';}throw new Error('Unexpected RPC '+name);}
 };
 const {readBytes}=load('src/v3/photo-source.ts',{'./budget':{paidCall:()=>{throw new Error('Unexpected paid call');}}});
 const {publishDirect}=load('src/v3/direct-publish.ts',{'./db':db,'./photo-source':{readBytes},'./image-identity':{identifyBytes:async bytes=>({hash:Buffer.from(bytes).toString('hex'),fingerprints:['01'.repeat(32)]})}});
 const env={PUBLIC_ORIGIN:'https://paper.test',AI:{run(){throw new Error('AI called');}},CHIEF:{create(){throw new Error('Chief called');}},PRODUCTION:{create(){throw new Error('Production called');}},MEDIA_BUCKET:{async put(key,bytes){puts.push(key);if(options.failR2)throw new Error('R2 failed');}},IMAGES:{input(body){return {transform(spec){calls.push(['transform',spec]);return {async output(){return {response:()=>new Response(Uint8Array.of(spec.width===1400?2:1),{headers:{'Content-Type':'image/jpeg'}})}}};}};}}};
 return {run:command=>publishDirect(env,ChatCommand.parse(command??base)),calls,writes,puts,get order(){return order;}};
}
(async()=>{
 const saved=globalThis.fetch;let fetches=[];
 globalThis.fetch=async(url,init)=>{fetches.push({url,init});return new Response(Uint8Array.of(1,2,3),{headers:{'Content-Type':'image/jpeg'}});};
 try{
  await probe('private and external addresses rejected before fetching',async()=>{
   for(const url of ['http://127.0.0.1/internal','https://localhost/x','https://evil.test/x','https://upload.wikimedia.org.evil.test/x','https://user:password@upload.wikimedia.org/x','https://paper.test/admin']){
    fetches=[];await assert.rejects(fixture().run({...base,hero:{...base.hero,url}}),/direct_media_url_not_allowed/);assert.equal(fetches.length,0);
   }
   await fixture().run();assert.equal(fetches[0].init.redirect,'error');
  });
  await probe('ownership does not imply generated, explicit generated value persists',async()=>{
   for(const generated of [false,true]){const f=fixture();await f.run({...base,hero:{...base.hero,rights_basis:'user_owned',generated}});assert.equal(f.writes.find(w=>w.content_hash).generated,generated);}
   assert.equal(DirectAsset.parse({...base.hero,rights_basis:'user_owned'}).generated,undefined);
   const legacy=fixture();await legacy.run({...base,hero:{...base.hero,rights_basis:'user_owned'}});assert.equal(legacy.writes.find(w=>w.content_hash).generated,false);
   assert.deepEqual(ChatCommand.parse(base),base);
  });
  await probe('hero remains mandatory',async()=>{const {hero,...command}=base;assert.equal(ChatCommand.safeParse(command).success,false);});
  await probe('sequential retry does not transform images again',async()=>{const f=fixture();await f.run();const count=f.puts.length;await f.run();assert.equal(f.puts.length,count);});
  await probe('readback failure preserves committed publication',async()=>{const f=fixture({failReadback:true});await assert.rejects(f.run(),/readback/);assert.equal(f.order.status,'published');});
  await probe('caption and photographer are both visible',async()=>{
   const app=snapshot.files['public/app.js'];const part=app.slice(app.indexOf('function caption('),app.indexOf('function card('));
   const el=(tag,text)=>({tag,text,children:[],append(...items){this.children.push(...items);}});
   const caption=new Function('el','safeUrl','document',part+';return caption;')(el,x=>x,{createTextNode:x=>x});
   const rendered=JSON.stringify(caption({caption:'Descriptive caption',credit:'Photographer'}));assert.match(rendered,/Descriptive caption/);assert.match(rendered,/Photographer/);
  });
  await probe('old navigation cannot overwrite new article or show stale error',async()=>{
   for(const failOld of [false,true]){
    const app=snapshot.files['public/app.js'];const code=app.slice(app.indexOf('let navigationVersion'),app.indexOf("document.addEventListener('click'"));
    const location={pathname:'/artikel/A'},pending={};let rendered;
    const el=(tag,text)=>({tag,text,children:[],append(...items){this.children.push(...items);}});
    const start=new Function('location','fetch','document','el','main','renderBlocks','window',code+';return start;')(location,url=>new Promise((resolve,reject)=>{pending[url]={resolve,reject};}),{},el,{replaceChildren(v){rendered=v;}},()=>{},{scrollTo(){}});
    const first=start();location.pathname='/artikel/B';const second=start();
    const article=name=>Response.json({headline:name,deck:'Deck',category:'indland',sources:[],paragraphs:['Text']});
    pending['/api/article/B'].resolve(article('B'));await second;
    if(failOld)pending['/api/article/A'].reject(new Error('old request failed'));else pending['/api/article/A'].resolve(article('A'));await first;
    assert.equal(rendered.children.find(x=>x.tag==='h1').text,'B');
   }
  });
 }finally{globalThis.fetch=saved;}
 console.log(results.length+' direct publisher regression groups passed; no paid requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
