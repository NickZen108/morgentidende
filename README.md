# Morgentidende v3

Cloudflare Workers + Workflows, Supabase Postgres og en lille HTML/CSS/JS-forside.

Chefredaktør (Luna) → Desk (Luna med websøgning) → Journalist (Terra low) → Media → Chefredaktør → deterministisk Publish. Scan er en separat Worker.

## Udvikling

`npm ci`, `npx wrangler types`, `npx wrangler types scan-configuration.d.ts --config wrangler.scan.jsonc --env-interface ScanEnv`, `npm run check`.

GitHub Actions kører typekontrol, tests, begge Worker-builds og netkontrol af feedregisteret. Feedresultater gemmes som artifact. Registeret er en kandidatliste, ikke dokumentation for aktiv eller størrelsesrangeret avisdækning.

## Drift

Den eksisterende Worker hedder fortsat `morgentidende-v2` for at bevare adresse og secrets; runtime er v3. Databasen bruger udelukkende `v3_*`-tabeller. `v3_settings.enabled=false` stopper automatisk bestilling. V3-Scan konfigureres separat via `wrangler.scan.jsonc`.

`SUPABASE_SERVICE_ROLE_KEY` findes kun som Worker-secret. `ADMIN_TOKEN` er nødvendigt for manuelle produktionskald. Offentlig adgang giver kun publicerede artikler, billeder og forside.

## Status og resterende kontrol

V3 er flettet til main og deployet. Scan har sin egen Worker, D1-database og 15-minutters cron. Automatisk artikelproduktion er slukket. AI Gateway default har ved seneste kontrol ingen credits eller OpenAI-provider-nøgle; Luna og Terra er derfor endnu ikke afprøvet med rigtige kald.

16 tests, seks produktionsscenarier med simulerede eksterne tjenester, begge Worker-builds og Supabase-transaktionstests består. Der er endnu ikke produceret en rigtig artikel. Før automatisk drift: tilslut modelbetaling, verificér modeller og web_search, test Media med faktiske billeder, og gennemfør en samlet artikelproduktion.

Samme billedfamilie har en ubetinget database-cooldown på 10 dage. Derudover blokerer en serialiseret publiceringskontrol eksakte og visuelt lignende JPEG-varianter på tværs af kildeadresser. Testene dækker ændret størrelse, JPEG-komprimering, lysstyrke og mindre beskæringer. Vilkårlige redigeringer og forskellige optagelser fra samme fotoserie kan ikke garanteres genkendt; den del kræver stærkere familieoplysninger. Verificerede billedbytes gemmes i R2, så kildeadressens indhold ikke kan ændres efter kontrollen.

Migrationsplan: [docs/v3-build-plan.md](docs/v3-build-plan.md). Databaseintegrationstesten i `tests/database.sql` kører i en transaktion og ruller alt tilbage.
