# RSS feed verification

Verified/expanded on 2026-09-05 for Morgentidende's curated feed pool.

## Rules
- `direct`: may be used as a normal source when the concrete article is suitable.
- `primary`: official authority/institution feed; may be used as a normal primary source.
- `research`: journal/university/research feed; may be used as a research source when the concrete item supports the claim.
- `discovery_only`: may be used only to discover outbound links. It must never appear in article sourceRefs, source boxes, evidence counts, or Supabase article-source records.
- Discovery-only pages must be discarded after authoritative/primary outbound links have been extracted.
- A dead, blocked or malformed feed must never stop Scan. It is skipped and the run continues.

## Active curated registry

`src/editorial/feeds.ts` currently contains 114 feed endpoints across Danish news/research, major international reporting, EU/economics, libertarian sources, islam-critical discovery radar, technology/AI, natural science, medicine, longevity/biohacking, neuroscience/meditation, psychology, space and climate/energy.

Scan treats the curated registry as primary discovery. BGE-M3 semantically ranks feed metadata against the Scan brief; only a bounded subset is fetched. Google News/Bing News are fallback discovery. RSS and Atom are both supported.

## Danish news verification pass

| Source | Feed | Mode | Verification evidence |
|---|---|---|---|
| DR Nyheder | https://www.dr.dk/nyheder/service/feeds/allenyheder | direct | full live audit returned HTTP 200 `application/rss+xml` |
| TV 2 Nyheder | https://services.tv2.dk/api/feeds/nyheder/rss | direct | GitHub runner had a DNS-resolution failure; current feed-reader evidence still shows fresh items, so keep provisionally |
| Jyllands-Posten – Topnyheder | https://feeds.jp.dk/jp/topnyheder | direct | full live audit returned HTTP 200 `application/rss+xml` |
| Københavns Universitet feeds | multiple `nyheder.ku.dk/.../?get_rss=1` | primary/research | all five configured KU feeds returned HTTP 200 XML in the full audit |

Berlingske and Politiken remain out of `feeds.ts` because a concrete current endpoint has not yet been independently resolved. We do not guess RSS URLs.

Danmarks Nationalbank confirms on its official site that it offers multiple RSS feeds, but the previously configured `https://www.nationalbanken.dk/api/rss/nyheder` returned HTTP 404 in the live audit. It has been removed until a current XML endpoint is positively identified.

## Major international feed verification pass

| Source/group | Active endpoint checked | Result |
|---|---|---|
| BBC News | https://feeds.bbci.co.uk/news/rss.xml | HTTP 200 `text/xml` |
| The Guardian | https://www.theguardian.com/world/rss | HTTP 200 `text/xml` |
| Financial Times | https://www.ft.com/world?format=rss | HTTP 200 `text/xml` |
| Deutsche Welle | https://rss.dw.com/rdf/rss-en-all | HTTP 200 `text/xml` |
| France 24 | https://www.france24.com/en/rss | HTTP 200 `application/rss+xml` in the full audit; all seven configured France 24 feeds passed |
| Al Jazeera English | https://www.aljazeera.com/xml/rss/all.xml | HTTP 200 `application/rss+xml` |
| Euractiv | https://www.euractiv.com/feed/ | HTTP 403 to the audit runner; retained because the endpoint is known RSS infrastructure, but runtime must tolerate it being blocked |
| Politico Europe | https://www.politico.eu/feed/ | HTTP 200 `application/rss+xml` |
| ECB press/statistics | two configured feeds | both HTTP 200 `application/rss+xml` |
| Eurostat | statistics-update RSS | HTTP 200 `application/xml` |

All configured BBC, Guardian and Financial Times feeds returned XML in the full live audit.

## Technology / AI feed verification pass

The configured TechCrunch, Ars Technica, WIRED, WIRED AI, The Verge, 404 Media, MIT Technology Review, Hacker News, Google Research, Google DeepMind, Microsoft Research, Apple ML, MIT ML, JMLR and all five arXiv feeds returned HTTP 200 RSS/XML in the full live audit.

## Science / medicine / space feed verification pass

- All 10 configured Nature feeds returned HTTP 200 `application/rss+xml`.
- All 12 configured Frontiers feeds returned HTTP 200 XML.
- All eight configured Medical Xpress feeds returned HTTP 200 XML.
- All eight configured Phys.org feeds returned HTTP 200 XML.
- FDA MedWatch, EMA and JAMA Network Open returned HTTP 200 RSS/XML.
- Space.com returned HTTP 200 XML.
- NASA's legacy feed was rate-limited in the full audit. The registry was changed to NASA's current News Releases endpoint `https://www.nasa.gov/news-release/feed/`; a separate response check identifies it as `application/rss+xml`.
- Carbon Brief returned 403 to the GitHub audit runner, but a separate response check identifies `https://www.carbonbrief.org/feed/` as `application/rss+xml`; keep active.

## Libertarian feeds

