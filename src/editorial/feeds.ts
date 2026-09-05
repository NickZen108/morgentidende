import type { Category } from "./types";

export type FeedMode = "direct" | "primary" | "research" | "discovery_only";

export interface EditorialFeed {
  id: string;
  name: string;
  url: string;
  mode: FeedMode;
  language: string;
  country?: string;
  categories: Category[];
  topics: string[];
  authorityWeight: number;
  discoveryWeight?: number;
}

const f = (
  id: string,
  name: string,
  url: string,
  mode: FeedMode,
  categories: Category[],
  topics: string[],
  options: Partial<Pick<EditorialFeed, "language" | "country" | "authorityWeight" | "discoveryWeight">> = {}
): EditorialFeed => ({
  id,
  name,
  url,
  mode,
  categories,
  topics,
  language: options.language ?? "en",
  country: options.country,
  authorityWeight: options.authorityWeight ?? (mode === "primary" || mode === "research" ? 1 : mode === "discovery_only" ? 0 : 0.8),
  discoveryWeight: options.discoveryWeight ?? (mode === "discovery_only" ? 1 : 0.7)
});

/**
 * Curated feed pool for Scan. Individual feed failures must never abort a run.
 * discovery_only feeds are radar only: their own pages/content must never become
 * SourceRef evidence, article citations, source-box entries, or Supabase article sources.
 */
