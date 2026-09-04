import { SupabaseError, supabaseRequest } from "./lib/supabase";

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

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "morgentidende-v2",
      architecture: "v2-clean",
      database: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      editorialFlow: ["scan", "desk", "journalist", "media", "editor_in_chief", "publish"]
    });
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
      section: typeof body.section === "string" ? body.section : null,
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
