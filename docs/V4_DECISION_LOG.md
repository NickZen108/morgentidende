# Morgentidende — beslutningslog til v4

Dette er den levende beslutningsfil for Morgentidende under v3-eksperimentfasen. Formålet er at bevare de beslutninger, erfaringer og senere justeringer, som skal kunne bruges som specifikation, når Morgentidende v4 bygges fra bunden i et nyt repo.

## Prioritet for hvad der skal gemmes

Beslutningsloggen er først og fremmest til de dele af Morgentidende, som er dyre at genopfinde fra hukommelsen og afgørende for avisens adfærd:

1. **Avismotoren/pipelinen** — roller, rækkefølge, ansvar, research, faktatjek, retries, publicering, cadence, omkostninger og hvilke led der kan slås sammen eller fjernes.
2. **Forsiden** — lead, opfølgere, prioritering, placering, artikeltyper, visuelle regler og relationer mellem historier.
3. **Backend kun når den påvirker arbejdsgangen** — især hvordan artikler og ordrer sendes fra ChatGPT/chatten til Morgentidende, hvordan de går gennem Media/Chefredaktør/publicering, og hvordan status/fejl returneres.

Små backend-, CSS- og implementationstekniske detaljer skal normalt **ikke** gemmes her, medmindre de repræsenterer en produktbeslutning, der bør genbruges i v4.

## Sådan vedligeholdes filen

- Nye væsentlige beslutninger tilføjes med dato og status.
- Når en beslutning ændres, slettes historikken ikke. Den gamle beslutning markeres `Erstattet`, og den nye beslutning bliver `Aktiv`.
- Små implementationstekniske detaljer, som ikke bør arves til v4, holdes ude.
- V4 skal som udgangspunkt følge alle beslutninger med status `Aktiv`, medmindre de genovervejes eksplicit.
- Beslutninger om pipeline, forside og chat→avis-flow har højeste prioritet og skal opdateres løbende, når vi eksperimenterer.

Statusser: `Aktiv` · `Eksperiment` · `Erstattet` · `Forkastet`

---

## 1. Produkt og redaktionel identitet

### D-001 — Morgentidende er en bred nyhedsavis med tydelige interesseområder
**Dato:** 2026-09-06  
**Status:** Aktiv

Morgentidende skal være en bred dansk nyhedsavis, men med særlig interesse for emner, vinkler og spørgsmål, som er relevante fra nationalkonservative og libertære perspektiver. Det må ikke ske på bekostning af faktuel præcision eller pluralisme.

### D-002 — Pluralisme er en fast redaktionel regel
**Dato:** 2026-09-06  
**Status:** Aktiv

Ved relevante konflikter skal myndigheder, virksomheder, politiske modparter og andre centrale berørte parter så vidt muligt høres. Artikler må gerne være skarpt vinklet, men skal tydeligt skelne mellem dokumenterede fakta, forskning, hypoteser og partsudsagn.

### D-003 — Offentlig AI-tekst fjernes fra footeren
**Dato:** 2026-09-06  
**Status:** Aktiv

Footeren skal ikke indeholde teksten: “Artiklerne udarbejdes med AI og dokumenterede kilder. Kilder og billedkreditering fremgår af den enkelte artikel.” Morgentidende skal ikke fremsætte falske påstande om menneskelig produktion, men AI-driften skal heller ikke fremhæves unødigt på forsiden.

---

## 2. Kategorier og informationsarkitektur

### D-010 — Kategorien Politik findes ikke
**Dato:** 2026-09-06  
**Status:** Aktiv

`Politik` skal være fjernet fra både kode, prompts, datamodeller og brugerflade. Politisk stof fordeles primært mellem `Indland` og `Udland`.

### D-011 — Aktuelle hovedkategorier
**Dato:** 2026-09-06  
**Status:** Aktiv

De nuværende overordnede kategorier er: Indland, Udland, Penge, Kultur, Viden, Liv og Kommentar.

---

## 3. Forside, lead og opfølgere

### D-020 — Lead-historier samles visuelt med deres opfølgere
**Dato:** 2026-09-06  
**Status:** Aktiv

Lead-artiklen skal stå i en tydelig samlet kasse på forsiden. Relaterede opfølgningsartikler skal stå nedenunder lead-artiklen inde i samme kasse. Opfølgere må ikke blot behandles som tilfældige top-artikler; relationen til lead-historien skal være eksplicit i data/layout.

