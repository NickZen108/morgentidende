import { supabaseRequest, type SupabaseEnv } from "../lib/supabase";
import type {
  ChiefEditorDecision,
  EditorialOrder,
  PublishRecord,
  ScanRequest,
  ScanResult
} from "./types";

interface EditorialOrderRow {
  id: string;
  instruction: string;
  requested_section: string | null;
  requested_article_type: string | null;
  requested_search_type: string | null;
  requested_publish_at: string | null;
  homepage_slot: string | null;
  scan_calls: number;
  status: string;
}

export class EditorialStore {
  constructor(private readonly env: SupabaseEnv) {}

  async createOrder(input: Omit<EditorialOrder, "id">): Promise<EditorialOrder> {
    const rows = await supabaseRequest<EditorialOrderRow[]>(this.env, "editorial_orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        instruction: input.instruction,
        requested_section: input.section ?? null,
        requested_article_type: input.articleType ?? null,
        requested_search_type: input.searchType ?? null,
        requested_publish_at: input.requestedPublishAt ?? null,
        homepage_slot: input.homepageSlot ?? null,
        status: "pending"
      })
    });
    return this.toOrder(rows[0]);
  }

  async getOrder(id: string): Promise<EditorialOrder | null> {
    const rows = await supabaseRequest<EditorialOrderRow[]>(
      this.env,
      `editorial_orders?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    return rows[0] ? this.toOrder(rows[0]) : null;
  }

  async setOrderStatus(id: string, status: string): Promise<void> {
    await supabaseRequest(this.env, `editorial_orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
  }

  async recordScanRequest(
    orderId: string,
    storyId: string | null,
    request: ScanRequest,
    attemptNo: number
  ): Promise<string> {
    const rows = await supabaseRequest<Array<{ id: string }>>(this.env, "scan_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        order_id: orderId,
        story_id: storyId,
        requested_by: request.requestedBy,
        search_type: request.searchType,
        query: request.query,
        priority_stage: request.purpose,
        attempt_no: attemptNo,
        status: "pending"
      })
    });
    return rows[0].id;
  }

  async recordScanResult(requestId: string, result: ScanResult): Promise<void> {
    await supabaseRequest(this.env, "scan_results", {
      method: "POST",
      body: JSON.stringify({
        request_id: requestId,
        result_kind: result.kind,
        url: result.url,
        title: result.title ?? null,
        publisher: result.publisher ?? null,
        summary: result.summary ?? null,
        published_at: result.publishedAt ?? null,
        license: result.license ?? null,
        commercial_use_allowed: result.commercialUseAllowed ?? null,
        jurisdiction_note: result.jurisdictionNote ?? null,
        credit: result.credit ?? null,
        metadata: result.metadata ?? {}
      })
    });
    await supabaseRequest(this.env, `scan_requests?id=eq.${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "finished", finished_at: new Date().toISOString() })
    });
  }

  async consumeChiefScanCall(orderId: string): Promise<number> {
    const rows = await supabaseRequest<Array<{ scan_calls: number }>>(
      this.env,
      `editorial_orders?id=eq.${encodeURIComponent(orderId)}&select=scan_calls&limit=1`
    );
    const current = rows[0]?.scan_calls ?? 0;
    if (current >= 5) throw new Error("editor_in_chief_scan_limit_reached");
    const next = current + 1;
    await supabaseRequest(this.env, `editorial_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ scan_calls: next, updated_at: new Date().toISOString() })
    });
    return next;
  }

  async publish(decision: ChiefEditorDecision): Promise<PublishRecord> {
    const slug = slugify(decision.article.headline);
    const now = decision.publishAt ?? new Date().toISOString();
    const articleRows = await supabaseRequest<Array<{ id: string; slug: string; published_at: string }>>(
      this.env,
      "articles",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          story_id: decision.article.candidateId,
          slug,
          headline: decision.article.headline,
          dek: decision.article.deck ?? null,
          body_markdown: decision.article.body,
          section: decision.article.section,
          article_type: decision.article.articleType ?? null,
          status: "published",
          editor_model: "Terra",
          homepage_slot: decision.homepageSlot ?? null,
          publish_instruction: {
            notes: decision.notes,
            requested_publish_at: decision.publishAt ?? null
          },
          source_metadata: decision.article.sourceRefs,
          published_at: now
        })
      }
    );

    const article = articleRows[0];
    return { articleId: article.id, slug: article.slug, publishedAt: article.published_at };
  }

  private toOrder(row: EditorialOrderRow): EditorialOrder {
    return {
      id: row.id,
      instruction: row.instruction,
      section: (row.requested_section as EditorialOrder["section"]) ?? undefined,
      articleType: row.requested_article_type ?? undefined,
      searchType: (row.requested_search_type as EditorialOrder["searchType"]) ?? undefined,
      requestedPublishAt: row.requested_publish_at ?? undefined,
      homepageSlot: row.homepage_slot ?? undefined
    };
  }
}

function slugify(input: string): string {
  return input
    .toLocaleLowerCase("da")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
