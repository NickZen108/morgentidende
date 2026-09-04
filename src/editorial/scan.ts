import { embedTexts, type AiEnv } from "./ai";
import { EDITORIAL_FEEDS, type EditorialFeed } from "./feeds";
import type { EditorialOrder, NewsCandidate, ScanRequest, ScanResult, SourceRef } from "./types";
import type { ScanService } from "./pipeline";

const GOOGLE_NEWS = "https://news.google.com/rss/search";
const BING_NEWS = "https://www.bing.com/news/search";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const MAX_DISCOVERY_RESULTS = 24;
const MAX_FEEDS_PER_DISCOVERY = 42;
const MAX_ITEMS_PER_FEED = 8;
const MAX_DISCOVERY_ONLY_ITEMS_PER_FEED = 3;
const MAX_OUTBOUND_LINKS_PER_DISCOVERY_ITEM = 5;
const USER_AGENT = "Morgentidende/2.0 (+editorial retrieval)";

const CATEGORY_HINTS: Record<string, string> = {
  indland: "Danmark dansk politik nyheder",
  udland: "international politik verden",
  penge: "økonomi erhverv finans privatøkonomi",
  kultur: "kultur strømninger religion ungdom datingkultur",
  viden: "teknologi AI naturvidenskab forskning",
  liv: "sundhed søvn kost motion parforhold dating forældreskab meditation biohacking longevity",
  kommentar: "politik samfund debat"
};

interface RssItem {
  title: string;
  link: string;
  description?: string;
  publishedAt?: string;
  publisher?: string;
  feedId?: string;
  feedMode?: EditorialFeed["mode"];
}

interface CommonsSearchResponse {
  query?: {
    pages?: Record<string, {
      title?: string;
      imageinfo?: Array<{
        url?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }>;
  };
}

export class LiveScanService implements ScanService {
  constructor(private readonly env: AiEnv) {}

  async discover(order: EditorialOrder): Promise<NewsCandidate[]> {
    const query = [
      order.scanBrief ?? order.instruction,
      order.category ? CATEGORY_HINTS[order.category] : ""
    ].filter(Boolean).join(" ");

    const curated = await discoverFromCuratedFeeds(this.env, query, order);
    if (curated.length) return semanticDedupe(this.env, curated, MAX_DISCOVERY_RESULTS);

    // Search engines are fallback only. A failure here becomes a normal empty discovery,
    // not a reason to lose candidates from otherwise healthy feeds.
    try {
      const items = await searchNews(`${query} when:1d`, MAX_DISCOVERY_RESULTS * 2);
      const candidates = items.map((item, index) => toCandidate(item, order, index));
      return await semanticDedupe(this.env, candidates, MAX_DISCOVERY_RESULTS);
    } catch {
      return [];
    }
  }

  async lookup(request: ScanRequest, excludeUrls: string[] = []): Promise<ScanResult | null> {
    if (request.searchType === "text") return lookupText(request.query, excludeUrls);
    if (request.searchType === "image") return lookupCommons(request.query, "image", excludeUrls);
    if (request.searchType === "video") return lookupCommons(request.query, "video", excludeUrls);
    return lookupCommons(request.query, "map", excludeUrls);
  }
}

async function discoverFromCuratedFeeds(env: AiEnv, query: string, order: EditorialOrder): Promise<NewsCandidate[]> {
  const rankedFeeds = await rankFeeds(env, query, order.category);
  const selected = rankedFeeds.slice(0, MAX_FEEDS_PER_DISCOVERY);
  const settled = await Promise.allSettled(selected.map(feed => fetchEditorialFeed(feed)));
  const candidates: NewsCandidate[] = [];
  let index = 0;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const feed = selected[i];
    if (result.status !== "fulfilled") continue;
    const items = result.value;

    if (feed.mode === "discovery_only") {
      const discoveryItems = items.slice(0, MAX_DISCOVERY_ONLY_ITEMS_PER_FEED);
      for (const item of discoveryItems) {
        const outbound = await extractDiscoveryOutboundItems(item, feed);
        for (const promoted of outbound) {
          candidates.push(toCandidate(promoted, order, index++));
        }
      }
      continue;
    }

    for (const item of items.slice(0, MAX_ITEMS_PER_FEED)) {
      candidates.push(toCandidate(item, order, index++));
    }
  }

  return candidates;
}

