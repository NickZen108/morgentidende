import {
  CATEGORY_GUIDANCE,
  CATEGORIES,
  PIPELINE_CAPABILITIES,
  RIGHTS_RULE
} from "./policy";
import {
  generateFluxPencilHero,
  parseJsonObject,
  runDeskModel,
  runMediaModel,
  runTerra,
  type AiEnv
} from "./ai";
import type {
  ChiefEditorDecision,
  DeskDecision,
  EditorialOrder,
  MediaDecision,
  NewsCandidate,
  ScanRequest,
  ScanResult,
  ArticleDraft
} from "./types";
import type {
  ChiefReview,
  DeskAgent,
  EditorInChiefAgent,
  JournalistAgent,
  JournalistResearchPlan,
  MediaAgent,
  MediaEvaluation
} from "./pipeline";

const jsonOnly = "Svar kun med gyldig JSON uden markdown eller forklarende tekst.";

export class CloudflareDeskAgent implements DeskAgent {
  constructor(private readonly env: AiEnv) {}

  async choose(order: EditorialOrder, candidates: NewsCandidate[]): Promise<DeskDecision> {
    const system = [
      "Du er Desk på Morgentidende.",
      "Vælg højst én konkret kandidat, der bedst opfylder Chefredaktørens bestilling.",
      "Hvis ingen kandidat er god nok, afvis alle.",
      "Vurder nyhedsværdi, aktualitet, relevans og om kandidaten faktisk matcher bestillingen.",
      `Gyldige kategorier: ${CATEGORIES.join(", ")}.`,
      jsonOnly
    ].join(" ");

    const user = JSON.stringify({
      order,
      candidates: candidates.map(c => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        category: c.category,
        discoveredAt: c.discoveredAt,
        sources: c.sources.map(s => ({ publisher: s.publisher, title: s.title, url: s.url }))
      })),
      output_schema: {
        accepted: "boolean",
        candidateId: "string | omitted",
        priority: "lead | high | normal | low | omitted",
        category: "one of valid categories | omitted",
        rationale: "short string"
      }
    });

    const raw = await runDeskModel(this.env, system, user, { maxTokens: 700, temperature: 0.1 });
    return parseJsonObject<DeskDecision>(raw);
  }
}

export class TerraJournalistAgent implements JournalistAgent {
  constructor(private readonly env: AiEnv) {}

  async planResearch(order: EditorialOrder, candidate: NewsCandidate): Promise<JournalistResearchPlan> {
    const instructions = [
      "Du er journalist på Morgentidende.",
      "Planlæg kun den ekstra research, der faktisk er nødvendig før artiklen kan skrives.",
      "Hver researchbestilling skal være meget specifik og gå via Scan.",
      "Hvis sagen har en tydelig modpart, skal modpartens argument eller position forsøges fundet.",
      "Det gælder også når fx Trump eller Putin kritiseres: deres begrundelse eller argument skal forsøges fundet.",
      "Undgå mekanisk falsk balance når der ikke er en reel modpart.",
      "Scan returnerer ét fund pr. bestilling.",
      jsonOnly
    ].join(" ");

    const input = JSON.stringify({
      order,
      candidate,
      output_schema: {
        requests: [{ requestedBy: "journalist", searchType: "text | image | video | map_satellite", query: "specific query", purpose: "what this source must establish" }]
      }
    });

    const raw = await runTerra(this.env, instructions, input, 1200);
    const parsed = parseJsonObject<JournalistResearchPlan>(raw);
    return { requests: Array.isArray(parsed.requests) ? parsed.requests : [] };
  }

