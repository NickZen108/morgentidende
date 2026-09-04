# Morgentidende

Morgentidende bygges fra bunden som en enkel, robust nyhedsplatform med Cloudflare som runtime og GitHub som source of truth.

## Redaktionel kæde

`Scan → Desk → Journalist → Media → Chefredaktør → Publish`

Foreløbig modelrollefordeling:

- **Scan:** deterministisk indsamling og normalisering af kandidater.
- **Desk:** Qwen3-30B vurderer relevans, nyhedsværdi og prioritet.
- **Journalist:** Terra skriver artiklen ud fra godkendt kildegrundlag.
- **Media:** Gemma 4 26B vælger/forbereder billedstrategi; FLUX bruges kun ved behov for genereret grafik.
- **Chefredaktør:** Terra laver sidste redaktionelle gennemgang.
- **Publish:** deterministisk kode publicerer godkendt output.

## Principper

- Ny kodebase; gammel `avisen`-kode kopieres ikke ind.
- Få, tydelige trin og ingen skjulte gates.
- Redaktionelle beslutninger gemmes som struktureret data.
- Publicering skal være idempotent og kunne genkøres sikkert.
- Secrets må aldrig ligge i GitHub.
- Frontend og backend skal kunne deployes samlet på Cloudflare.

## Status

Repoet er initialiseret. Første mål er en deploybar v0 med health endpoint, statisk frontend og en typed redaktionel pipeline.