async function rankFeeds(env: AiEnv, query: string, category?: EditorialOrder["category"]): Promise<EditorialFeed[]> {
  const lexical = lexicalFeedRank(query, category);
  if (EDITORIAL_FEEDS.length <= 1) return lexical;

  try {
    const descriptors = EDITORIAL_FEEDS.map(feed =>
      `${feed.name}. country:${feed.country ?? "international"}. language:${feed.language}. mode:${feed.mode}. categories:${feed.categories.join(",")}. topics:${feed.topics.join(",")}`
    );
    const vectors = await embedTexts(env, [query, ...descriptors]);
    const queryVector = vectors[0];
    if (!queryVector?.length) return lexical;

    return EDITORIAL_FEEDS
      .map((feed, i) => {
        const vector = vectors[i + 1];
        const semantic = vector?.length ? cosine(queryVector, vector) : 0;
        const categoryBonus = category && feed.categories.includes(category) ? 0.12 : 0;
        const sourceBonus = feed.mode === "primary" ? 0.04 : feed.mode === "research" ? 0.03 : 0;
        const discoveryBonus = (feed.discoveryWeight ?? 0.7) * 0.015;
        return { feed, score: semantic + categoryBonus + sourceBonus + discoveryBonus };
      })
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.feed);
  } catch {
    return lexical;
  }
}

function lexicalFeedRank(query: string, category?: EditorialOrder["category"]): EditorialFeed[] {
  const words = tokenize(query);
  return [...EDITORIAL_FEEDS]
    .map(feed => {
      const haystack = tokenize(`${feed.name} ${feed.country ?? ""} ${feed.categories.join(" ")} ${feed.topics.join(" ")}`);
      let overlap = 0;
      for (const word of words) if (haystack.has(word)) overlap += 1;
      const categoryBonus = category && feed.categories.includes(category) ? 4 : 0;
      return { feed, score: overlap + categoryBonus + (feed.discoveryWeight ?? 0.7) * 0.1 };
    })
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.feed);
}

function tokenize(input: string): Set<string> {
  return new Set(
    input.toLocaleLowerCase("da")
      .replace(/[^a-z0-9æøå]+/gi, " ")
      .split(/\s+/)
      .filter(word => word.length >= 3)
  );
}

async function fetchEditorialFeed(feed: EditorialFeed): Promise<RssItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      redirect: "follow"
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseFeed(xml).slice(0, MAX_ITEMS_PER_FEED).map(item => ({
      ...item,
      publisher: feed.name,
      feedId: feed.id,
      feedMode: feed.mode
    }));
  } catch {
    return [];
  }
}

async function extractDiscoveryOutboundItems(item: RssItem, feed: EditorialFeed): Promise<RssItem[]> {
  try {
    const sourceUrl = new URL(item.link);
    const response = await fetch(item.link, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) return [];
    const html = (await response.text()).slice(0, 600_000);
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const promoted: RssItem[] = [];
    const seen = new Set<string>();

    for (const match of links) {
      if (promoted.length >= MAX_OUTBOUND_LINKS_PER_DISCOVERY_ITEM) break;
      let url: URL;
      try { url = new URL(decodeXml(match[1]), response.url || item.link); } catch { continue; }
      if (!/^https?:$/.test(url.protocol)) continue;
      if (url.hostname === sourceUrl.hostname || url.hostname.endsWith(`.${sourceUrl.hostname}`)) continue;
      if (isLowValueOutboundHost(url.hostname)) continue;
      url.hash = "";
      stripTrackingParams(url);
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const anchor = stripHtml(decodeXml(match[2]));
      if (anchor.length < 12) continue;
      promoted.push({
        title: anchor.slice(0, 260),
        link: normalized,
        description: `Opdaget via ${feed.name}; discovery-kilden må ikke citeres. Følg og verificér den eksterne kilde.`,
        publisher: hostnameLabel(url.hostname),
        publishedAt: item.publishedAt,
        feedId: feed.id,
        feedMode: "discovery_only"
      });
    }
    return promoted;
  } catch {
    return [];
  }
}

function isLowValueOutboundHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return [
    "facebook.com", "x.com", "twitter.com", "instagram.com", "tiktok.com", "youtube.com",
    "youtu.be", "linkedin.com", "pinterest.com", "paypal.com", "substack.com"
  ].some(blocked => host === blocked || host.endsWith(`.${blocked}`));
}

function stripTrackingParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  }
}

