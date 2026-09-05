import { z } from 'zod';
export const Category = z.enum(['indland','udland','penge','kultur','viden','liv','kommentar']);
export const Slot = z.enum(['lead','top-1','top-2','top-3','news-1','news-2','news-3','news-4','viden-1','viden-2','liv-1','liv-2']);
export const Order = z.object({ instruction:z.string().min(10).max(3000), category:Category, mode:z.enum(['specific','discovery']), angle:z.string().max(1000), why_now:z.string().max(1000), words:z.number().int().min(150).max(1500), primary_source_required:z.boolean(), opposing_view_required:z.boolean() }).strict();
export type Order = z.infer<typeof Order>;
export const Source = z.object({url:z.string().url(),title:z.string(),publisher:z.string(),kind:z.enum(['primary','secondary']),retrieved_at:z.string(),facts:z.array(z.string()).min(1),quotes:z.array(z.string())});
export const Dossier = z.object({subject:z.string(),facts:z.array(z.string()).min(1),uncertainties:z.array(z.string()),opposing_views:z.array(z.string()),sources:z.array(Source).min(1)});
export type Dossier = z.infer<typeof Dossier>;
export const Draft = z.object({headline:z.string().min(10).max(200),deck:z.string().min(10).max(600),paragraphs:z.array(z.string().min(1)).min(2).max(40),category:Category,source_urls:z.array(z.string().url()).min(1),image_query:z.string().min(3).max(200)});
export type Draft = z.infer<typeof Draft>;
export const JournalistResult = z.discriminatedUnion('kind',[
 z.object({kind:z.literal('research'),question:z.string().min(10).max(600)}),
 z.object({kind:z.literal('draft'),article:Draft})
]);
export const Review = z.object({matches_order:z.boolean(),headline_correct:z.boolean(),serious_error:z.boolean(),reason:z.string().max(1000),slot:Slot});
export type Review = z.infer<typeof Review>;
export const ChiefDecision = z.object({order:Order.nullable(),reason:z.string().max(1000)});
export interface OrderRow {id:string;original_order:Order;status:string}
export interface MediaRow {id:string;family_id:string;url:string;original_url:string;credit:string;alt:string;license_documentation:Record<string,unknown>;rights_verified:boolean;vision_verified:boolean;generated:boolean;tags:string[]}
export function nextReviewAction(review:Review,attempt:number):'publish'|'retry'|'drop' {
 if(review.matches_order&&review.headline_correct) return 'publish';
 return review.serious_error&&attempt===1?'retry':'drop';
}