  async write(order: EditorialOrder, candidate: NewsCandidate, research: ScanResult[]): Promise<ArticleDraft> {
    const instructions = [
      "Du er journalist på Morgentidende og skriver på dansk.",
      "Skriv præcist, klart og neutralt i nyhedsartikler.",
      "Kommentar må være holdningsbåret i avisens politiske retning, men altid sober, rationel og aldrig vred eller skinger.",
      "Brug kun oplysninger, der kan forankres i de medsendte kilder.",
      "Hvis sagen har en tydelig modpart, gengiv også modpartens relevante argumenter fair.",
      "Gem kilderne struktureret i sourceRefs; de er skjult metadata og skal ikke nødvendigvis stå som rå links i brødteksten.",
      jsonOnly
    ].join(" ");

    const input = JSON.stringify({
      order,
      category_guidance: CATEGORY_GUIDANCE,
      candidate,
      research,
      output_schema: {
        candidateId: candidate.id,
        headline: "string",
        deck: "string optional",
        body: "complete article in markdown",
        category: "valid category",
        articleType: "news | followup | analysis | feature | comment | other",
        sourceRefs: [{ url: "string", publisher: "string", title: "string optional", sourceKind: "primary | authoritative | secondary | social | other", supports: ["claims supported by source"], notes: "optional" }],
        relatedCandidateIds: ["optional ids"]
      }
    });

    const raw = await runTerra(this.env, instructions, input, 6500);
    return parseJsonObject<ArticleDraft>(raw);
  }
}

export class GemmaMediaAgent implements MediaAgent {
  constructor(private readonly env: AiEnv) {}

  async buildQuery(article: ArticleDraft, priority: 1 | 2 | 3 | 4 | 5): Promise<ScanRequest> {
    const priorityText: Record<number, string> = {
      1: "foto fra den konkrete begivenhed",
      2: "foto af historiens centrale person",
      3: "foto fra stedet hvor sagen foregår",
      4: "lovligt videograb fra begivenheden",
      5: "lovligt kort eller satellitbillede af området"
    };
    const system = [
      "Du er billedredaktør på Morgentidende.",
      `Formulér én specifik Scan-bestilling efter denne prioritet: ${priorityText[priority]}.`,
      "Media søger aldrig selv; Scan gør retrieval.",
      RIGHTS_RULE,
      jsonOnly
    ].join(" ");
    const user = JSON.stringify({ article: { headline: article.headline, deck: article.deck, body: article.body.slice(0, 5000) }, priority });
    const raw = await runMediaModel(this.env, system, user, { maxTokens: 500, temperature: 0.1 });
    const parsed = parseJsonObject<Partial<ScanRequest>>(raw);
    return {
      requestedBy: "media",
      searchType: priority <= 3 ? "image" : priority === 4 ? "video" : "map_satellite",
      query: String(parsed.query || `${article.headline} ${priorityText[priority]}`),
      purpose: String(parsed.purpose || priorityText[priority])
    };
  }

  async evaluate(article: ArticleDraft, priority: 1 | 2 | 3 | 4 | 5, result: ScanResult): Promise<MediaEvaluation> {
    const system = [
      "Du er billedredaktør på Morgentidende.",
      "Vurder præcis ét fund ad gangen.",
      "Godkend kun hvis motivet er redaktionelt relevant til den konkrete artikel og rettighedsgrundlaget er tilstrækkeligt klart.",
      RIGHTS_RULE,
      "Ved uklar licens eller uklare kommercielle rettigheder skal accepted være false.",
      jsonOnly
    ].join(" ");
    const user = JSON.stringify({
      article: { headline: article.headline, deck: article.deck },
      priority,
      result,
      output_schema: {
        accepted: "boolean",
        reason: "string",
        decision: {
          kind: "photo | video_grab | map | satellite",
          url: result.url,
          alt: "short accessible description",
          credit: "string optional",
          license: "string optional",
          rightsVerified: "boolean",
          commercialUseAllowed: "boolean"
        }
      }
    });
    const raw = await runMediaModel(this.env, system, user, { maxTokens: 800, temperature: 0.1 });
    return parseJsonObject<MediaEvaluation>(raw);
  }

