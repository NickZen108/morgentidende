import {
  HERO_PRIORITY,
  MAX_EDITOR_IN_CHIEF_EXTRA_SCAN_CALLS,
  RIGHTS_RULE
} from "./policy";
import type {
  ArticleDraft,
  ChiefEditorDecision,
  DeskDecision,
  EditorialOrder,
  MediaDecision,
  NewsCandidate,
  PublishRecord,
  ScanRequest,
  ScanResult
} from "./types";

export interface ScanService {
  /** Initial discovery may return a pool; Desk must choose at most one candidate. */
  discover(order: EditorialOrder): Promise<NewsCandidate[]>;
  /** Targeted research always returns at most one result. */
  lookup(request: ScanRequest, excludeUrls?: string[]): Promise<ScanResult | null>;
}

export interface DeskAgent {
  choose(order: EditorialOrder, candidates: NewsCandidate[]): Promise<DeskDecision>;
}

export interface JournalistResearchPlan {
  requests: ScanRequest[];
}

export interface JournalistAgent {
  planResearch(order: EditorialOrder, candidate: NewsCandidate): Promise<JournalistResearchPlan>;
  write(
    order: EditorialOrder,
    candidate: NewsCandidate,
    research: ScanResult[]
  ): Promise<ArticleDraft>;
}

export interface MediaEvaluation {
  accepted: boolean;
  reason: string;
  decision?: MediaDecision;
}

export interface MediaAgent {
  buildQuery(article: ArticleDraft, priority: 1 | 2 | 3 | 4 | 5): Promise<ScanRequest>;
  evaluate(
    article: ArticleDraft,
    priority: 1 | 2 | 3 | 4 | 5,
    result: ScanResult
  ): Promise<MediaEvaluation>;
  generateFlux(article: ArticleDraft): Promise<MediaDecision>;
}

export interface ChiefReview {
  revisedArticle: ArticleDraft;
  revisedHero: MediaDecision;
  extraScanRequests: ScanRequest[];
  requestBetterHero: boolean;
  homepageSlot?: string;
  publishAt?: string;
  notes: string[];
}

export interface EditorInChiefAgent {
  review(order: EditorialOrder, article: ArticleDraft, hero: MediaDecision): Promise<ChiefReview>;
  finalize(
    order: EditorialOrder,
    review: ChiefReview,
    extraResearch: ScanResult[],
    hero: MediaDecision
  ): Promise<ChiefEditorDecision>;
}

export interface Publisher {
  publish(order: EditorialOrder, decision: ChiefEditorDecision): Promise<PublishRecord>;
}

export interface PipelineDependencies {
  scan: ScanService;
  desk: DeskAgent;
  journalist: JournalistAgent;
  media: MediaAgent;
  editorInChief: EditorInChiefAgent;
  publisher: Publisher;
}

export type PipelineOutcome =
  | { status: "published"; order: EditorialOrder; record: PublishRecord }
  | { status: "no_candidate"; order: EditorialOrder; reason: string };

const noHero = (): MediaDecision => ({ kind: "none", rightsVerified: true });

function ensureOneDeskCandidate(decision: DeskDecision, candidates: NewsCandidate[]): NewsCandidate | null {
  if (!decision.accepted || !decision.candidateId) return null;
  return candidates.find((candidate) => candidate.id === decision.candidateId) ?? null;
}

async function journalistResearch(
  deps: PipelineDependencies,
  order: EditorialOrder,
  candidate: NewsCandidate
): Promise<ScanResult[]> {
  const plan = await deps.journalist.planResearch(order, candidate);
  const results: ScanResult[] = [];
  const seen = new Set<string>();

  for (const request of plan.requests) {
    const normalized: ScanRequest = {
      ...request,
      requestedBy: "journalist",
      searchType: request.searchType,
      query: request.query,
      purpose: request.purpose
    };
    const result = await deps.scan.lookup(normalized, [...seen]);
    if (result && !seen.has(result.url)) {
      seen.add(result.url);
      results.push(result);
    }
  }
  return results;
}

async function chooseHero(
  deps: PipelineDependencies,
  article: ArticleDraft
): Promise<MediaDecision> {
  const seen = new Set<string>();

  // Priorities 1-5 are retrieval. Scan returns one candidate per request.
  for (const step of HERO_PRIORITY.slice(0, 5)) {
    const priority = step.priority as 1 | 2 | 3 | 4 | 5;
    const request = await deps.media.buildQuery(article, priority);
    const result = await deps.scan.lookup(
      { ...request, requestedBy: "media", purpose: `${step.description}. ${RIGHTS_RULE}` },
      [...seen]
    );
    if (!result) continue;
    seen.add(result.url);

    const evaluation = await deps.media.evaluate(article, priority, result);
    if (evaluation.accepted && evaluation.decision?.rightsVerified) {
      return { ...evaluation.decision, heroPriority: priority };
    }
  }

  // Priority 6 is always FLUX.1 Schnell; failure must not block publication.
  try {
    const generated = await deps.media.generateFlux(article);
    return { ...generated, heroPriority: 6, rightsVerified: true };
  } catch {
    return noHero();
  }
}

async function chiefExtraResearch(
  deps: PipelineDependencies,
  requests: ScanRequest[]
): Promise<ScanResult[]> {
  const limited = requests.slice(0, MAX_EDITOR_IN_CHIEF_EXTRA_SCAN_CALLS);
  const results: ScanResult[] = [];
  const seen = new Set<string>();

  for (const request of limited) {
    const result = await deps.scan.lookup(
      { ...request, requestedBy: "editor_in_chief" },
      [...seen]
    );
    if (result && !seen.has(result.url)) {
      seen.add(result.url);
      results.push(result);
    }
  }
  return results;
}

/**
 * One bounded editorial cycle. Timing/cadence is intentionally outside this function;
 * the editor in chief will later decide when to create/run the next order.
 */
export async function runEditorialOrder(
  deps: PipelineDependencies,
  order: EditorialOrder
): Promise<PipelineOutcome> {
  const candidates = await deps.scan.discover(order);
  const deskDecision = await deps.desk.choose(order, candidates);
  const candidate = ensureOneDeskCandidate(deskDecision, candidates);

  if (!candidate) {
    return {
      status: "no_candidate",
      order,
      reason: deskDecision.rationale || "Desk rejected all candidates"
    };
  }

  const research = await journalistResearch(deps, order, candidate);
  const draft = await deps.journalist.write(order, candidate, research);
  let hero = await chooseHero(deps, draft);

  const review = await deps.editorInChief.review(order, draft, hero);
  const extraResearch = await chiefExtraResearch(deps, review.extraScanRequests);

  if (review.requestBetterHero) {
    hero = await chooseHero(deps, review.revisedArticle);
  }

  const finalDecision = await deps.editorInChief.finalize(
    order,
    review,
    extraResearch,
    hero
  );

  const record = await deps.publisher.publish(order, finalDecision);
  return { status: "published", order, record };
}