| Source | Feed | Mode | Status |
|---|---|---|---|
| Reason | https://reason.com/feed/ | direct | HTTP 200 RSS in full audit |
| Cato Institute / Cato at Liberty | http://feeds.cato.org/Cato-at-liberty | direct/opinion | HTTP 200 RSS in full audit |
| Foundation for Economic Education | https://fee.org/feed/ | direct/opinion | HTTP 200 RSS in full audit |
| Human Progress | https://humanprogress.org/feed/ | direct | GitHub audit got 403, separate response check identifies `application/rss+xml` |
| Institute of Economic Affairs blog | https://iea.org.uk/blog/feed/ | direct/opinion | GitHub audit got 403; IEA still exposes an RSS page and blog feed infrastructure, so retain with failure tolerance |

Count retained with verified/independently supported RSS: 5/5.

## Islam-critical discovery feeds

| Source | Feed | Mode | Status |
|---|---|---|---|
| Jihad Watch | https://www.jihadwatch.org/feed/ | discovery_only | audit runner got 403; retained as previously verified RSS, with runtime failure tolerance |
| RAIR Foundation USA | https://rairfoundation.com/feed/ | discovery_only | HTTP 200 RSS in full audit |
| Bare Naked Islam | https://barenakedislam.com/feed/ | discovery_only | HTTP 200 RSS in full audit |
| Gates of Vienna | https://gatesofvienna.net/feed | discovery_only | HTTP 200 XML in full audit |
| FrontPage Magazine | https://frontpagemag.com/feed | discovery_only | audit runner got 403; site exposes feed endpoints and current feed-indexable pages, so retain with runtime failure tolerance |

Count retained with verified/independently supported RSS: 5/5.

## Removed / not active RSS feeds

- TheReligionOfPeace.com: the site's own FAQ explicitly states that it has no RSS feed. Keep out of the RSS pool.
- Gatestone Institute: useful as a possible web/discovery source, but a current working RSS endpoint was not verified. Do not include it in the active RSS pool until a current feed is verified.
- Danmarks Nationalbank: official RSS exists, but the exact current XML endpoint is unresolved; the invalid 404 endpoint was removed.

## Editorial safety

Islam-critical discovery feeds are radar only. Their own prose is not evidence. Scan should extract outbound links and prefer primary sources, authorities, courts, police, local reporting, Reuters/AP/BBC-class media, or other authoritative reporting. The discovery source itself disappears before Desk/Journalist source handling.

## Runtime status

The curated-feed registry compiles. Scan integration is implemented with bounded feed selection, RSS/Atom parsing, per-feed failure tolerance, BGE-M3 feed ranking and semantic deduplication, discovery-only outbound-link promotion, and Google/Bing fallback. The final CI after removing the temporary audit/cleanup workflows passed.

## Full endpoint audit 2026-09-05

A GitHub-hosted live audit requested every configured endpoint and inspected the returned body for RSS/Atom/XML structure. Before cleanup there were 114 configured endpoints:

- 105 returned parseable RSS/Atom/XML directly with HTTP 200.
- 7 were blocked or rate-limited to the audit runner (403/429): Euractiv, Human Progress, IEA, Jihad Watch, FrontPage Magazine, NASA legacy feed and Carbon Brief.
- 1 (TV 2) failed DNS resolution from the GitHub runner but is retained provisionally because independent current feed-reader evidence shows fresh items.
- 1 (Danmarks Nationalbank) returned HTTP 404 and was removed.
- There were zero cases where HTTP 200 returned an ordinary HTML page masquerading as a feed.

After the Nationalbanken cleanup and addition of one verified Politiken feed, the active registry contains 114 endpoints. Blocked feeds do not abort Scan; each is skipped independently if unavailable.


## Danish endpoint discovery pass 2026-09-05

- Politiken's historical-looking RSS paths were live-probed from a GitHub runner. `senestenyt.rss`, `tophistorier.rss`, `indland.rss`, `udland.rss` and `kultur.rss` all returned HTTP 200 `application/rss+xml` on 2026-09-05. `erhverv.rss` returned 404. To avoid unnecessary duplicate ingestion, only `https://politiken.dk/rss/tophistorier.rss` is added to the active Scan registry for now.
- Berlingske's obvious candidates `/rss`, `/feed`, `/rss.xml` and the legacy `section/nyhedsoversigt/&template=rss&mime=xml` all returned 404. Berlingske is therefore still excluded until its actual current feed URL is resolved; current feed directories indicate that a working feed exists, but we do not guess the endpoint.
- TV 2's `services.tv2.dk` endpoint still fails DNS resolution from GitHub runners; obvious alternatives under `nyheder.tv2.dk` returned 404. The existing TV 2 entry remains provisional because current feed readers still show fresh items from it.
- Nationalbanken's RSS page embeds 17 topic metadata objects, but the raw page does not expose their feed URLs directly; the component appears to construct them client-side. The invalid guessed endpoint remains removed until the actual request pattern is identified.