  async generateFlux(article: ArticleDraft): Promise<MediaDecision> {
    const dataUrl = await generateFluxPencilHero(
      this.env,
      `Illustrér denne nyhed uden tekst i billedet: ${article.headline}. ${article.deck ?? ""}`
    );
    return {
      kind: "generated",
      url: dataUrl,
      alt: `Illustration til: ${article.headline}`,
      credit: "Illustration: FLUX.1 Schnell / Morgentidende",
      license: "AI-generated",
      rightsVerified: true,
      commercialUseAllowed: true,
      generationPrompt: article.headline
    };
  }
}

export class TerraEditorInChiefAgent implements EditorInChiefAgent {
  constructor(private readonly env: AiEnv) {}

  async review(order: EditorialOrder, article: ArticleDraft, hero: MediaDecision): Promise<ChiefReview> {
    const instructions = [
      "Du er Chefredaktør på Morgentidende.",
      "Du får en pipeline-capability-oversigt med de konkrete modeller og deres styrker/begrænsninger. Brug den aktivt, når du bestiller ekstra research eller vurderer om et tidligere led realistisk kunne have løst en opgave.",
      "Du må rette alt selv: rubrik, underrubrik, brødtekst, vinkel, kategori, artikeltype og placering.",
      "Send ikke artiklen tilbage til Journalisten.",
      "Hvis dokumentation mangler, bestil målrettet ekstra research via Scan. Maksimalt fem ekstra Scan-bestillinger samlet pr. artikel.",
      "Repair-first: forsøg at reparere fremfor at afvise.",
      "Hvis hero er utilstrækkeligt, kan du bede Media om ét nyt hero-forløb.",
      "Leads skal have relevante opfølgninger, og du skal overveje om dagens lead også fortjener en Kommentar.",
      "Forsiden skal ligne en dansk omnibusavis: ca. 65-70 % hårde nyheder samlet og 80-90 % i øverste tredjedel.",
      "Indland, Udland og Penge skal dominere toppen, mens Viden og Liv har magasinblokke midt på forsiden.",
      jsonOnly
    ].join(" ");

    const input = JSON.stringify({
      pipeline_capabilities: PIPELINE_CAPABILITIES,
      order,
      article,
      hero,
      output_schema: {
        revisedArticle: "complete corrected ArticleDraft",
        revisedHero: "MediaDecision, usually same as input",
        extraScanRequests: [{ requestedBy: "editor_in_chief", searchType: "text | image | video | map_satellite", query: "specific query", purpose: "specific missing fact" }],
        requestBetterHero: "boolean",
        homepageSlot: "hero | lead-commentary | top | normal | magazine-feature | other",
        publishAt: "ISO timestamp optional",
        notes: ["short editorial notes"]
      }
    });

    const raw = await runTerra(this.env, instructions, input, 6000);
    const parsed = parseJsonObject<ChiefReview>(raw);
    parsed.extraScanRequests = Array.isArray(parsed.extraScanRequests) ? parsed.extraScanRequests.slice(0, 5) : [];
    return parsed;
  }

  async finalize(order: EditorialOrder, review: ChiefReview, extraResearch: ScanResult[], hero: MediaDecision): Promise<ChiefEditorDecision> {
    const instructions = [
      "Du er Chefredaktør på Morgentidende og laver den endelige redaktionelle version.",
      "Du får pipeline-capabilities og modeloversigten som kontekst, så du kender de øvrige leds faktiske styrker og begrænsninger.",
      "Indarbejd kun ekstra oplysninger der faktisk understøttes af den ekstra research.",
      "Ret selv alle resterende fejl. Der må ikke opstå et nyt loop tilbage til Journalisten.",
      "Publicér uden hero hvis billedforløbet mod forventning er fejlet helt.",
      jsonOnly
    ].join(" ");
    const input = JSON.stringify({ pipeline_capabilities: PIPELINE_CAPABILITIES, order, review, extraResearch, hero, output_schema: { article: "final ArticleDraft", hero: "final MediaDecision", homepageSlot: "string optional", publishAt: "string optional", notes: ["string"] } });
    const raw = await runTerra(this.env, instructions, input, 6500);
    return parseJsonObject<ChiefEditorDecision>(raw);
  }
}