### D-021 — Lead udløser aktiv produktion af opfølgere
**Dato:** 2026-09-06  
**Status:** Aktiv

Når en historie bliver lead, skal systemet aktivt overveje og normalt igangsætte relevante opfølgere, fx:
- myndigheders eller modpartens svar,
- nye dokumenter eller tal,
- forklarende baggrund,
- perspektiv fra Morgentidendes særlige interesseområder,
- relevant forskning.

### D-022 — Relaterede artikler krydslinkes med én “Læs også”-boks
**Dato:** 2026-09-06  
**Status:** Aktiv

Relaterede hoved- og opfølgningsartikler skal linke til hinanden. Der må kun være én relevant “Læs også”-boks pr. passende placering; dubletter skal undgås.

### D-023 — Udgivelsesstrategi styres af artikeltype og nyhedsværdi
**Dato:** 2026-09-06  
**Status:** Aktiv

Forsideplacering må ikke afhænge af, om en artikel er manuelt eller automatisk oprettet.

- Stor, aktuel nyhed → hero/top 3 straks.
- Vigtig opfølgning med nye oplysninger → tæt på hovedhistorien/højt straks.
- Perspektivartikel i særlige interesseområder → synligt i øverste halvdel.
- Myndigheders/modpartens svar → kobles til hovedhistorien og vises synligt hurtigt.
- Almindelig nyhed → normal kronologisk placering.
- Baggrund/analyse/forklaring → særskilt fordybelses-/magasinområde.
- Let stof/livsstil/videnskab → eget visuelt felt længere nede.
- Smal eller ældre opfølgning → sektionsside/lavere prioritet.

Denne strategi skal implementeres som redaktionel logik, ikke som en hård gate.

---

## 4. Design og brugerflade

### D-030 — Masthead
**Dato:** 2026-09-06  
**Status:** Aktiv

Kun selve Morgentidende-logoet/mastheaden skal være sticky. Undertekst, datolinje og øvrige header-elementer skal ikke være sticky.

### D-031 — Mørk/lys og login i masthead
**Dato:** 2026-09-06  
**Status:** Aktiv

Øverste højre hjørne af masthead skal have:
- en tydelig skydeknap til mørk/lys tilstand,
- en Login-knap.

### D-032 — Forsiden skal være ren og avisagtig
**Dato:** 2026-09-06  
**Status:** Aktiv

- Ingen dato på forsiden.
- Ingen manchetter eller brødtekst som fylder under forsiderubrikker.
- Ingen tekst under hero på forsiden.
- “Også i dag” skal ikke vises.
- Teasertekst, hvor den anvendes, skal ikke være fed.
- Rubrikfont skal være relativt stor.
- Kategoritekst skal være lille og diskret.

### D-033 — Artikel-links
**Dato:** 2026-09-06  
**Status:** Aktiv

Hyperlinks inde i artikler skal være understregede og bruge samme lilla tone som avisens hoveddesign/header, så links er tydeligt genkendelige uden at ændre hele sidens linkstil.

### D-034 — Flere nyheder under artikler
**Dato:** 2026-09-06  
**Status:** Aktiv

Under hver artikel skal der være 2 rækker × 4 spalter med flere relevante nyheder på større skærme, med responsiv tilpasning på mobil.

### D-035 — Magasinområde
**Dato:** 2026-09-06  
**Status:** Aktiv

Ikke-dagsaktuelle historier som features, videnskab, kultur, sundhed, parforhold og andet længerelevende stof skal have et særskilt visuelt stærkt område med dyr magasinfornemmelse, gerne mørkelilla som kontrast til nyhedsfladen.

---

## 5. Sprog og præsentation

### D-040 — Dansk først
**Dato:** 2026-09-06  
**Status:** Aktiv

Rubrikker skal så vidt muligt undgå unødige udenlandske ord, bortset fra egennavne og ord uden rimelig dansk erstatning. Udenlandske citater oversættes til naturligt dansk, medmindre originalformuleringen i sig selv er journalistisk vigtig.

### D-041 — Terminologisk præcision
**Dato:** 2026-09-06  
**Status:** Aktiv

Brug etablerede danske betegnelser, fx “Det Muslimske Broderskab” frem for unaturlige direkte oversættelser.

---

