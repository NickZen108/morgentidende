import { supabaseRequest, type SupabaseEnv } from "../lib/supabase";
import { CloudflareDeskAgent, GemmaMediaAgent, TerraEditorInChiefAgent, TerraJournalistAgent } from "./agents";
import type { AiEnv } from "./ai";
import { runEditorialOrder, type Publisher, type PipelineDependencies, type PipelineOutcome } from "./pipeline";
import { LiveScanService } from "./scan";
import { EditorialStore } from "./store";
import type { ChiefEditorDecision, EditorialOrder, PublishRecord } from "./types";

export interface EditorialRuntimeEnv extends AiEnv, SupabaseEnv {}

class RuntimePublisher implements Publisher {
  constructor(private readonly env: EditorialRuntimeEnv, private readonly store: EditorialStore) {}

  async publish(order: EditorialOrder, decision: ChiefEditorDecision): Promise<PublishRecord> {
    const storyRows = await supabaseRequest<Array<{ id: string }>>(this.env, "stories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title: decision.article.headline,
        summary: decision.article.deck ?? null,
        category: decision.article.category,
        status: "published",
        news_value: decision.homepageSlot === "hero" ? 100 : null,
        desk_notes: `Editorial order ${order.id}`,
        selected_at: new Date().toISOString(),
        published_at: decision.publishAt ?? new Date().toISOString()
      })
    });

    const storyId = storyRows[0].id;

    if (decision.article.sourceRefs.length) {
      await supabaseRequest(this.env, "sources", {
        method: "POST",
        body: JSON.stringify(decision.article.sourceRefs.map(source => ({
          story_id: storyId,
          url: source.url,
          domain: safeDomain(source.url),
          publisher: source.publisher,
          title: source.title ?? null,
          source_kind: source.sourceKind ?? "other",
          published_at: source.publishedAt ?? null,
          fetched_at: source.retrievedAt ?? new Date().toISOString(),
          is_authoritative: Boolean(source.authoritative || source.sourceKind === "authoritative" || source.sourceKind === "primary"),
          metadata: { supports: source.supports ?? [], notes: source.notes ?? null }
        })))
      });
    }

    const record = await this.store.publish({
      ...decision,
      article: { ...decision.article, candidateId: storyId }
    });

    await supabaseRequest(this.env, `editorial_orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ story_id: storyId, status: "published", updated_at: new Date().toISOString() })
    });

    return record;
  }
}

export function createEditorialRuntime(env: EditorialRuntimeEnv): PipelineDependencies {
  const store = new EditorialStore(env);
  return {
    scan: new LiveScanService(env),
    desk: new CloudflareDeskAgent(env),
    journalist: new TerraJournalistAgent(env),
    media: new GemmaMediaAgent(env),
    editorInChief: new TerraEditorInChiefAgent(env),
    publisher: new RuntimePublisher(env, store)
  };
}

export async function runLiveEditorialOrder(env: EditorialRuntimeEnv, order: EditorialOrder): Promise<PipelineOutcome> {
  const store = new EditorialStore(env);
  await store.setOrderStatus(order.id, "running");
  try {
    const outcome = await runEditorialOrder(createEditorialRuntime(env), order);
    if (outcome.status === "no_candidate") await store.setOrderStatus(order.id, "no_candidate");
    return outcome;
  } catch (error) {
    await store.setOrderStatus(order.id, "failed");
    throw error;
  }
}

function safeDomain(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}