export const EDITORIAL_FEEDS: readonly EditorialFeed[] = [
  // Denmark / Danish research
  f("dr-all", "DR Nyheder", "https://www.dr.dk/nyheder/service/feeds/allenyheder", "direct", ["indland", "udland", "penge", "kultur", "viden", "liv"], ["danmark", "nyheder", "politik", "verden"], { language: "da", country: "DK", authorityWeight: 0.95 }),
  f("tv2-news", "TV 2 Nyheder", "https://services.tv2.dk/api/feeds/nyheder/rss", "direct", ["indland", "udland", "penge", "kultur", "viden", "liv"], ["danmark", "nyheder", "politik", "verden"], { language: "da", country: "DK", authorityWeight: 0.95 }),
  f("jp-top", "Jyllands-Posten – Topnyheder", "https://feeds.jp.dk/jp/topnyheder", "direct", ["indland", "udland", "penge", "kultur", "viden"], ["danmark", "nyheder", "politik", "erhverv"], { language: "da", country: "DK", authorityWeight: 0.9 }),
  f("politiken-top", "Politiken – Tophistorier", "https://politiken.dk/rss/tophistorier.rss", "direct", ["indland", "udland", "penge", "kultur", "viden", "liv"], ["danmark", "nyheder", "politik", "verden", "kultur"], { language: "da", country: "DK", authorityWeight: 0.9 }),
  f("nationalbanken-nyt", "Danmarks Nationalbank – Nyt", "https://www.nationalbanken.dk/api/rssfeed?topic=Nyt&lang=da", "primary", ["penge", "indland"], ["danmark", "økonomi", "renter", "finans", "nationalbanken"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("nationalbanken-press", "Danmarks Nationalbank – Pressemeddelelser", "https://www.nationalbanken.dk/api/rssfeed?topic=Pressemeddelelse&lang=da", "primary", ["penge", "indland"], ["danmark", "økonomi", "renter", "pressemeddelelser", "nationalbanken"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("nationalbanken-stats", "Danmarks Nationalbank – Statistiknyheder", "https://www.nationalbanken.dk/api/rssfeed?topic=Statistiknyhed&lang=da", "primary", ["penge", "indland", "viden"], ["danmark", "økonomi", "statistik", "finans", "nationalbanken"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("finansministeriet-news", "Finansministeriet – Nyheder", "https://fm.dk/nyheder/nyhedsarkiv/?rss=true", "primary", ["penge", "indland"], ["danmark", "økonomi", "finanspolitik", "skat", "offentlige finanser", "regering"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("retsinformation-eli", "Retsinformation – ELI-opdateringer", "https://www.retsinformation.dk/eli/eli-update-feed.atom", "primary", ["indland", "penge", "kultur", "viden", "liv"], ["danmark", "lovgivning", "bekendtgørelser", "regler", "retsinformation"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-all", "Høringsportalen – Alle høringer", "https://hoeringsportalen.dk/syndication/HearingsFeed", "primary", ["indland", "penge", "kultur", "viden", "liv"], ["danmark", "høringer", "lovgivning", "regulering", "myndigheder"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-politi", "Høringsportalen – Politi", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=19", "primary", ["indland"], ["danmark", "politi", "kriminalitet", "høringer", "regulering"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-retspleje", "Høringsportalen – Retspleje og domstole", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=20", "primary", ["indland"], ["danmark", "retspleje", "domstole", "retspolitik", "høringer"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-samfund", "Høringsportalen – Samfundsøkonomi, digitalisering og statistik", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=4", "primary", ["penge", "indland", "viden"], ["danmark", "samfundsøkonomi", "digitalisering", "statistik", "høringer"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-skat", "Høringsportalen – Skatter og afgifter", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=15", "primary", ["penge", "indland"], ["danmark", "skat", "afgifter", "økonomi", "høringer"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-sundhed", "Høringsportalen – Sundhed", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=12", "primary", ["liv", "viden", "indland"], ["danmark", "sundhed", "lægemidler", "regulering", "høringer"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-udlaendinge", "Høringsportalen – Udlændinge, flygtninge og integration", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=37", "primary", ["indland", "kultur"], ["danmark", "udlændinge", "migration", "integration", "høringer"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("hoering-erhverv", "Høringsportalen – Erhverv", "https://hoeringsportalen.dk/syndication/HearingsByFormAreaFeed?formAreaId=16", "primary", ["penge", "indland"], ["danmark", "erhverv", "virksomheder", "regulering", "høringer"], { language: "da", country: "DK", authorityWeight: 1 }),
  f("consilium-press", "EU-Rådet – Pressemeddelelser", "https://www.consilium.europa.eu/en/rss/pressreleases.ashx", "primary", ["udland", "penge", "indland"], ["eu", "eu-rådet", "pressemeddelelser", "udenrigspolitik", "økonomi", "lovgivning"], { language: "en", country: "EU", authorityWeight: 1 }),
  f("curia-press-da-en", "EU-Domstolen – Pressemeddelelser", "http://curia.europa.eu/site/rss.jsp?lang=da&secondLang=en", "primary", ["udland", "indland", "penge", "kultur"], ["eu", "eu-domstolen", "domme", "jura", "retspraksis", "pressemeddelelser"], { language: "da", country: "EU", authorityWeight: 1 }),
  f("eurlex-parliament-council", "EUR-Lex – Parlamentets og Rådets lovgivning", "https://eur-lex.europa.eu/EN/display-feed.rss?rssId=162", "primary", ["udland", "indland", "penge", "kultur", "viden"], ["eu", "lovgivning", "eu-ret", "forordninger", "direktiver", "parlamentet", "rådet"], { language: "en", country: "EU", authorityWeight: 1 }),
  f("ec-digital-strategy", "Europa-Kommissionen – Digital strategi", "https://digital-strategy.ec.europa.eu/en/rss.xml", "primary", ["viden", "penge", "udland"], ["eu", "digitalisering", "ai", "teknologi", "platforme", "data", "cybersikkerhed"], { language: "en", country: "EU", authorityWeight: 1 }),
  f("ec-competition-news", "Europa-Kommissionen – Konkurrencepolitik", "https://competition-policy.ec.europa.eu/node/38/rss_en", "primary", ["penge", "udland"], ["eu", "konkurrence", "statsstøtte", "karteller", "fusioner", "big tech", "regulering"], { language: "en", country: "EU", authorityWeight: 1 }),
  f("ec-growth-news", "Europa-Kommissionen – Indre marked og industri", "https://ec.europa.eu/newsroom/growth/feed?item_type=1053&sub=1&pr=all", "primary", ["penge", "udland", "viden"], ["eu", "indre marked", "industri", "virksomheder", "sme", "regulering", "standarder"], { language: "en", country: "EU", authorityWeight: 1 }),
  f("ec-jrc-news", "Europa-Kommissionen – Joint Research Centre", "https://joint-research-centre.ec.europa.eu/node/2/rss_en", "research", ["viden", "penge", "udland", "liv"], ["eu", "forskning", "videnskab", "teknologi", "økonomi", "sundhed", "klima"], { language: "en", country: "EU", authorityWeight: 1 }),
  f("ku-all", "Københavns Universitet", "https://nyheder.ku.dk/alle_nyheder/?get_rss=1", "primary", ["viden", "liv", "indland"], ["danmark", "forskning", "universitet"], { language: "da", country: "DK" }),
  f("ku-society", "KU – Samfund, politik & jura", "https://nyheder.ku.dk/samfund-politik-jura/?get_rss=1", "research", ["indland", "viden"], ["politik", "samfund", "jura"], { language: "da", country: "DK" }),
  f("ku-science", "KU – Natur, tal & teknologi", "https://nyheder.ku.dk/natur-tal-teknologi/?get_rss=1", "research", ["viden"], ["naturvidenskab", "teknologi", "ai", "data"], { language: "da", country: "DK" }),
  f("ku-health", "KU – Sundhed, krop & psyke", "https://nyheder.ku.dk/sundhed-krop-psyke/?get_rss=1", "research", ["liv", "viden"], ["sundhed", "psykologi", "krop", "meditation"], { language: "da", country: "DK" }),
  f("ku-culture", "KU – Kultur, sprog & historie", "https://nyheder.ku.dk/kultur-sprog-historie/?get_rss=1", "research", ["kultur", "viden"], ["kultur", "historie", "sprog"], { language: "da", country: "DK" }),

  // Major international reporting
  f("bbc-top", "BBC News", "https://feeds.bbci.co.uk/news/rss.xml", "direct", ["udland", "indland", "penge", "viden"], ["breaking", "world", "politics"]),
  f("bbc-world", "BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml", "direct", ["udland"], ["world", "politics", "conflict"]),
  f("bbc-business", "BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "direct", ["penge"], ["business", "economy", "markets"]),
  f("bbc-tech", "BBC Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml", "direct", ["viden", "penge"], ["technology", "ai"]),
  f("bbc-science", "BBC Science & Environment", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "direct", ["viden"], ["science", "environment", "climate"]),
  f("bbc-health", "BBC Health", "https://feeds.bbci.co.uk/news/health/rss.xml", "direct", ["liv", "viden"], ["health", "medicine"]),
  f("guardian-world", "The Guardian – World", "https://www.theguardian.com/world/rss", "direct", ["udland"], ["world", "politics"]),
  f("guardian-business", "The Guardian – Business", "https://www.theguardian.com/business/rss", "direct", ["penge"], ["business", "economy"]),
  f("guardian-science", "The Guardian – Science", "https://www.theguardian.com/science/rss", "direct", ["viden"], ["science", "research"]),
  f("guardian-tech", "The Guardian – Technology", "https://www.theguardian.com/technology/rss", "direct", ["viden", "penge"], ["technology", "ai"]),
  f("guardian-environment", "The Guardian – Environment", "https://www.theguardian.com/environment/rss", "direct", ["viden", "udland"], ["climate", "environment", "energy"]),
  f("guardian-society", "The Guardian – Society", "https://www.theguardian.com/society/rss", "direct", ["liv", "kultur", "udland"], ["society", "health", "family"]),
  f("ft-world", "Financial Times – World", "https://www.ft.com/world?format=rss", "direct", ["udland", "penge"], ["world", "economy", "geopolitics"]),
  f("ft-global-economy", "Financial Times – Global Economy", "https://www.ft.com/global-economy?format=rss", "direct", ["penge", "udland"], ["economy", "inflation", "trade"]),
  f("ft-markets", "Financial Times – Markets", "https://www.ft.com/markets?format=rss", "direct", ["penge"], ["markets", "stocks", "bonds"]),
  f("ft-tech", "Financial Times – Technology", "https://www.ft.com/technology?format=rss", "direct", ["penge", "viden"], ["technology", "ai", "companies"]),
  f("ft-companies", "Financial Times – Companies", "https://www.ft.com/companies?format=rss", "direct", ["penge"], ["companies", "business"]),
  f("ft-climate", "Financial Times – Climate Capital", "https://www.ft.com/climate-capital?format=rss", "direct", ["penge", "viden"], ["energy", "climate", "business"]),
  f("dw-all", "Deutsche Welle", "https://rss.dw.com/rdf/rss-en-all", "direct", ["udland"], ["europe", "world", "germany"]),
  f("france24-all", "France 24", "https://www.france24.com/en/rss", "direct", ["udland"], ["world", "breaking"]),
  f("france24-europe", "France 24 – Europe", "https://www.france24.com/en/europe/rss", "direct", ["udland"], ["europe", "politics"]),
  f("france24-middle-east", "France 24 – Middle East", "https://www.france24.com/en/middle-east/rss", "direct", ["udland"], ["middle east", "islamism", "security"]),
  f("france24-africa", "France 24 – Africa", "https://www.france24.com/en/africa/rss", "direct", ["udland"], ["africa", "politics", "security"]),
  f("france24-americas", "France 24 – Americas", "https://www.france24.com/en/americas/rss", "direct", ["udland"], ["americas", "usa", "politics"]),
  f("france24-asia", "France 24 – Asia-Pacific", "https://www.france24.com/en/asia-pacific/rss", "direct", ["udland"], ["asia", "china", "india"]),
  f("france24-business", "France 24 – Business/Tech", "https://www.france24.com/en/business-tech/rss", "direct", ["penge", "viden"], ["business", "technology"]),
  f("aljazeera", "Al Jazeera English", "https://www.aljazeera.com/xml/rss/all.xml", "direct", ["udland"], ["world", "middle east", "conflict"]),
  f("euractiv", "Euractiv", "https://www.euractiv.com/feed/", "direct", ["udland", "penge"], ["eu", "europe", "policy"]),
  f("politico-eu", "Politico Europe", "https://www.politico.eu/feed/", "direct", ["udland"], ["eu", "europe", "politics"]),

  // EU / economics / public data
  f("ecb-press", "European Central Bank – Press", "https://www.ecb.europa.eu/rss/press.html", "primary", ["penge", "udland"], ["ecb", "rates", "inflation", "euro"]),
  f("ecb-statpress", "European Central Bank – Statistics", "https://www.ecb.europa.eu/rss/statpress.html", "primary", ["penge"], ["statistics", "euro", "banking"]),
  f("eurostat-updates", "Eurostat – Statistics updates", "https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss", "primary", ["penge", "udland", "viden"], ["statistics", "demography", "economy", "eu"]),

  // Libertarian / classical-liberal
  f("reason", "Reason", "https://reason.com/feed/", "direct", ["udland", "kommentar", "kultur"], ["libertarian", "free speech", "state", "regulation"]),
  f("cato", "Cato Institute", "http://feeds.cato.org/Cato-at-liberty", "direct", ["udland", "penge", "kommentar"], ["libertarian", "economics", "civil liberties"]),
  f("fee", "Foundation for Economic Education", "https://fee.org/feed/", "direct", ["penge", "kommentar"], ["free market", "economics", "liberty"]),
  f("human-progress", "Human Progress", "https://humanprogress.org/feed/", "direct", ["viden", "penge", "kommentar"], ["progress", "data", "markets", "innovation"]),
  f("iea", "Institute of Economic Affairs", "https://iea.org.uk/blog/feed/", "direct", ["penge", "kommentar"], ["free market", "economics", "regulation"]),

  // Islam-critical discovery radar: never cite these pages themselves.
  f("jihadwatch", "Jihad Watch", "https://www.jihadwatch.org/feed/", "discovery_only", ["udland", "kultur"], ["islamism", "terror", "migration", "religion"]),
  f("rair", "RAIR Foundation USA", "https://rairfoundation.com/feed/", "discovery_only", ["udland", "kultur"], ["islamism", "migration", "security"]),
  f("bare-naked-islam", "Bare Naked Islam", "https://barenakedislam.com/feed/", "discovery_only", ["udland", "kultur"], ["islamism", "migration", "security"]),
  f("gates-of-vienna", "Gates of Vienna", "https://gatesofvienna.net/feed", "discovery_only", ["udland", "kultur"], ["islamism", "migration", "europe"]),
  f("frontpage", "FrontPage Magazine", "https://frontpagemag.com/feed", "discovery_only", ["udland", "kultur"], ["islamism", "security", "usa"]),

  // Technology / AI
  f("techcrunch", "TechCrunch", "https://techcrunch.com/feed/", "direct", ["viden", "penge"], ["technology", "ai", "startups"]),
  f("ars", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", "direct", ["viden", "penge"], ["technology", "science", "ai"]),
  f("wired", "WIRED", "https://www.wired.com/feed/rss", "direct", ["viden", "kultur"], ["technology", "science", "security"]),
  f("wired-ai", "WIRED – AI", "https://www.wired.com/feed/tag/ai/latest/rss", "direct", ["viden"], ["ai", "machine learning"]),
  f("verge", "The Verge", "https://www.theverge.com/rss/index.xml", "direct", ["viden", "kultur"], ["technology", "ai", "internet"]),
  f("404media", "404 Media", "https://www.404media.co/rss/", "direct", ["viden", "kultur"], ["technology", "internet", "security"]),
  f("mit-tech-review", "MIT Technology Review", "https://www.technologyreview.com/feed/", "direct", ["viden", "penge"], ["technology", "ai", "biotech"]),
  f("hackernews", "Hacker News", "https://hnrss.org/frontpage", "discovery_only", ["viden", "penge"], ["technology", "ai", "startups", "research"]),
  f("google-research", "Google Research", "https://research.google/blog/rss/", "primary", ["viden"], ["ai", "machine learning", "research"]),
  f("deepmind", "Google DeepMind", "https://deepmind.google/discover/blog/feed", "primary", ["viden"], ["ai", "machine learning", "science"]),
  f("microsoft-research", "Microsoft Research", "https://www.microsoft.com/en-us/research/feed/", "primary", ["viden"], ["ai", "machine learning", "research"]),
  f("apple-ml", "Apple Machine Learning Research", "https://machinelearning.apple.com/rss.xml", "primary", ["viden"], ["ai", "machine learning"]),
  f("mit-ml", "MIT News – Machine Learning", "https://news.mit.edu/topic/mitmachine-learning-rss.xml", "research", ["viden"], ["ai", "machine learning", "research"]),
  f("jmlr", "Journal of Machine Learning Research", "https://www.jmlr.org/jmlr.xml", "research", ["viden"], ["machine learning", "ai"]),
  f("arxiv-ai", "arXiv cs.AI", "https://export.arxiv.org/rss/cs.AI", "research", ["viden"], ["artificial intelligence", "ai"]),
  f("arxiv-ml", "arXiv cs.LG", "https://export.arxiv.org/rss/cs.LG", "research", ["viden"], ["machine learning", "ai"]),
  f("arxiv-nlp", "arXiv cs.CL", "https://export.arxiv.org/rss/cs.CL", "research", ["viden"], ["language models", "nlp", "ai"]),
  f("arxiv-cv", "arXiv cs.CV", "https://export.arxiv.org/rss/cs.CV", "research", ["viden"], ["computer vision", "ai"]),
  f("arxiv-ne", "arXiv cs.NE", "https://export.arxiv.org/rss/cs.NE", "research", ["viden"], ["neural networks", "evolutionary computing"]),

  // Nature topic feeds
  f("nature-main", "Nature", "https://www.nature.com/nature.rss", "research", ["viden"], ["science", "research"]),
  f("nature-ageing", "Nature – Ageing", "https://www.nature.com/subjects/ageing.rss", "research", ["liv", "viden"], ["ageing", "longevity", "geroscience"]),
  f("nature-cognitive-ageing", "Nature – Cognitive ageing", "https://www.nature.com/subjects/cognitive-ageing.rss", "research", ["liv", "viden"], ["cognitive ageing", "brain", "longevity"]),
  f("nature-neural-ageing", "Nature – Neural ageing", "https://www.nature.com/subjects/neural-ageing.rss", "research", ["liv", "viden"], ["neural ageing", "brain", "longevity"]),
  f("nature-neuroscience", "Nature – Neuroscience", "https://www.nature.com/subjects/neuroscience.rss", "research", ["viden", "liv"], ["neuroscience", "brain"]),
  f("nature-cognitive-neuro", "Nature – Cognitive neuroscience", "https://www.nature.com/subjects/cognitive-neuroscience.rss", "research", ["viden", "liv"], ["cognition", "neuroscience", "meditation"]),
  f("nature-psychology", "Nature – Psychology", "https://www.nature.com/subjects/psychology.rss", "research", ["liv", "viden"], ["psychology", "relationships", "behavior"]),
  f("nature-sleep", "Nature – Circadian rhythms and sleep", "https://www.nature.com/subjects/circadian-rhythms-and-sleep.rss", "research", ["liv", "viden"], ["sleep", "circadian", "health"]),
  f("nature-metabolism", "Nature – Metabolism", "https://www.nature.com/subjects/metabolism.rss", "research", ["liv", "viden"], ["metabolism", "glucose", "fasting"]),
  f("nature-epigenetics", "Nature – Epigenetics", "https://www.nature.com/subjects/epigenetics.rss", "research", ["viden", "liv"], ["epigenetics", "ageing", "biology"]),

  // Frontiers research feeds
  f("front-aging", "Frontiers in Aging", "https://www.frontiersin.org/journals/aging/rss", "research", ["liv", "viden"], ["longevity", "aging", "senescence"]),
  f("front-aging-neuro", "Frontiers in Aging Neuroscience", "https://www.frontiersin.org/journals/aging-neuroscience/rss", "research", ["liv", "viden"], ["aging", "neuroscience"]),
  f("front-human-neuro", "Frontiers in Human Neuroscience", "https://www.frontiersin.org/journals/human-neuroscience/rss", "research", ["liv", "viden"], ["neuroscience", "meditation", "brain"]),
  f("front-behavior-neuro", "Frontiers in Behavioral Neuroscience", "https://www.frontiersin.org/journals/behavioral-neuroscience/rss", "research", ["liv", "viden"], ["behavior", "neuroscience"]),
  f("front-psychology", "Frontiers in Psychology", "https://www.frontiersin.org/journals/psychology/rss", "research", ["liv", "viden"], ["psychology", "mindfulness", "relationships"]),
  f("front-psychiatry", "Frontiers in Psychiatry", "https://www.frontiersin.org/journals/psychiatry/rss", "research", ["liv", "viden"], ["psychiatry", "mental health"]),
  f("front-nutrition", "Frontiers in Nutrition", "https://www.frontiersin.org/journals/nutrition/rss", "research", ["liv", "viden"], ["nutrition", "metabolism", "supplements"]),
  f("front-endocrinology", "Frontiers in Endocrinology", "https://www.frontiersin.org/journals/endocrinology/rss", "research", ["liv", "viden"], ["hormones", "testosterone", "metabolism"]),
  f("front-physiology", "Frontiers in Physiology", "https://www.frontiersin.org/journals/physiology/rss", "research", ["liv", "viden"], ["exercise", "hrv", "physiology"]),
  f("front-sports", "Frontiers in Sports and Active Living", "https://www.frontiersin.org/journals/sports-and-active-living/rss", "research", ["liv", "viden"], ["exercise", "strength", "fitness"]),
  f("front-bioeng", "Frontiers in Bioengineering and Biotechnology", "https://www.frontiersin.org/journals/bioengineering-and-biotechnology/rss", "research", ["viden", "liv"], ["biotechnology", "bioengineering"]),
  f("front-ai", "Frontiers in Artificial Intelligence", "https://www.frontiersin.org/journals/artificial-intelligence/rss", "research", ["viden"], ["ai", "machine learning"]),

  // Medical Xpress – high-signal life/health sections
  f("medx-all", "Medical Xpress", "https://medicalxpress.com/rss-feed/", "direct", ["liv", "viden"], ["medicine", "health", "research"]),
  f("medx-sleep", "Medical Xpress – Sleep & Recovery", "https://medicalxpress.com/rss-feed/breaking/sleep-news/", "direct", ["liv", "viden"], ["sleep", "recovery", "circadian"]),
  f("medx-mental", "Medical Xpress – Psychology & Mental Health", "https://medicalxpress.com/rss-feed/breaking/mental-health-news/", "direct", ["liv", "viden"], ["psychology", "mental health", "relationships"]),
  f("medx-men", "Medical Xpress – Men's Health", "https://medicalxpress.com/rss-feed/breaking/mens-health-news/", "direct", ["liv", "viden"], ["men's health", "testosterone", "fitness"]),
  f("medx-aging", "Medical Xpress – Healthy Aging", "https://medicalxpress.com/rss-feed/breaking/healthy-aging-news/", "direct", ["liv", "viden"], ["aging", "longevity", "healthspan"]),
  f("medx-endocrine", "Medical Xpress – Endocrinology", "https://medicalxpress.com/rss-feed/breaking/endocrinology-metabolism-news/", "direct", ["liv", "viden"], ["hormones", "metabolism", "testosterone"]),
  f("medx-sleep-med", "Medical Xpress – Sleep Medicine", "https://medicalxpress.com/rss-feed/breaking/sleep-medicine-news/", "direct", ["liv", "viden"], ["sleep medicine", "recovery"]),
  f("medx-sports", "Medical Xpress – Sports Medicine", "https://medicalxpress.com/rss-feed/breaking/sports-medicine-news/", "direct", ["liv", "viden"], ["exercise", "sports medicine", "recovery"]),

  // Phys.org
  f("phys-all", "Phys.org", "https://phys.org/rss-feed/", "direct", ["viden"], ["science", "research"]),
  f("phys-bio-med", "Phys.org – Bio & Medicine", "https://phys.org/rss-feed/nanotech-news/bio-medicine/", "direct", ["viden", "liv"], ["biomedicine", "biotech"]),
  f("phys-quantum", "Phys.org – Quantum Physics", "https://phys.org/rss-feed/physics-news/quantum-physics/", "direct", ["viden"], ["physics", "quantum"]),
  f("phys-space", "Phys.org – Astronomy & Space", "https://phys.org/rss-feed/breaking/space-news/", "direct", ["viden"], ["space", "astronomy"]),
  f("phys-space-exploration", "Phys.org – Space Exploration", "https://phys.org/rss-feed/breaking/space-news/space-exploration/", "direct", ["viden"], ["space exploration", "rockets"]),
  f("phys-environment", "Phys.org – Environment", "https://phys.org/rss-feed/breaking/earth-news/environment/", "direct", ["viden", "udland"], ["environment", "climate"]),
  f("phys-biotech", "Phys.org – Biotechnology", "https://phys.org/rss-feed/breaking/biology-news/biotechnology/", "direct", ["viden", "liv"], ["biotechnology", "biology"]),
  f("phys-economics", "Phys.org – Economics & Business", "https://phys.org/rss-feed/breaking/science-news/economics-business/", "direct", ["penge", "viden"], ["economics", "business", "research"]),

  // Medicine / regulators
  f("fda-medwatch", "FDA MedWatch", "https://www.fda.gov/AboutFDA/ContactFDA/StayInformed/RSSFeeds/MedWatch/rss.xml", "primary", ["liv", "viden"], ["drug safety", "medicine", "health"]),
  f("ema-news", "European Medicines Agency – News", "https://www.ema.europa.eu/en/news.xml", "primary", ["liv", "viden", "udland"], ["medicine", "regulation", "drug safety"]),
  f("jama-open", "JAMA Network Open", "https://jamanetwork.com/rss/site_214/187.xml", "research", ["liv", "viden"], ["medicine", "health", "research"]),

  // Space / energy / climate
  f("nasa", "NASA Breaking News", "https://www.nasa.gov/news-release/feed/", "primary", ["viden"], ["space", "nasa", "science"]),
  f("spacecom", "Space.com", "https://www.space.com/feeds/all", "direct", ["viden"], ["space", "astronomy", "rockets"]),
  f("carbonbrief", "Carbon Brief", "https://www.carbonbrief.org/feed/", "direct", ["viden", "penge", "udland"], ["climate", "energy", "policy"])
] as const;

export const DISCOVERY_ONLY_FEED_IDS = new Set(
  EDITORIAL_FEEDS.filter(feed => feed.mode === "discovery_only").map(feed => feed.id)
);
