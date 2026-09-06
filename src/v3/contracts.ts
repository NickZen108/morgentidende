import { z } from 'zod';
export const Category = z.enum(['indland','udland','penge','kultur','viden','liv','kommentar']);
export const Slot = z.enum(['lead','top-1','top-2','top-3','news-1','news-2','news-3','news-4','viden-1','viden-2','liv-1','liv-2']);
export const Order = z.object({ instruction:z.string().min(10).max(3000), category:Category, mode:z.enum(['specific','discovery']), angle:z.string().max(1000), why_now:z.string().max(1000), words:z.number().int().min(150).max(1500), primary_source_required:z.boolean(), opposing_view_required:z.boolean() }).strict();
export type Order = z.infer<typeof Order>;
export const Source = z.object({url:z.string().url(),title:z.string(),publisher:z.string(),kind:z.enum(['primary','secondary']),retrieved_at:z.string(),facts:z.array(z.string()).min(1),quotes:z.array(z.string())});
export const Dossier = z.object({subject:z.string(),facts:z.array(z.string()).min(1),uncertainties:z.array(z.string()),opposing_views:z.array(z.string()),sources:z.array(Source).min(1)});
export type Dossier = z.infer<typeof Dossier>;
export const ClaimMetadata=z.object({
 id:z.string().min(1).max(50),text:z.string().min(5).max(600),
 sources:z.array(z.object({url:z.string().url(),publisher:z.string().max(150),published_at:z.string().max(50),excerpt:z.string().max(800),scope:z.string().max(400)})).max(3)
});
export type ClaimMetadata=z.infer<typeof ClaimMetadata>;
export const Draft = z.object({headline:z.string().min(10).max(200),deck:z.string().min(10).max(600),paragraphs:z.array(z.string().min(1)).min(2).max(40),category:Category,source_urls:z.array(z.string().url()).min(1),image_query:z.string().min(3).max(200),claims:z.array(ClaimMetadata).max(12).optional()});
export type Draft = z.infer<typeof Draft>;

const DirectAssetBase={
 credit:z.string().min(1).max(300),alt:z.string().min(1).max(600),caption:z.string().max(600).optional(),
 rights_basis:z.enum(['cc','public_domain','publisher_permission','user_owned']),license:z.string().min(1).max(120),
 license_url:z.string().url().optional(),source_url:z.string().url().optional()
};
export const DirectAsset=z.union([
 z.object({...DirectAssetBase,url:z.string().url()}).strict(),
 z.object({...DirectAssetBase,data_base64:z.string().min(8).max(3_000_000),mime:z.enum(['image/jpeg','image/png','image/webp'])}).strict()
]);
export type DirectAsset=z.infer<typeof DirectAsset>;
export const DirectBlock=z.discriminatedUnion('type',[
 z.object({type:z.literal('paragraph'),text:z.string().min(1).max(5000)}).strict(),
 z.object({type:z.literal('subheading'),text:z.string().min(1).max(300)}).strict(),
 z.object({type:z.enum(['image','graphic']),asset:DirectAsset}).strict()
]);
export type DirectBlock=z.infer<typeof DirectBlock>;
export const DirectArticle = z.object({
 headline:z.string().min(10).max(200),deck:z.string().min(10).max(600),paragraphs:z.array(z.string().min(1)).min(2).max(40),
 blocks:z.array(DirectBlock).min(2).max(80).optional(),category:Category,source_urls:z.array(z.string().url()).max(30).default([]),
 image_query:z.string().min(3).max(200),claims:z.array(ClaimMetadata).max(12).optional()
}).strict();
export type DirectArticle = z.infer<typeof DirectArticle>;
export const DirectSubmission = z.object({kind:z.literal('direct_article'),article:DirectArticle,submitted_at:z.string()}).strict();
export type DirectSubmission = z.infer<typeof DirectSubmission>;
const ChatCommandId=z.string().uuid();
export const ChatCommand = z.discriminatedUnion('type',[
 z.object({id:ChatCommandId,type:z.literal('status'),command_id:ChatCommandId.optional(),order_id:ChatCommandId.optional()}).strict(),
 z.object({id:ChatCommandId,type:z.literal('order'),order:Order}).strict(),
 z.object({id:ChatCommandId,type:z.literal('commission'),count:z.number().int().min(1).max(20),topic:z.string().min(3).max(1000).optional()}).strict(),
 z.object({id:ChatCommandId,type:z.literal('publish_order'),order_id:z.string().uuid()}).strict(),
 z.object({id:ChatCommandId,type:z.literal('publish_article'),article:DirectArticle,slot:Slot.default('lead'),hero:DirectAsset}).strict()
]);
export type ChatCommand = z.infer<typeof ChatCommand>;
export const JournalistResult = z.discriminatedUnion('kind',[
 z.object({kind:z.literal('research'),question:z.string().min(10).max(600)}),
 z.object({kind:z.literal('draft'),article:Draft})
]);
export const Review = z.object({matches_order:z.boolean(),headline_correct:z.boolean(),serious_error:z.boolean(),reason:z.string().max(1000),slot:Slot});
export type Review = z.infer<typeof Review>;
export const ChiefDecision = z.object({order:Order.nullable(),reason:z.string().max(1000)});
export interface OrderRow {id:string;original_order:Order;status:string}
export interface MediaRow {id:string;family_id:string;url:string;original_url:string;credit:string;alt:string;license_documentation:Record<string,unknown>;rights_verified:boolean;vision_verified:boolean;generated:boolean;tags:string[];variants?:Record<string,string>}
export function nextReviewAction(review:Review,attempt:number):'publish'|'retry'|'drop' {
 if(review.matches_order&&review.headline_correct&&!review.serious_error) return 'publish';
 return review.serious_error&&attempt===1?'retry':'drop';
}
