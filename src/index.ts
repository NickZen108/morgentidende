import { SupabaseError, supabaseRequest } from "./lib/supabase";
import { MODELS, SECTIONS } from "./editorial/policy";
import { EditorialStore } from "./editorial/store";
import type { EditorialOrder, SearchType, Section } from "./editorial/types";

interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface StoryRow {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  section: string | null;
  status: string;
  news_value: number | null;
  created_at: string;
  updated_at: string;
}

interface ArticleRow {
  id: string;
  story_id: string;
  slug: string | null;
  headline: string;
  dek: string | null;
  body_markdown: string;
  section: string | null;
  article_type: string | null;
  status: string;
  published_at: string | null;
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });

const badRequest = (message: string) => json({ ok: false, error: message }, { status: 400 });

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

function isSearchType(value: unknown): value is SearchType {
  return ["text", "image", "video", "map_satellite"].includes(String(value));
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "morgentidende-v2",
      architecture: "v2-clean",
      database: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      editorialFlow: ["editor_in_chief_order", "scan", "desk", "journalist", "media", "editor_in_chief", "publish"],
      models: MODELS,
      sections: SECTIONS
    });
  }

  if (url.pathname === "/api/pipeline/config" && request.method === "GET") {
    return json({
      ok: true,
      models: MODELS,
      sections: SECTIONS,
      timing: "editor_in_chief_controlled_not_configured_yet"
    });
  }

  if (url.pathname === "/api/editorial/orders" && request.method === "POST") {
    const body = await readJson(request);
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) return badRequest("instruction is required");
    if (body.section !== undefined && !isSection(body.section)) return badRequest("invalid section");
    if (body.searchType !== undefined && !isSearchType(body.searchType)) return badRequest("invalid searchType");

    const store = new EditorialStore(env);
    const input: Omit<EditorialOrder, "id"> = {
      instruction,
      section: isSection(body.section) ? body.section : undefined,
      articleType: typeof body.articleType === "string" ? body.articleType : undefined,
      searchType: isSearchType(body.searchType) ? body.searchType : undefined,
      requestedPublishAt: typeof body.requestedPublishAt === "string" ? body.requestedPublishAt : undefined,
      homepageSlot: typeof body.homepageSlot === "string" ? body.homepageSlot : undefined
    };
    const order = await store.createOrder(input);
    return json({ ok: true, order }, { status: 201 });
  }

  if (url.pathname.startsWith("/api/editorial/orders/") && request.method === "GET") {
    const id = url.pathname.split("/").pop() ?? "";
    const store = new EditorialStore(env);
    const order = await store.getOrder(id);
    if (!order) return json({ ok: false, error: "not_found" }, { status: 404 });
    return json({ ok: true, order });
  }

  if (url.pathname === "/api/stories" && request.method === "GET") {
    const stories = await supabaseRequest<StoryRow[]>(
      env,
      "stories?select=id,slug,title,summary,section,status,news_value,created_at,updated_at&order=created_at.desc&limit=50"
    );
    return json({ ok: true, stories });
  }

  if (url.pathname === "/api/stories" && request.method === "POST") {
    const body = await readJson(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return badRequest("title is required");

    const payload = {
      title,
      summary: typeof body.summary === "string" ? body.summary : null,
      section: isSection(body.section) ? body.section : null,
      news_value: typeof body.news_value === "number" ? body.news_value : null,
      status: "candidate"
    };

    const stories = await supabaseRequest<StoryRow[]>(env, "stories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    return json({ ok: true, story: stories[0] }, { status: 201 });
  }

  if (url.pathname === "/api/articles" && request.method === "GET") {
    const articles = await supabaseRequest<ArticleRow[]>(
      env,
      "articles?select=id,story_id,slug,headline,dek,body_markdown,section,article_type,status,published_at&order=created_at.desc&limit=50"
    );
    return json({ ok: true, articles });
  }

  if (url.pathname === "/api/published" && request.method === "GET") {
    const articles = await supabaseRequest<ArticleRow[]>(
      env,
      "articles?select=id,story_id,slug,headline,dek,body_markdown,section,article_type,status,published_at&status=eq.published&order=published_at.desc&limit=50"
    );
    return json({ ok: true, articles });
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      const apiResponse = await handleApi(request, env, url);
      if (apiResponse) return apiResponse;
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof SupabaseError) {
        return json(
          { ok: false, error: "database_request_failed", status: error.status, detail: error.body },
          { status: 502 }
        );
      }
      console.error(error);
      return json({ ok: false, error: "internal_error" }, { status: 500 });
    }
  }
} satisfies ExportedHandler<Env>;
