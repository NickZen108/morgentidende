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

The following high-value Danish feeds have now been added to the active registry:

| Source | Feed | Mode | Verification evidence |
|---|---|---|---|
| DR Nyheder | https://www.dr.dk/nyheder/service/feeds/allenyheder | direct | current feed readers are receiving fresh DR items; the endpoint is also documented in Danish RSS-harvest configurations |
| TV 2 Nyheder | https://services.tv2.dk/api/feeds/nyheder/rss | direct | current feed-reader discovery shows fresh TV 2 items from this endpoint |
| Jyllands-Posten – Topnyheder | https://feeds.jp.dk/jp/topnyheder | direct | current feed catalogues identify this RSS endpoint |

Berlingske and Politiken are known to have currently working feeds according to 2026 feed registries, but their concrete feed URLs were not independently resolved in this pass, so they remain out of `feeds.ts` rather than guessing endpoints.

Danmarks Nationalbank has an official RSS catalogue at `https://www.nationalbanken.dk/da/rss-feeds`. The currently configured individual endpoint remains subject to exact endpoint confirmation.

## Major international feed verification pass

The following active endpoints were response-checked on 2026-09-05 and returned XML/RSS content types:

| Source/group | Active endpoint checked | Result |
|---|---|---|
| BBC News | https://feeds.bbci.co.uk/news/rss.xml | `text/xml` |
| The Guardian | https://www.theguardian.com/world/rss | `text/xml` |
| Financial Times | https://www.ft.com/world?format=rss | `text/xml` |
| Deutsche Welle | https://rss.dw.com/rdf/rss-en-all | `text/xml` |
| Al Jazeera English | https://www.aljazeera.com/xml/rss/all.xml | `application/rss+xml` |
| France 24 | https://www.france24.com/en/rss | current third-party feed monitors show fresh 2026 items; direct verifier receives 403, so keep active but classify verification as indirect |
| Euractiv | https://www.euractiv.com/feed/ | site has RSS-feed infrastructure, but direct verifier receives 403; keep active pending direct XML response check |
| Politico Europe | https://www.politico.eu/feed/ | direct verification blocked by robots; keep active pending independent XML response check |

Guardian's own documentation confirms that adding `/rss` to an index/section page produces the corresponding feed, matching the active Guardian entries.

## Technology / AI feed verification pass

The following active endpoints were directly response-checked as XML/RSS on 2026-09-05:

- TechCrunch `https://techcrunch.com/feed/` → `application/rss+xml`
- Ars Technica `https://feeds.arstechnica.com/arstechnica/index` → `text/xml`
- WIRED `https://www.wired.com/feed/rss` → `application/xml`
- The Verge `https://www.theverge.com/rss/index.xml` → `application/xml`
- Google Research `https://research.google/blog/rss/` → `application/rss+xml`
- Google DeepMind `https://deepmind.google/discover/blog/feed` → `text/xml`
- Microsoft Research `https://www.microsoft.com/en-us/research/feed/` → `application/rss+xml`

## Science / medicine / space feed verification pass

The following active endpoints were directly response-checked as XML/RSS on 2026-09-05:

- Nature `https://www.nature.com/nature.rss` → `application/rss+xml`
- Frontiers in Aging `https://www.frontiersin.org/journals/aging/rss` → `application/xml`
- Medical Xpress main feed `https://medicalxpress.com/rss-feed/` → `text/xml`
- Phys.org main feed `https://phys.org/rss-feed/` → `text/xml`
- EMA `https://www.ema.europa.eu/en/news.xml` → `application/rss+xml`
- JAMA Network Open `https://jamanetwork.com/rss/site_214/187.xml` → `text/xml`
- Space.com `https://www.space.com/feeds/all` → `application/xml`
- Carbon Brief `https://www.carbonbrief.org/feed/` → `application/rss+xml`

NASA's current registry entry could not be positively response-checked by the verifier in this pass; it remains active but should get a separate verification pass rather than being called confirmed.

## Libertarian feeds

| Source | Feed | Mode | Status |
|---|---|---|---|
| Reason | https://reason.com/feed/ | direct | verified RSS |
| Cato Institute / Cato at Liberty | http://feeds.cato.org/Cato-at-liberty | direct/opinion | verified RSS |
| Foundation for Economic Education | https://fee.org/feed/ | direct/opinion | verified RSS |
| Human Progress | https://humanprogress.org/feed/ | direct | verified RSS |
| Institute of Economic Affairs blog | https://iea.org.uk/blog/feed/ | direct/opinion | verified RSS |

Count with verified RSS: 5/5.

## Islam-critical discovery feeds

