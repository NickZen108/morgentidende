# Dokumentation og kildekontrol

Både almindelig produktion og færdige chatartikler går gennem samme kontrol efter Media. Journalistens artikel kan indeholde `claims`; gamle indsendelser uden metadata accepteres stadig, men Chefredaktøren skal da selv identificere de centrale påstande. Metadata er et spor til dokumentation, aldrig et automatisk sandhedsstempel.

Hvert claim har et stabilt id, den præcise artikeltekst og kilder med URL, udgiver, dato, passage og afgrænsning. Eksempel inde i artikelobjektet:

```json
{
 "claims": [{
  "id": "defence-index-growth",
  "text": "Indekset er steget 450% siden februar 2022.",
  "sources": [{
   "url": "https://www.marketscreener.com/news/european-defence-stocks-cool-as-investors-reassess-war-winners-ce7e50d3df8afe2d",
   "publisher": "Reuters",
   "published_at": "2026-04-20",
   "excerpt": "Indsæt den præcise dokumenterende passage fra kilden.",
   "scope": "Det nævnte europæiske forsvarsindeks; februar 2022 til april 2026, ikke hele aktiemarkedet."
  }]
 }]
}
```

Systemet henter kildeindholdet selv og gemmer et afgrænset tekstudtræk, URL, hentetidspunkt og SHA-256 i den private `v3_attempts.verification_sources`. Chefredaktøren skal knytte vurderingen til en ordret passage fra det faktisk hentede indhold. Kode validerer passagens tilstedeværelse og at påstanden står i artiklen. Modellen vurderer, om passage og påstand semantisk stemmer, herunder indeks, periode og forbehold. Det reducerer fejl; det garanterer ikke, at modellen altid fortolker kilden korrekt.

- `supported`: dokumenteret i den hentede kilde med samme afgrænsning.
- `contradicted`: direkte modbevist af dokumentationen.
- `unresolved`: endnu ikke verificeret; en betalingsmur, en manglende passage eller en mistanke er ikke en faktuel fejl.

Uafklarede centrale påstande får højst tre målrettede Desk-søgninger samlet pr. forsøg. Desk finder dokumentation og omskriver aldrig en færdig indsendelse. Derefter vurderer Chefredaktøren artiklen igen. Alle identificerede påstande bevares, også hvis modellen glemmer en i anden vurdering. Små stavefejl skal ikke medføre afvisning. En dokumenteret alvorlig fejl kan fortsat udløse ét frisk produktionsforsøg; en direkte indsendelse omskrives ikke automatisk.

Er dokumentationen fortsat uafklaret, gemmes artiklen med status `paused` og `verification_unresolved`. Budgetstop under kontrollen giver `paused` og `daily_budget_exhausted`, vist som `budget_blocked` i chatstatus. Kontrollen bruger samme 10 DKK-dagsbudget inklusive chatordrer. Intet genoptages automatisk ved midnat. Pausen er en gemt redaktionel tilstand; workflowet afsluttes og kan ikke genstartes ved blot at gensende den samme kommando. En korrigeret indsendelse med nye kilder oprettes som en ny ordre; genoptagelse af eksisterende workflows er en særskilt driftsopgave.

Publiceringsspærren kræver en verificeret review-version og understøttede påstande. Eksisterende publicerede artikler berøres ikke; ældre upublicerede godkendelser skal gennem den nye kontrol. Migrering: `docs/sql/v3_claim_evidence.sql` før kodeudrulning. Automatikken aktiveres ikke, og Media-reglerne ændres ikke.

Kildehentning og modelkontekst er bevidst afgrænset. JavaScript-sider, PDF'er og passager uden for tekstudtrækket kan føre til pause. Det må aldrig blive registreret som bevis for, at artiklen er forkert.