## 6. Evidens, research og faktatjek

### D-050 — Én autoritativ kilde kan være tilstrækkelig
**Dato:** 2026-09-06  
**Status:** Aktiv

En troværdig autoritativ kilde kan alene være tilstrækkelig dokumentation for en påstand. Systemet skal ikke kunstigt kræve flere støttekilder, hvis den centrale oplysning er solidt dokumenteret.

### D-051 — `support_passages` skal ikke eksistere
**Dato:** 2026-09-06  
**Status:** Aktiv

Tidligere logik om `support_passages` skal ikke genindføres i v4. Dokumentation skal vurderes direkte ud fra relevante kilder og konkrete påstande.

### D-052 — Færre gates, bedre produktion
**Dato:** 2026-09-06  
**Status:** Aktiv

Designfilosofien er at forhindre fejl i selve produktionen frem for at bygge stadig flere hårde publiceringsgates. Kritiske faktuelle fejl skal selvfølgelig stoppe publicering, men præsentationsfejl og generative formater bør løses tidligere i kæden.

### D-053 — Skarp vinkel må ikke gå længere end forskningen
**Dato:** 2026-09-06  
**Status:** Aktiv

Morgentidende må gerne formulere skarpe og interessante forskningsvinkler, men artikler skal eksplicit skelne mellem:
- hvad studier faktisk dokumenterer,
- statistiske sammenhænge,
- plausible mekanismer,
- forskernes hypoteser,
- journalistiske spørgsmål, som endnu ikke er besvaret.

Især ved emner som religion, etnicitet, kriminalitet, IQ, genetik, familieformer og kultur må årsagssammenhænge ikke fremstilles stærkere end forskningsgrundlaget tillader.

---

## 7. Billeder og medier

### D-060 — Rigtige, relevante billeder prioriteres ekstremt højt
**Dato:** 2026-09-06  
**Status:** Aktiv

Morgentidende skal næsten altid kunne finde et lovligt og gratis foto, der er mindst moderat relateret til sagen. AI-genererede hero-billeder er sidste udvej, ikke standardfallback.

### D-061 — “Lovligt foto” betyder gratis og lovligt anvendeligt af Morgentidende
**Dato:** 2026-09-06  
**Status:** Aktiv

Billedkilder skal have dokumenterbare rettigheder, som gør det lovligt for Morgentidende at anvende billedet uden betaling. Relevante kilder kan fx være Openverse, Wikimedia Commons, myndigheder og andre verificerbare licenskilder.

### D-062 — Billedrelevans over generisk pynt
**Dato:** 2026-09-06  
**Status:** Aktiv

Et autentisk foto, der er nogenlunde relateret til sagen, foretrækkes frem for et flot, men opdigtet eller generisk AI-billede.

---

## 8. Redaktionel pipeline og automatisering

### D-070 — Pipelinekomponenter skal kende relevante capabilities
**Dato:** 2026-09-06  
**Status:** Aktiv

Chefredaktørrollen bør kende de centrale capabilities/modeller i de øvrige led, så den kan bestille realistisk arbejde og undgå unødige led.

### D-071 — v3-pipelinen er eksperimentel
**Dato:** 2026-09-06  
**Status:** Eksperiment

Scan, Desk, Journalist, Chefredaktør, Media og øvrige model-/Worker-valg i v3 betragtes ikke som permanente v4-beslutninger. v4 skal genoverveje antallet af led og undersøge, om nyere modeller kan kombinere discovery, research, kildevalg og skrivning billigere og bedre.

### D-072 — RSS er signal/discovery, ikke sandhedsgate
**Dato:** 2026-09-06  
**Status:** Aktiv

RSS/Scan skal betragtes som en metode til at opdage historier. En historie må ikke blive mindre værdifuld alene fordi kun én relevant lokal eller specialiseret kilde har den. Chefredaktøren vurderer nyhedsværdi og dansk relevans.

### D-073 — Kildeliste skal være kurateret, ikke enorm for sin egen skyld
**Dato:** 2026-09-06  
**Status:** Aktiv

Foretræk en vedligeholdt liste af relevante, fungerende feeds frem for tusindvis af lokale feeds med lav relevans. Kildemixet skal afspejle Morgentidendes interesseområder, men stadig understøtte faktuel research og pluralisme.

