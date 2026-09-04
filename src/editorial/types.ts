export type EditorialStage =
  | "editor_in_chief_order"
  | "scan"
  | "desk"
  | "journalist"
  | "media"
  | "editor_in_chief"
  | "publish";

export type Category = "indland" | "udland" | "penge" | "kultur" | "viden" | "liv" | "kommentar";
export type SearchType = "text" | "image" | "video" | "map_satellite";
export type RequestedBy = "editor_in_chief" | "journalist" | "media" | "desk";

export interface EditorialOrder {
  id: string;
  /** Chefredaktørens oprindelige autoritative prosabestilling. */
  instruction: string;
  /** Kompakt retrieval-brief. Scan må kun bruge denne til initial discovery, når den findes. */
  scanBrief?: string;
  /** Struktureret udvælgelsesbrief til Desk. */
  deskBrief?: string;
  /** Rig research- og skrivebrief til Journalisten. */
  journalistBrief?: string;
  category?: Category;
  articleType?: string;
  searchType?: SearchType;
  requestedPublishAt?: string;
  homepageSlot?: string;
}

export interface SourceRef {
  url: string;
  publisher: string;
  title?: string;
  publishedAt?: string;
  authoritative?: boolean;
  sourceKind?: "primary" | "authoritative" | "secondary" | "social" | "other";
  supports?: string[];
  notes?: string;
  retrievedAt?: string;
}

export interface ScanRequest {
  requestedBy: RequestedBy;
  searchType: SearchType;
  query: string;
  purpose: string;
}

export interface ScanResult {
  kind: "article" | "photo" | "video" | "map" | "satellite";
  url: string;
  title?: string;
  publisher?: string;
  summary?: string;
  publishedAt?: string;
  license?: string;
  commercialUseAllowed?: boolean;
  jurisdictionNote?: string;
  credit?: string;
  metadata?: Record<string, unknown>;
}

export interface NewsCandidate {
  id: string;
  title: string;
  summary?: string;
  category?: Category;
  sources: SourceRef[];
  discoveredAt: string;
}

export interface DeskDecision {
  candidateId?: string;
  accepted: boolean;
  priority?: "lead" | "high" | "normal" | "low";
  category?: Category;
  rationale: string;
}

export interface ArticleDraft {
  candidateId: string;
  headline: string;
  deck?: string;
  body: string;
  category: Category;
  articleType?: string;
  sourceRefs: SourceRef[];
  relatedCandidateIds?: string[];
}

export interface MediaDecision {
  kind: "photo" | "video_grab" | "map" | "satellite" | "generated" | "none";
  url?: string;
  alt?: string;
  credit?: string;
  license?: string;
  rightsVerified: boolean;
  commercialUseAllowed?: boolean;
  heroPriority?: 1 | 2 | 3 | 4 | 5 | 6;
  generationPrompt?: string;
}

export interface ChiefEditorDecision {
  article: ArticleDraft;
  hero: MediaDecision;
  homepageSlot?: string;
  publishAt?: string;
  notes: string[];
}

export interface PublishRecord {
  articleId: string;
  slug: string;
  publishedAt: string;
}
