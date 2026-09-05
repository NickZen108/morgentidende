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

`src/editorial/feeds.ts` currently contains 127 feed endpoints across Danish news/research, major international reporting, EU/economics, libertarian sources, islam-critical discovery radar, technology/AI, natural science, medicine, longevity/biohacking, neuroscience/meditation, psychology, space and climate/energy.

Scan treats the curated registry as primary discovery. BGE-M3 semantically ranks feed metadata against the Scan brief; only a bounded subset is fetched. Google News/Bing News are fallback discovery. RSS and Atom are both supported.

## Danish news and primary-source verification

| Source | Feed | Mode | Verification evidence |
|---|---|---|---|
| DR Nyheder | https://www.dr.dk/nyheder/service/feeds/allenyheder | direct | full live audit returned HTTP 200 `application/rss+xml` |
| TV 2 Nyheder | https://services.tv2.dk/api/feeds/nyheder/rss | direct | GitHub runner has a DNS-resolution failure; current feed-reader evidence still shows fresh items, so keep provisionally |
| Jyllands-Posten – Topnyheder | https://feeds.jp.dk/jp/topnyheder | direct | full live audit returned HTTP 200 `application/rss+xml` |
| Politiken – Tophistorier | https://politiken.dk/rss/tophistorier.rss | direct | live probe returned HTTP 200 `application/rss+xml` |
| Danmarks Nationalbank – Nyt | https://www.nationalbanken.dk/api/rssfeed?topic=Nyt&lang=da | primary | live probe returned HTTP 200 `application/rss+xml` |
| Danmarks Nationalbank – Pressemeddelelser | https://www.nationalbanken.dk/api/rssfeed?topic=Pressemeddelelse&lang=da | primary | live probe returned HTTP 200 `application/rss+xml` |
| Danmarks Nationalbank – Statistiknyheder | https://www.nationalbanken.dk/api/rssfeed?topic=Statistiknyhed&lang=da | primary | live probe returned HTTP 200 `application/rss+xml` |
| Finansministeriet – Nyheder | https://fm.dk/nyheder/nyhedsarkiv/?rss=true | primary | official front page exposes this RSS link; direct fetch reports XML |
| Københavns Universitet feeds | multiple `nyheder.ku.dk/.../?get_rss=1` | primary/research | all five configured KU feeds returned HTTP 200 XML in the full audit |

Berlingske remains out of `feeds.ts`: multiple obvious and historical endpoint patterns returned 404, and no current concrete RSS URL has been positively resolved. We do not guess RSS URLs.

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
- Berlingske: no current concrete feed URL positively verified.
- Danmarks Statistik: `rss.dst.dk` is live, but current obvious/historical routes and tested query variants resolve to HTML or 404 rather than RSS/XML.
- Erhvervsministeriet: current site code contains RSS-handling logic, but no stable RSS endpoint has yet been positively verified.

## Editorial safety

Islam-critical discovery feeds are radar only. Their own prose is not evidence. Scan should extract outbound links and prefer primary sources, authorities, courts, police, local reporting, Reuters/AP/BBC-class media, or other authoritative reporting. The discovery source itself disappears before Desk/Journalist source handling.

## Runtime status

The curated-feed registry compiles. Scan integration is implemented with bounded feed selection, RSS/Atom parsing, per-feed failure tolerance, BGE-M3 feed ranking and semantic deduplication, discovery-only outbound-link promotion, and Google/Bing fallback.

## Full endpoint audit 2026-09-05

A GitHub-hosted live audit requested every configured endpoint and inspected the returned body for RSS/Atom/XML structure. Before later Danish additions there were 114 configured endpoints:

- 105 returned parseable RSS/Atom/XML directly with HTTP 200.
- 7 were blocked or rate-limited to the audit runner (403/429): Euractiv, Human Progress, IEA, Jihad Watch, FrontPage Magazine, NASA legacy feed and Carbon Brief.
- 1 (TV 2) failed DNS resolution from the GitHub runner but is retained provisionally because independent current feed-reader evidence shows fresh items.
- 1 invalid Danmarks Nationalbank URL returned HTTP 404 and was removed; the correct Nationalbanken API pattern was subsequently discovered and three verified feeds were added.
- There were zero cases where HTTP 200 returned an ordinary HTML page masquerading as a configured feed.

After later additions of Politiken, three Nationalbanken feeds and Finansministeriet, the active registry contains 127 endpoints. Blocked feeds do not abort Scan; each is skipped independently if unavailable.