function hostnameLabel(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

async function searchNews(query: string, limit: number): Promise<RssItem[]> {
  const errors: string[] = [];
  try {
    const google = await searchGoogleNews(query, limit);
    if (google.length) return google;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "google_news_failed");
  }

  try {
    const bing = await searchBingNews(query, limit);
    if (bing.length) return bing;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "bing_news_failed");
  }

  throw new Error(`scan_news_search_failed:${errors.join("|") || "no_results"}`);
}

async function searchGoogleNews(query: string, limit: number): Promise<RssItem[]> {
  const url = new URL(GOOGLE_NEWS);
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "da");
  url.searchParams.set("gl", "DK");
  url.searchParams.set("ceid", "DK:da");

  const response = await fetch(url.toString(), {
    headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml, text/xml" }
  });
  if (!response.ok) throw new Error(`google_news:${response.status}`);
  return parseFeed(await response.text()).slice(0, limit);
}

async function searchBingNews(query: string, limit: number): Promise<RssItem[]> {
  const url = new URL(BING_NEWS);
  url.searchParams.set("q", query.replace(/\bwhen:\d+d\b/gi, "").trim());
  url.searchParams.set("format", "RSS");
  url.searchParams.set("setlang", "da-DK");
  url.searchParams.set("qft", 'sortbydate="1"');

  const response = await fetch(url.toString(), {
    headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml, text/xml" }
  });
  if (!response.ok) throw new Error(`bing_news:${response.status}`);
  return parseFeed(await response.text()).slice(0, limit);
}

function parseFeed(xml: string): RssItem[] {
  const rss = parseRss(xml);
  return rss.length ? rss : parseAtom(xml);
}

function parseRss(xml: string): RssItem[] {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  return items.map((match) => {
    const block = match[1];
    const title = decodeXml(tag(block, "title"));
    const link = decodeXml(tag(block, "link"));
    const description = stripHtml(decodeXml(tag(block, "description") || tag(block, "content:encoded")));
    const pubDate = decodeXml(tag(block, "pubDate") || tag(block, "dc:date"));
    const publisher = decodeXml(tag(block, "source"));
    return {
      title: cleanGoogleNewsTitle(title, publisher),
      link,
      description: description || undefined,
      publishedAt: toIso(pubDate),
      publisher: publisher || inferPublisher(title)
    };
  }).filter((item) => item.title && item.link);
}

function parseAtom(xml: string): RssItem[] {
  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  return entries.map((match) => {
    const block = match[1];
    const title = stripHtml(decodeXml(tag(block, "title")));
    const link = atomLink(block);
    const description = stripHtml(decodeXml(tag(block, "summary") || tag(block, "content")));
    const date = decodeXml(tag(block, "published") || tag(block, "updated"));
    return { title, link, description: description || undefined, publishedAt: toIso(date) };
  }).filter(item => item.title && item.link);
}

function atomLink(block: string): string {
  const links = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
  for (const match of links) {
    const attrs = match[1];
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] ?? "alternate";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href && (rel === "alternate" || !rel)) return decodeXml(href);
  }
  return links.map(match => match[1].match(/\bhref=["']([^"']+)["']/i)?.[1]).find(Boolean) ?? "";
}

