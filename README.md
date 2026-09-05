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

Før automatisk drift: verificér modeller og web_search hos Cloudflare, test Media med faktiske billeder, gennemfør end-to-end-produktion og gennemgå feedrapporten. Samme billedfamilie har en ubetinget database-cooldown på 10 dage; registrering af varianter fra forskellige kilde-URL'er skal færdiggøres før billedarkivet kan betragtes som produktionsklart.

Migrationsplan: [docs/v3-build-plan.md](docs/v3-build-plan.md). Databaseintegrationstesten i `tests/database.sql` kører i en transaktion og ruller alt tilbage.
