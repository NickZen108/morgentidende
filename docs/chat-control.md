# Chatpublicering

Chatten accepterer kun `publish_article` og `status` via den signerede GitHub Actions-proces på chatops-branchen. Payload skal matche den konkrete Git-commit. De tidligere kommandoer `order`, `commission` og `publish_order` afvises. Chefredaktøren accepterer heller ikke de gamle workflow-inputs.

## Faktisk kaldesti

GitHub Actions → signatur og commit-kontrol → valideret færdig publiceringspakke → deterministisk billedbehandling → databasepublicering → forside.

Ingen Desk, Journalist, Media-agent eller Chefredaktør kaldes fra chatpubliceringen. Automatisk redaktion bruger fortsat sin egen pipeline.

## Publiceringspakken

Kommandoen indeholder UUID i `id`, `type: publish_article`, `article`, `slot` og obligatorisk `hero`. Artikel indeholder headline, deck, paragraphs, category, source_urls og image_query (sidstnævnte er et kompatibilitetsfelt). blocks kan indeholde paragraph, subheading, image og graphic.

Hvert billede har credit, alt, rights_basis, license og relevant license_url/source_url. `generated` er et selvstændigt boolean-felt, standard false. Sæt det til true for AI-genererede billeder; ejerskab siger intet om fremstillingsmetoden.

URL-billeder skal hentes via HTTPS fra upload.wikimedia.org eller avisens egen /media/-sti. Omdirigeringer og URL'er med brugernavn/password afvises. Billeder fra andre kilder vedlægges som data_base64 med mime image/jpeg, image/png eller image/webp og kilde-/licensdokumentation. Hero forbliver obligatorisk.

`status` kan indeholde command_id eller order_id. Genbrug af en publiceringskommando med samme ID og uændret indhold kan genfinde den eksisterende artikel; ændret indhold kræver nyt ID.

## Databasegrænse

Direkte publicering kræver en matchende privat kvittering fra den autentificerede chatindgang. En ordre mærket direct_article_v2 er ikke i sig selv tilstrækkelig. Kvitteringer er ikke offentligt læsbare eller skrivbare.

Den særskilte regel for inline-billeders genbrug er ikke ændret i denne rettelse.