| Source | Feed | Mode | Status |
|---|---|---|---|
| Jihad Watch | https://www.jihadwatch.org/feed/ | discovery_only | verified RSS |
| RAIR Foundation USA | https://rairfoundation.com/feed/ | discovery_only | verified RSS |
| Bare Naked Islam | https://barenakedislam.com/feed/ | discovery_only | verified RSS |
| Gates of Vienna | https://gatesofvienna.net/feed | discovery_only | verified RSS |
| FrontPage Magazine | https://frontpagemag.com/feed | discovery_only | verified RSS |

Count with verified RSS: 5/5.

## Confirmed research / institutional feeds

- European Medicines Agency exposes an official `News and press releases` RSS endpoint at `https://www.ema.europa.eu/en/news.xml`. The active registry uses this XML endpoint rather than the HTML RSS overview page.
- JAMA Network Open's `New Online` XML endpoint `https://jamanetwork.com/rss/site_214/187.xml` responds as XML and is now the active registry endpoint.
- Google Research, Google DeepMind, Frontiers journal RSS endpoints, Medical Xpress and Phys.org main feeds have been response-checked as XML/RSS endpoints.

## Removed / not active RSS feeds

- TheReligionOfPeace.com: the site's own FAQ explicitly states that it has no RSS feed. Keep out of the RSS pool.
- Gatestone Institute: useful as a possible web/discovery source, but a current working RSS endpoint was not verified. Do not include it in the active RSS pool until a current feed is verified.

## Editorial safety

Islam-critical discovery feeds are radar only. Their own prose is not evidence. Scan should extract outbound links and prefer primary sources, authorities, courts, police, local reporting, Reuters/AP/BBC-class media, or other authoritative reporting. The discovery source itself disappears before Desk/Journalist source handling.

## Runtime status

The curated-feed registry compiles. Scan integration is implemented with bounded feed selection, RSS/Atom parsing, per-feed failure tolerance, BGE-M3 feed ranking and semantic deduplication, discovery-only outbound-link promotion, and Google/Bing fallback. CI passed after the last code cleanup.

## Verification pass 2026-09-05 — endpoint corrections

- Corrected JAMA Network Open to the official `New Online` XML feed: `https://jamanetwork.com/rss/site_214/187.xml`.
- Corrected EMA to the actual RSS endpoint `https://www.ema.europa.eu/en/news.xml`.
- Corrected Medical Xpress section feeds to their current `/rss-feed/breaking/.../` XML endpoints for sleep, mental health, men's health, healthy aging, endocrinology, sleep medicine and sports medicine.
- Corrected Phys.org section feeds that currently require `/rss-feed/breaking/.../` for Astronomy & Space, Space Exploration, Environment, Biotechnology and Economics & Business.
- Phys.org's Bio & Medicine and Quantum Physics feeds were independently confirmed as XML on their existing paths.
- Danmarks Statistik still exposes current news on `rss.dst.dk`, but legacy paths such as `/pressemeddelelser` now redirect to HTML; do not add them as RSS XML until a current XML endpoint is positively identified.


## Full endpoint audit 2026-09-05

A GitHub-hosted live audit requested every configured endpoint and inspected the returned body for RSS/Atom/XML structure. Before cleanup there were 114 configured endpoints:

- 105 returned parseable RSS/Atom/XML directly (HTTP 200).
- 7 were blocked or rate-limited to the audit runner (403/429), so this audit alone does not classify them as dead: Euractiv, Human Progress, IEA, Jihad Watch, FrontPage Magazine, NASA legacy feed, Carbon Brief.
- TV 2's configured feed had a DNS-resolution failure from the GitHub runner, but independent current feed-reader evidence still shows fresh TV 2 items from that endpoint; keep it provisionally and continue monitoring.
- Danmarks Nationalbank's configured `https://www.nationalbanken.dk/api/rss/nyheder` returned HTTP 404 and has therefore been removed from the active registry until the exact current XML endpoint is identified. Nationalbanken's official RSS catalogue confirms that feeds exist, but the individual URLs are not exposed reliably in our current retrieval.
- NASA's legacy `rss/dyn/breaking_news.rss` was rate-limited in the audit. The registry now uses NASA's current official News Releases feed `https://www.nasa.gov/news-release/feed/`, which NASA's current RSS directory advertises.
- Politico Europe returned HTTP 200 `application/rss+xml` in the live audit.
- All 10 configured Nature feeds returned HTTP 200 RSS.
- All 12 configured Frontiers feeds returned HTTP 200 XML.
- All configured Medical Xpress and Phys.org feeds returned HTTP 200 XML.

After removal of the invalid Nationalbanken entry, the active registry contains 113 endpoints.
