export type EditorialStage =
  | "scan"
  | "desk"
  | "journalist"
  | "media"
  | "editor_in_chief"
  | "publish";

export type Section = "indland" | "udland" | "erhverv" | "kultur" | "sport" | "viden" | "liv";

export interface SourceRef {
  url: string;
  publisher: string;
  title?: string;
  publishedAt?: string;
  authoritative?: boolean;
}

export interface NewsCandidate {
  id: string;
  title: string;
  summary?: string;
  section?: Section;
  sources: SourceRef[];
  discoveredAt: string;
}

export interface DeskDecision {
  candidateId: string;
  publish: boolean;
  priority: "lead" | "high" | "normal" | "low";
  section: Section;
  angle: string;
  rationale: string;
}

export interface ArticleDraft {
  candidateId: string;
  headline: string;
  deck?: string;
  body: string;
  section: Section;
  sourceRefs: SourceRef[];
  relatedCandidateIds?: string[];
}

export interface MediaDecision {
  kind: "photo" | "generated" | "none";
  url?: string;
  alt?: string;
  credit?: string;
  generationPrompt?: string;
}

export interface EditorialApproval {
  approved: boolean;
  notes: string[];
}

export interface PublishRecord {
  articleId: string;
  slug: string;
  publishedAt: string;
}
