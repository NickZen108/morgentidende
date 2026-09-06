# Morgentidende v3

Cloudflare Workers + Workflows, Supabase Postgres og en HTML/CSS/JS-forside.

Chefredaktør (Luna) → Desk (Luna med websøgning) → Journalist (Terra low) → Media → Chefredaktør → deterministisk Publish. Scan er en separat Worker med 15-minutters cron. Automatisk artikelproduktion styres af `v3_settings.enabled` og er slukket ved denne ændring.

## Udvikling

`npm ci`, `npx wrangler types`, `npx wrangler types scan-configuration.d.ts --config wrangler.scan.jsonc --env-interface ScanEnv`, `npm run check`.
GitHub Actions tester også Production/Chief, begge Worker-builds og feedregisterets netadgang. Feedregisteret er en kandidatliste, ikke dokumentation for aktiv eller størrelsesrangeret dækning.

## Drift og budget

Worker: `morgentidende-v3`. Scan: `morgentidende-v3-scan`. Supabase bruger `v3_*`-tabeller.
`SUPABASE_SERVICE_ROLE_KEY` og `ADMIN_TOKEN` er Worker-secrets. OpenAI bruges via AI Gateway `default`; providerbetaling skal være konfigureret dér.

Alle produktionskald til tekstmodeller, billedanalyse, FLUX og billedkonvertering reserverer beløb i databasen **før** kaldet. Dagsgrænsen er højst **10 DKK efter dansk kalenderdato**, inklusive chatbestillinger og nye forsøg. Parallelle kald deler samme låste budget. Gratisforbrug trækkes ikke fra, så det ikke kan tælles dobbelt. Faste abonnementer og generel Workers/R2/Supabase-infrastruktur indgår ikke i dette variable produktionsbudget.

Afregningen er et estimat baseret på rapporteret tokenforbrug og modelpriser. Budgettet bruger en konservativ kurs på 12,5 DKK/USD inklusive reserve; det er ikke den faktiske fakturakurs. Manglende forbrugstal eller timeout belastes med hele reservationen. Ventende reservationer tæller også efter midnat. Prisændringer kræver opdatering af `src/v3/budget.ts`.

Websøgning begrænses til ét tool-kald pr. modelkald, med reservation for to fulde kontekstvinduer. Det kan stoppe produktion før de faktiske udgifter når 10 DKK. Ved budgetafvisning starter intet betalt kald; den berørte workflow kan fejle og kræver senere genoptagelse. Installationens resterende dag lukkes konservativt, fordi ældre forbrug ikke kan rekonstrueres.

`GET /api/admin/budget` og `GET /api/admin/costs` kræver admin-token. Private tabeller `v3_costs` og view `v3_article_costs` viser reservationer, model, fase, forbrug og estimerede udgifter pr. ordre. Chefredaktørens indledende bestillingsudgift knyttes til ordren efter oprettelse.

## Chatbestillinger

`.github/workflows/chatops.yml` kører fra `chatops`-grenen ved ændring af `.chatops/command.json`. Workflowet skal have `id-token: write` og bruge `scripts/chatops-dispatch.mjs` på samme gren.

Serveren verificerer GitHub OIDC-signaturen, audience, repo, ejer, gren, workflow, event, commit og udløb. Kommandoen kontrolleres mod den pågældende Git-commit. En permanent kvittering forhindrer gentagen dispatch. `status` er en signeret, gratis læsekommando til kontrol af forbindelsen. Ingen provider-nøgle sendes gennem chatkommandoer.

## Media og publicering

Media får original ordre og dossier, vælger billedsøgeord og prøver eget fotoarkiv, Wikimedia Commons og Openverse før **FLUX som sidste udvej**. Nye/tvivlsomme billeder kontrolleres med Gemma. PNG, WebP, GIF og AVIF kan normaliseres til JPEG via Images-bindingen. Openverse kræver licensbevis fra den oprindelige kildeside; manglende bevis afviser billedet. Afvisninger logges med årsag.

Samme billedfamilie har ubetinget 10 dages databasekarantæne. Publicering kontrollerer også identiske og visuelt lignende JPEG-varianter på tværs af adresser. Vilkårlige redigeringer og forskellige optagelser fra samme fotoserie kan ikke garanteres genkendt. Verificerede billedbytes gemmes i R2, så kildens indhold ikke kan ændres efter kontrollen.

`serious_error=true` blokerer publicering i både kode og database. Normal produktion må starte ét frisk andet forsøg; derefter droppes artiklen. Færdige chatartikler følger en separat deterministisk publiceringsvej med obligatorisk hero; de sendes ikke til Media-agenten eller Chefredaktøren.

## Databaseændring

Anvend `docs/sql/v3_budget_and_safety.sql` før denne kode deployes. Migreringen er anvendt i Supabase med transaktionelle budget- og replaytests. `tests/database.sql` kontrollerer publicering, alvorlige fejl, idempotens og billedkarantæne og ruller alt tilbage.

Chatstyring: se [docs/chat-control.md](docs/chat-control.md) for færdige publiceringspakker, obligatorisk hero, billedrettigheder og resultatforespørgsler. De gamle chatkommandoer `order`, `commission` og `publish_order` er fjernet. Kræver også `docs/sql/v3_chat_control.sql`.

Den direkte publiceringsvej kræver desuden `supabase/migrations/20260906154225_v3_direct_chat_receipt_guard.sql`. `tests/direct-chat-security.sql` tester kvitteringskravet og ruller alle testdata tilbage.
