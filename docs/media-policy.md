# Media-policy for Morgentidende v3

## Grundregel
Alle billeder på Morgentidende skal være gratis og lovlige til kommerciel redaktionel brug. Et rigtigt foto skal foretrækkes meget kraftigt frem for et AI-genereret billede. Media må gerne vælge et foto, der kun er kontekstuelt relateret til sagen, hvis det er tydeligt og ikke vildledende.

## Rigtigt foto først
Media skal udtømme realistiske muligheder for et lovligt foto, før FLUX overhovedet må kaldes. Søgningen må gradvist bredes ud fra den konkrete hændelse til centrale personer, sted, institution, objekt og til sidst det bredere emne.

Prioriteten er:
1. Foto fra den konkrete aktuelle begivenhed, når et lovligt foto findes.
2. Foto af den centrale person eller de centrale personer.
3. Foto af stedet, bygningen, institutionen, virksomheden eller organisationen.
4. Et ældre, men relevant foto af en central person, et sted eller en institution.
5. Et generelt foto, der tydeligt illustrerer emnet uden at foregive at vise den konkrete hændelse.
6. FLUX som absolut sidste udvej.

## Søgestrategi
Før FLUX skal Media mindst prøve:
- det verificerede, ikke-genererede mediearkiv,
- flere forskellige søgeforespørgsler i Wikimedia Commons,
- søgninger på artikelens centrale navne, steder og emneord,
- Openverse-resultater med licenser, der tillader kommerciel brug.

Søgningen skal ikke stoppe efter ét mislykket query. Media skal prøve flere query-varianter og flere kandidater. Et foto behøver ikke dokumentere den præcise hændelse; Gemma skal acceptere fotos af en relevant person, et relevant sted, en institution, et objekt eller det bredere emne, så længe brugen ikke er materielt vildledende.

## Rettigheder
Automatisk publicering må kun bruge et eksternt foto, når rettighedsmetadata er tilstrækkelig. CC BY, CC BY-SA, CC0 og public-domain-materiale kan bruges, når den konkrete licens og attribution er dokumenteret. Licenser med ikke-kommerciel begrænsning må ikke bruges automatisk.

For Openverse gælder, at Openverse er discovery-lag; Media skal gemme den konkrete licens, licens-URL, oprindelige landingsside, ophavsperson når tilgængelig og discovery-kilde sammen med billedet.

## FLUX-regel
FLUX må kun kaldes, når de reelle fotokilder er udtømt. Systemet skal logge `real_photo_exhausted` før FLUX-fallback. Et AI-genereret hero skal altid være tydeligt mærket som illustration, være ikke-fotorealistisk og må aldrig kunne forveksles med dokumentation af den virkelige hændelse.

Hvis Gemma afviser en FLUX-illustration, må Media prøve nye, mere neutrale illustrationer; en afvisning må ikke få systemet til at sænke kravene til et vildledende billede.

## Rettighedsmetadata
For hvert valgt hero skal Media gemme mindst kilde/landingsside, creator/fotograf hvis kendt, licens, licens-URL, credit, rettighedsgrundlag, tidspunkt for verificering, om billedet er genereret, og om vision-kontrollen er bestået.