### D-074 — Automatisk cadence er et eksperimentparameter
**Dato:** 2026-09-06  
**Status:** Eksperiment

Frekvens som hvert 15. eller 30. minut bruges til test og feedback og skal ikke kopieres ukritisk til v4. v4 skal styre tempo efter nyhedsdag, budget, kvalitet og behov på forsiden.

---

## 9. Chat → avis og backend-arbejdsgang

### D-080 — Chatten skal kunne være et direkte redaktionelt kontrolpunkt
**Dato:** 2026-09-06  
**Status:** Aktiv

V4 skal bevare muligheden for, at brugeren fra en ChatGPT-samtale kan bestille en artikel, sende en færdig artikel, vælge eller påvirke forsideplacering og få den ind i avisens normale system uden manuel kopiering til GitHub eller database.

### D-081 — Færdige chatartikler skal kunne springe irrelevante produktionsled over
**Dato:** 2026-09-06  
**Status:** Aktiv

Når artiklen allerede er researched og skrevet i chatten, skal backend ikke tvinge den gennem en fuld skrivepipeline igen. Den skal kunne sendes direkte videre til de relevante resterende led, typisk Media, nødvendig faktuel kontrol/Chefredaktør og publicering. Systemet skal undgå unødige omskrivninger af brugerens færdige artikel.

### D-082 — Chat-flowet skal have tydelig status og fejlhåndtering
**Dato:** 2026-09-06  
**Status:** Aktiv

Når chatten sender en ordre eller artikel til avisen, skal systemet kunne returnere en forståelig status: modtaget, i produktion, pauset, fejlet eller publiceret — helst med artikel-/ordre-id og live-link ved publicering. Fejl skal kunne genoptages uden at skabe dubletter.

### D-083 — Backend-detaljer gemmes kun, når de ændrer redaktionel adfærd
**Dato:** 2026-09-06  
**Status:** Aktiv

Konkrete tabeller, endpoint-navne, Worker-klasser og interne implementationer er ikke v4-beslutninger i sig selv. De skal kun dokumenteres her, når de fastlægger en vigtig egenskab ved arbejdsgangen, sikkerheden, økonomien eller redaktionens kontrol.

---

## 10. Ting v4 specifikt skal genoverveje

Følgende er bevidst ikke låst permanent:

1. Om Scan og Desk skal eksistere som separate led.
2. Om Journalisten selv skal kunne søge bredt på nettet og sortere kilder.
3. Hvilke konkrete AI-modeller der bruges til de enkelte roller.
4. Cloudflare Worker/Web Search/Browser kontra andre search- og agentløsninger.
5. Hvor meget af redaktionslogikken der skal ligge i kode, prompts eller databasekonfiguration.
6. Den optimale udgivelsesfrekvens.
7. Den endelige login-/abonnementsmodel.
8. Hvor meget AI-brugen skal beskrives offentligt, hvis lovgivning, produktpositionering eller redaktionel strategi ændrer sig.
9. Den præcise transportmekanisme fra ChatGPT til v4-backend; produktkravet om direkte chat→avis-flow skal bevares, men den tekniske løsning må vælges på ny.

---

## 11. Ændringshistorik

### 2026-09-06
- Første samlede v4-beslutningslog oprettet.
- Beslutning om lead-kasse med opfølgere tilføjet.
- Beslutning om mørk/lys-toggle og login i masthead tilføjet.
- Beslutning om fjernelse af offentlig AI-footertekst tilføjet.
- Eksisterende redaktionelle, designmæssige, faktatjek- og billedprincipper samlet som v4-grundlag.
- Loggens prioritet præciseret: avismotor/pipeline og forside først; backend kun når det påvirker arbejdsgangen.
- Chat→avis-flow tilføjet som særskilt v4-område.

---

## Instruktion til fremtidig v4-opstart

Når v4 startes fra et tomt repo, skal denne fil læses før kode skrives. Første v4-arbejdsgang bør være:

1. Gennemgå alle `Aktiv`-beslutninger.
2. Genovervej alle `Eksperiment`-beslutninger ud fra aktuelle modeller, priser og capabilities.
3. Omsæt først pipeline-, forside- og chat→avis-beslutningerne til en ren kravspecifikation.
4. Design datamodel og pipeline fra bunden i stedet for at kopiere v3-kode.
5. Byg automatiske tests direkte ud fra de aktive produkt- og designregler.