function tag(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${escaped}>`, "i");
  return block.match(re)?.[1]?.trim() ?? "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanGoogleNewsTitle(title: string, publisher?: string): string {
  if (publisher && title.endsWith(` - ${publisher}`)) return title.slice(0, -(publisher.length + 3)).trim();
  return title;
}

function inferPublisher(title: string): string | undefined {
  const parts = title.split(" - ");
  return parts.length > 1 ? parts.at(-1)?.trim() : undefined;
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toCandidate(item: RssItem, order: EditorialOrder, index: number): NewsCandidate {
  const sourceKind: SourceRef["sourceKind"] = item.feedMode === "primary" ? "primary" : item.feedMode === "research" ? "authoritative" : "secondary";
  const source: SourceRef = {
    url: item.link,
    publisher: item.publisher ?? "Ukendt kilde",
    title: item.title,
    publishedAt: item.publishedAt,
    authoritative: item.feedMode === "primary" || item.feedMode === "research",
    sourceKind,
    retrievedAt: new Date().toISOString(),
    notes: item.feedMode === "discovery_only" ? "Promoted outbound link from discovery-only radar; discovery page itself is excluded." : undefined
  };
  return {
    id: `scan-${stableId(`${item.link}:${index}`)}`,
    title: item.title,
    summary: item.description,
    category: order.category,
    sources: [source],
    discoveredAt: item.publishedAt ?? new Date().toISOString()
  };
}

async function semanticDedupe(env: AiEnv, candidates: NewsCandidate[], limit: number): Promise<NewsCandidate[]> {
  if (candidates.length <= 1) return candidates.slice(0, limit);
  try {
    const vectors = await embedTexts(env, candidates.map(c => `${c.title}\n${c.summary ?? ""}`));
    const kept: NewsCandidate[] = [];
    const keptVectors: number[][] = [];
    for (let i = 0; i < candidates.length && kept.length < limit; i++) {
      const vector = vectors[i];
      if (!vector?.length) continue;
      const duplicate = keptVectors.some(existing => cosine(existing, vector) >= 0.91);
      if (!duplicate) {
        kept.push(candidates[i]);
        keptVectors.push(vector);
      }
    }
    return kept.length ? kept : lexicalDedupe(candidates, limit);
  } catch {
    return lexicalDedupe(candidates, limit);
  }
}

function lexicalDedupe(candidates: NewsCandidate[], limit: number): NewsCandidate[] {
  const seen = new Set<string>();
  const out: NewsCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.title.toLocaleLowerCase("da").replace(/[^a-z0-9æøå]+/gi, " ").trim();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(candidate);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function lookupText(query: string, excludeUrls: string[]): Promise<ScanResult | null> {
  const items = await searchNews(`${query} when:30d`, 12);
  for (const item of items) {
    if (excludeUrls.includes(item.link)) continue;
    const page = await fetchReadablePage(item.link);
    return {
      kind: "article",
      url: page.url || item.link,
      title: item.title,
      publisher: item.publisher,
      summary: page.text || item.description,
      publishedAt: item.publishedAt,
      metadata: { searchProvider: "RSS news retrieval fallback", requestedQuery: query, resolvedFrom: item.link }
    };
  }
  return null;
}

async function fetchReadablePage(url: string): Promise<{ url: string; text?: string }> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) return { url };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return { url: response.url || url };
    const html = (await response.text()).slice(0, 500_000);
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return { url: response.url || url, text: cleaned.slice(0, 14_000) || undefined };
  } catch {
    return { url };
  }
}

async function lookupCommons(query: string, mode: "image" | "video" | "map", excludeUrls: string[]): Promise<ScanResult | null> {
  const search = mode === "video" ? `${query} filetype:video` : mode === "map" ? `${query} map satellite` : query;
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `file:${search}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "10");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata|mime");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url.toString(), { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return null;
  const data = await response.json() as CommonsSearchResponse;
  const pages = Object.values(data.query?.pages ?? {});

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.url || excludeUrls.includes(info.url)) continue;
    const meta = info.extmetadata ?? {};
    const license = textMeta(meta.LicenseShortName) || textMeta(meta.License) || undefined;
    const usageTerms = textMeta(meta.UsageTerms) || "";
    const credit = stripHtml(textMeta(meta.Credit) || textMeta(meta.Artist) || "Wikimedia Commons");
    const description = stripHtml(textMeta(meta.ImageDescription) || textMeta(meta.ObjectName) || page.title || "");
    const allowed = isCommonsCommercialLicense(license, usageTerms);
    if (!allowed) continue;

    return {
      kind: mode === "video" ? "video" : mode === "map" ? "map" : "photo",
      url: info.url,
      title: page.title,
      publisher: "Wikimedia Commons",
      summary: description,
      license,
      commercialUseAllowed: true,
      jurisdictionNote: "Wikimedia Commons metadata indicates a public-domain or commercial-use-compatible license; Media must still verify the concrete asset before publication.",
      credit,
      metadata: {
        sourcePage: info.descriptionurl,
        usageTerms,
        licenseUrl: textMeta(meta.LicenseUrl),
        attributionRequired: Boolean(credit),
        searchProvider: "Wikimedia Commons API"
      }
    };
  }
  return null;
}

function textMeta(value?: { value?: string }): string {
  return value?.value?.trim() ?? "";
}

function isCommonsCommercialLicense(license?: string, usageTerms = ""): boolean {
  const value = `${license ?? ""} ${usageTerms}`.toLowerCase();
  if (/noncommercial|non-commercial|\bnc\b/.test(value)) return false;
  return /public domain|cc0|cc-by|cc by|creative commons attribution|pd-old|government work/.test(value);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, aa = 0, bb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

function stableId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