## Danish endpoint discovery pass 2026-09-05

- Politiken's RSS paths `senestenyt.rss`, `tophistorier.rss`, `indland.rss`, `udland.rss` and `kultur.rss` all returned HTTP 200 `application/rss+xml`. `erhverv.rss` returned 404. To avoid unnecessary duplicate ingestion, only `https://politiken.dk/rss/tophistorier.rss` is active.
- Berlingske's obvious candidates `/rss`, `/feed`, `/rss.xml`, several `/rss/*.xml`/`.rss` variants and the legacy `section/nyhedsoversigt/&template=rss&mime=xml` all returned 404. It remains excluded.
- TV 2's `services.tv2.dk` endpoint still fails DNS resolution from GitHub runners; obvious alternatives under `nyheder.tv2.dk` returned 404. The existing TV 2 entry remains provisional because current feed readers still show fresh items from it.
- Inspection of Nationalbanken's current JavaScript bundle revealed the official construction pattern `https://www.nationalbanken.dk/api/rssfeed?topic=<TOPIC>&lang=da`. `Nyt`, `Pressemeddelelse`, `Analyse`, `Statistiknyhed` and `Markedsmeddelelse` all returned HTTP 200 `application/rss+xml`; Scan uses the first, second and fourth to limit overlap.
- Finansministeriets front page explicitly exposes `https://fm.dk/nyheder/nyhedsarkiv/?rss=true`, which returns XML and is active as a primary source.
- A deeper Erhvervsministeriet pass tested `/aktuelt`, `/aktuelt/nyheder`, year archives, `/presse` and other plausible routes with `?rss=true`; all returned ordinary HTML, not feeds. No EM feed was added.
- A deeper Danmarks Statistik pass tested the current `rss.dst.dk` site, legacy paths and `rss=true`/`format=rss`/`output=rss` variants on current news/publication URLs; all tested candidates were HTML or 404. No DST feed was added.


## Folketinget / Danish regulator pass 2026-09-05

- Folketinget officially documents `https://oda.ft.dk/api/` as an OData 3.0 service and states that open data can be delivered as Atom/XML or JSON. A live probe of `Sag` and `Dokument` confirmed the API is healthy and current, but the service returned `application/json` even when `$format=atom` was explicitly requested. The returned records are highly useful primary-source material (for example recent bills, parliamentary questions and document titles), but the current generic RSS/Atom parser should not ingest this endpoint as if it were a normal feed. Folketinget is therefore not counted among the 118 RSS/Atom endpoints. A dedicated OData adapter is the correct future integration.
- Folketinget's subscription service can generate RSS feeds for user-configured subscriptions, but that is profile/subscription-specific rather than a stable public generic feed for the registry.
- Finanstilsynet's current news page was inspected and common `/rss`, `/rss.xml`, `/feed`, `?rss=true` and archive RSS patterns were live-probed. No parseable RSS/Atom endpoint was found; obvious root feed paths returned 404 and `?rss=true` returned normal HTML.
- Konkurrence- og Forbrugerstyrelsens current news archive was inspected in the same way. No parseable RSS/Atom endpoint was exposed; obvious feed paths returned 404 or normal HTML.
- Udlændinge- og Integrationsministeriet returned `text/xml` for several `?rss=true` guesses, but the bodies were zero bytes. These are not valid feeds and remain excluded.
- Justitsministeriet, politiet and Indenrigs- og Sundhedsministeriet did not yield verified RSS endpoints in the same pass. Sundhedsstyrelsen rate-limited the GitHub probe (HTTP 429) and remains unresolved rather than classified as feedless.


## Retsinformation and Høringsportalen verified 2026-09-05

Retsinformation documents an official ELI Atom update feed at `https://www.retsinformation.dk/eli/eli-update-feed.atom`. A live GitHub-runner probe returned HTTP 200 `text/xml`, contained 495 Atom entries in the fetched body, and is now active as a high-authority `primary` feed.

Høringsportalen explicitly documents that its syndication feeds use Atom and return the 25 latest updated hearings. Live probes returned HTTP 200 `application/atom+xml` with 25 entries for the generic feed and each selected high-value area feed. Scan now includes all hearings plus targeted feeds for police, justice/courts, macroeconomy/digitalisation/statistics, taxes, health, immigration/integration, and business.

This increases the curated registry from 118 to 127 endpoints. Scan still ranks metadata first and fetches at most 42 feeds per discovery run.
