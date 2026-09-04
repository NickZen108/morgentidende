import type { Category } from "./types";

export const MODELS = {
  scanEmbeddings: "@cf/baai/bge-m3",
  desk: "@cf/qwen/qwen3-30b-a3b-fp8",
  journalist: "openai/gpt-5.6-terra",
  media: "@cf/google/gemma-4-26b-a4b-it",
  editorInChief: "openai/gpt-5.6-terra",
  imageGeneration: "@cf/black-forest-labs/flux-1-schnell"
} as const;

export const CATEGORIES: readonly Category[] = [
  "indland",
  "udland",
  "penge",
  "kultur",
  "viden",
  "liv",
  "kommentar"
] as const;

export const CATEGORY_GUIDANCE: Record<Category, string> = {
  indland: "Dansk politik og øvrige danske nyheder.",
  udland: "International politik og øvrige udenlandske nyheder.",
  penge: "Finans, erhverv, virksomheder, markeder og privatøkonomi.",
  kultur: "Kulturelle strømninger, ungdoms- og datingkultur, religiøs ekstremisme og kulturelle debatter.",
  viden: "Teknologi, AI, naturvidenskab og anden viden med særlig relevans for avisens læsere.",
  liv: "Parforhold, dating, forældreskab, sundhed, søvn, kost, motion, biohacking og meditation.",
  kommentar: "Avisens analyserende og holdningsbårne stof. Politisk ståsted må gerne være tydeligt, men tonen skal altid være sober, rationel, dokumenteret og aldrig vred eller skinger."
};

export const HOMEPAGE_MIX = {
  wholePageHardNewsTarget: { min: 0.65, max: 0.70 },
  upperThirdHardNewsTarget: { min: 0.80, max: 0.90 },
  categoryShareTargets: {
    indland: { min: 0.25, max: 0.30 },
    udland: { min: 0.20, max: 0.25 },
    penge: { min: 0.15, max: 0.20 },
    viden: { min: 0.10, max: 0.15 },
    liv: { min: 0.10, max: 0.15 },
    kultur: { min: 0.08, max: 0.12 },
    kommentar: { min: 0.05, max: 0.10 }
  },
  topTenRules: {
    requireIndland: true,
    requireUdland: true,
    requirePenge: true,
    avoidSingleCategoryDominance: true
  },
  otherVisibleStoriesTarget: { min: 2, max: 4 },
  magazineBlocks: ["viden", "liv"] as const,
  magazinePlacement: "middle",
  leadFollowupExpected: true,
  leadCommentary: "consider_when_editorially_relevant"
} as const;

export const MAX_EDITOR_IN_CHIEF_EXTRA_SCAN_CALLS = 5;
export const SCAN_RESULTS_PER_REQUEST = 1;

export const HERO_PRIORITY = [
  { priority: 1 as const, kind: "event_photo", description: "Foto fra den konkrete begivenhed" },
  { priority: 2 as const, kind: "central_person_photo", description: "Foto af historiens centrale person" },
  { priority: 3 as const, kind: "location_photo", description: "Foto fra stedet hvor sagen foregår" },
  { priority: 4 as const, kind: "legal_video_grab", description: "Lovligt videograb fra begivenheden" },
  { priority: 5 as const, kind: "map_satellite", description: "Lovligt landkort eller satellitfoto fra området" },
  { priority: 6 as const, kind: "flux_pencil", description: "FLUX.1 Schnell skraveret blyantillustration" }
] as const;

export const FLUX_STYLE_RULE =
  "Skraveret blyantillustration. Ikke fotorealistisk. Må ikke kunne forveksles med et dokumentarfoto.";

export const RIGHTS_RULE =
  "Asset skal være gratis og lovligt til kommerciel redaktionel brug i Danmark efter dansk ret eller EU-ret hvor EU-retten har forrang.";

export const PIPELINE_RULES = {
  repairFirst: true,
  infiniteLoopsForbidden: true,
  deskReturnsOneCandidate: true,
  scanReturnsOneResult: true,
  journalistResearchesViaScan: true,
  editorInChiefCanEditEverything: true,
  editorInChiefChoosesPlacement: true,
  publishIsCodeOnly: true,
  allowPublishWithoutHero: true,
  journalistReturnLoop: false,
  leadNeedsFollowupConsideration: true,
  leadMayNeedCommentary: true
} as const;
