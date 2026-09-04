import type { Section } from "./types";

export const MODELS = {
  scanEmbeddings: "BGE-M3",
  desk: "Qwen3-30B",
  journalist: "Terra",
  media: "Gemma 4 26B",
  editorInChief: "Terra",
  imageGeneration: "FLUX.1-schnell"
} as const;

export const SECTIONS: readonly Section[] = [
  "indland",
  "udland",
  "penge",
  "kultur",
  "viden",
  "liv"
] as const;

export const SECTION_GUIDANCE: Record<Section, string> = {
  indland: "Dansk politik og øvrige danske nyheder.",
  udland: "International politik og øvrige udenlandske nyheder.",
  penge: "Finans, erhverv, virksomheder, markeder og privatøkonomi.",
  kultur: "Kulturelle strømninger, ungdoms- og datingkultur, religiøs ekstremisme og kulturelle debatter.",
  viden: "Teknologi, AI, naturvidenskab og anden viden med særlig relevans for avisens læsere.",
  liv: "Parforhold, dating, forældreskab, sundhed, søvn, kost, motion, biohacking og meditation."
};

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
  journalistReturnLoop: false
} as const;
