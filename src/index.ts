import { SupabaseError, supabaseRequest } from "./lib/supabase";
import { CATEGORIES, MODELS } from "./editorial/policy";
import { EditorialStore } from "./editorial/store";
import { runLiveEditorialOrder } from "./editorial/runtime";
import type { Category, EditorialOrder, SearchType } from "./editorial/types";

interface Env { ASSETS: Fetcher; AI: Ai; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; }
interface StoryRow { id:string; slug:string|null; title:string; summary:string|null; category:string|null; status:string; news_value:number|null; created_at:string; updated_at:string; }
interface ArticleRow { id:string; story_id:string; slug:string|null; headline:string; dek:string|null; body_markdown:string; category:string|null; article_type:string|null; homepage_slot?:string|null; status:string; published_at:string|null; production_usage?:Record<string,unknown>; }
interface RelationRow { article_id:string; related_article_id:string; relation_type:string; }

const ARTICLE_SELECT = "id,story_id,slug,headline,dek,body_markdown,category,article_type,homepage_slot,status,published_at,production_usage";
const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data, null, 2), { ...init, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...(init.headers || {}) } });
const badRequest = (message:string) => json({ok:false,error:message},{status:400});
async function readJson(request:Request):Promise<Record<string,unknown>> { try{return await request.json() as Record<string,unknown>;}catch{return{};} }
function isCategory(value:unknown):value is Category { return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value); }
function isSearchType(value:unknown):value is SearchType { return ["text","image","video","map_satellite"].includes(String(value)); }

async function editorialOverview(env:Env) {
  const since = new Date(Date.now()-24*60*60*1000).toISOString();
  const [articles,relations] = await Promise.all([
    supabaseRequest<ArticleRow[]>(env,`articles?select=id,story_id,headline,category,article_type,homepage_slot,status,published_at&status=eq.published&published_at=gte.${encodeURIComponent(since)}&order=published_at.desc&limit=200`),
    supabaseRequest<RelationRow[]>(env,"article_relations?select=article_id,related_article_id,relation_type&limit=500")
  ]);
  const counts = Object.fromEntries(CATEGORIES.map(category=>[category,0])) as Record<Category,number>;
  for(const article of articles) if(article.category&&isCategory(article.category)) counts[article.category]+=1;
  const relatedIds=new Set(relations.map(r=>r.article_id));
  const leads=articles.filter(a=>a.homepage_slot==="hero"||a.article_type==="lead");
  const leadsMissingFollowup=leads.filter(a=>!relatedIds.has(a.id)).map(a=>({id:a.id,headline:a.headline}));
  const newsCount=counts.indland+counts.udland+counts.penge;
  const otherCount=counts.kultur+counts.viden+counts.liv+counts.kommentar;
  return {windowHours:24,totalPublished:articles.length,categoryCounts:counts,mix:{news:newsCount,other:otherCount},leads:leads.length,leadsMissingFollowup,missingCategories:CATEGORIES.filter(c=>counts[c]===0),signals:{needsMoreNews:newsCount<otherCount,needsMoreOther:otherCount===0||(newsCount>0&&otherCount/newsCount<0.35),needsLeadFollowups:leadsMissingFollowup.length>0}};
}

async function handleApi(request:Request, env:Env, url:URL):Promise<Response|null> {
  if(url.pathname==="/api/health") return json({ok:true,service:"morgentidende-v2",architecture:"v2-clean",database:Boolean(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY),workersAI:Boolean(env.AI),editorialFlow:["editor_in_chief_order","scan","desk","journalist","media","editor_in_chief","publish"],models:MODELS,categories:CATEGORIES});
  if(url.pathname==="/api/pipeline/config"&&request.method==="GET") return json({ok:true,models:MODELS,categories:CATEGORIES,timing:"editor_in_chief_controlled_not_configured_yet"});
  if(url.pathname==="/api/editorial/overview"&&request.method==="GET") return json({ok:true,overview:await editorialOverview(env)});

  if(url.pathname==="/api/editorial/orders"&&request.method==="POST") {
    const body=await readJson(request); const instruction=typeof body.instruction==="string"?body.instruction.trim():"";
    if(!instruction)return badRequest("instruction is required");
    if(body.category!==undefined&&!isCategory(body.category))return badRequest("invalid category");
    if(body.searchType!==undefined&&!isSearchType(body.searchType))return badRequest("invalid searchType");
    const input:Omit<EditorialOrder,"id">={instruction,category:isCategory(body.category)?body.category:undefined,articleType:typeof body.articleType==="string"?body.articleType:undefined,searchType:isSearchType(body.searchType)?body.searchType:undefined,requestedPublishAt:typeof body.requestedPublishAt==="string"?body.requestedPublishAt:undefined,homepageSlot:typeof body.homepageSlot==="string"?body.homepageSlot:undefined};
    const order=await new EditorialStore(env).createOrder(input); return json({ok:true,order},{status:201});
  }

  if(url.pathname.startsWith("/api/editorial/orders/")&&url.pathname.endsWith("/run")&&request.method==="POST") {
    const id=url.pathname.split("/").filter(Boolean).at(-2)??""; const store=new EditorialStore(env); const order=await store.getOrder(id);
    if(!order)return json({ok:false,error:"not_found"},{status:404});
    return json({ok:true,outcome:await runLiveEditorialOrder(env,order)});
  }
  if(url.pathname.startsWith("/api/editorial/orders/")&&request.method==="GET") {
    const id=url.pathname.split("/").pop()??""; const order=await new EditorialStore(env).getOrder(id); if(!order)return json({ok:false,error:"not_found"},{status:404}); return json({ok:true,order});
  }
  if(url.pathname==="/api/stories"&&request.method==="GET") return json({ok:true,stories:await supabaseRequest<StoryRow[]>(env,"stories?select=id,slug,title,summary,category,status,news_value,created_at,updated_at&order=created_at.desc&limit=50")});
  if(url.pathname==="/api/stories"&&request.method==="POST") {
    const body=await readJson(request); const title=typeof body.title==="string"?body.title.trim():""; if(!title)return badRequest("title is required");
    const stories=await supabaseRequest<StoryRow[]>(env,"stories",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({title,summary:typeof body.summary==="string"?body.summary:null,category:isCategory(body.category)?body.category:null,news_value:typeof body.news_value==="number"?body.news_value:null,status:"candidate"})}); return json({ok:true,story:stories[0]},{status:201});
  }
  if(url.pathname==="/api/articles"&&request.method==="GET") return json({ok:true,articles:await supabaseRequest<ArticleRow[]>(env,`articles?select=${ARTICLE_SELECT}&order=created_at.desc&limit=50`)});
  if(url.pathname==="/api/published"&&request.method==="GET") return json({ok:true,articles:await supabaseRequest<ArticleRow[]>(env,`articles?select=${ARTICLE_SELECT}&status=eq.published&order=published_at.desc&limit=50`)});
  return null;
}

export default { async fetch(request:Request,env:Env):Promise<Response> { const url=new URL(request.url); try { const apiResponse=await handleApi(request,env,url); if(apiResponse)return apiResponse; return env.ASSETS.fetch(request); } catch(error) { if(error instanceof SupabaseError)return json({ok:false,error:"database_request_failed",status:error.status,detail:error.body},{status:502}); console.error(error); return json({ok:false,error:"internal_error"},{status:500}); } } } satisfies ExportedHandler<Env>;
