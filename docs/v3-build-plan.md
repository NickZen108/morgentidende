# Morgentidende v3 — migrations- og buildplan

Status ved inspektion 5. september 2026: GitHub NickZen108/morgentidende, Worker morgentidende-v2, Supabase ginjcxsmmksdkinweyva. V2 har ni tabeller, nul artikler og én ordre. V1 er et separat projekt og bevares. Cloudflare bygger automatisk main; implementeringen starter på morgentidende-v3.

## Implementering

1. Erstat src/editorial og gammel forside; historikken bevarer v2. Bevar kun verificerbare kildeoplysninger, ikke tidligere pipelineadfærd.
2. Nye v3-tabeller i eksisterende database; ingen afhængighed af gamle tabeller. Ordre og forsøg adskilles. Publicering og billedbrug er én transaktion med lås på billedfamilien og unik ordre-id.
3. Cloudflare Workflow gemmer hvert produktionsled. Chefredaktør Luna bestiller; Desk Luna researcher med web search; Terra low skriver og kan stille højst tre konkrete spørgsmål til Desk pr. forsøg. Dossier og uændret originalordre følger hele forløbet.
4. Media søger arkiv, derefter licensdokumenterede netbilleder, derefter FLUX. Nye/tvivlsomme billeder vurderes med Gemma Vision. Fotoidentitet og billedfamilie håndhæves ved publicering, også ved samtidige jobs. Alle billedbrug bevares; usage_count_30d opdateres ved brug og daglig vedligeholdelse.
5. Chefredaktørens slutkontrol returnerer kun ordrematch, rubrikkorrekthed og placering. Alvorlig fejl giver én frisk produktion fra den oprindelige ordre, uden tidligere kladde/dossier. Anden fejl dropper. Infrastrukturfejl genprøver samme trin og tæller ikke som ny redaktionel produktion.
6. Scan er separat Worker med 15-minutters cron, begrænset parallel hentning, RSS/Atom, deduplikering, persistente observationer og kompakte signaler. Signaler går til Chefredaktørens workflow; ingen direkte ordre/publicering fra Scan. Feedregister viser reelt verificeret dækning og fejl.
7. Chefredaktøren får kompakt database-state: aktive forsidepladser, produktion, 72-timers kategorimix og breaking. Kvartersjobs deduplikeres; publicering er ren kode. Dagligt antal er konfiguration, ikke fast produktkrav.
8. Frontend: navy #1c2733, creme #f8f5ef, klassisk serif, stor lead, højre nyhedsspalte, redaktionelt grid, mørklilla Viden/Liv. Kun publiceret indhold er offentligt; ingen kladder eller produktionstal.

## Validering og overgang

Typecheck, deterministiske workflowtests, databaseintegration med rollback, billedcooldown ved 10-dagesgrænsen, gentaget publicering, anonym adgang, build og mobil/desktop-visning. Deploy først med automatisk produktion slukket. Kontroller modelkald, research og billedlagring med en afgrænset prøve før cron aktiveres. Skift først main når build og databasen passer sammen. Den gamle databasekode kan arkiveres efter gennemført overgang; den nye runtime læser den aldrig.

## Eksterne forudsætninger

Cloudflare-browserlogin findes. Lokal Wrangler-login er endnu ikke etableret. Eksisterende Worker-secrets undersøges uden at udskrive værdier. Modeltilgængelighed, netbilleders licensbeviser og faktisk feeddækning skal verificeres; ingen tomme adaptere eller testdata må præsenteres som fungerende produktion.
