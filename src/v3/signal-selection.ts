export interface SignalCandidate {
 id:string;
 payload:string;
}
/** Round-robin countries and publishers; rotate the starting country each scan. */
export function diverseSignals<T extends SignalCandidate>(candidates:T[],countries:Map<string,string>,epoch:number,limit=12):T[]{
 const buckets=new Map<string,Map<string,T[]>>();
 for(const candidate of candidates){
  const data=JSON.parse(candidate.payload);
  const publisher=String(data.sources?.[0]?.publisher??'unknown');
  const country=countries.get(publisher)??publisher;
  const publishers=buckets.get(country)??new Map<string,T[]>();
  const queue=publishers.get(publisher)??[];queue.push(candidate);publishers.set(publisher,queue);buckets.set(country,publishers);
 }
 const keys=[...buckets.keys()].sort();
 if(!keys.length)return [];
 const offset=((epoch%keys.length)+keys.length)%keys.length;
 const order=[...keys.slice(offset),...keys.slice(0,offset)];
 const selected:T[]=[];
 while(selected.length<limit){
  let added=false;
  for(const country of order){
   const publishers=buckets.get(country)!;
   const next=publishers.entries().next().value as [string,T[]]|undefined;
   if(!next)continue;
   const [publisher,queue]=next;selected.push(queue.shift()!);added=true;
   publishers.delete(publisher);if(queue.length)publishers.set(publisher,queue);
   if(selected.length===limit)break;
  }
  if(!added)break;
 }
 return selected;
}
