# Styr Morgentidende fra chatten

Chatten sender kommandoer ved at committe en ny `.chatops/command.json` på grenen `chatops`. Brug et nyt UUID pr. ny kommando; genbrug samme UUID ved teknisk genafsendelse. Workflowet henter selv en kortlivet GitHub-identitet. Cloudflare API-token er ikke nødvendigt for chatkommandoer.

## Fri bestilling

```json
{"id":"NYT-UUID","type":"commission","count":2,"topic":"Aktuelle danske energinyheder"}
```

Udelad topic for frit redaktionelt valg. Dette er discovery, hvor Chefredaktøren vælger historier og vinkler.

## En præcis artikelbestilling

```json
{
 "id":"NYT-UUID","type":"order",
 "order":{
  "instruction":"BRUGERENS PRÆCISE INSTRUKTION, UÆNDRET",
  "category":"indland","mode":"specific",
  "angle":"Den aftalte vinkel","why_now":"Aktuel anledning",
  "words":500,"primary_source_required":true,"opposing_view_required":true
 }
}
```

Denne ordre valideres og sendes gennem Chefredaktørens kode til Production uden modelomskrivning. Desk, Journalist, Media og slutkontrol får samme originalordre. Udfyld felterne efter brugerens instruktion; opfind ikke nye krav.

## Færdig artikel

Gem den færdige DirectSubmission i Supabase `v3_orders.original_order`, som i det eksisterende direkte forløb. Send kun referencen på GitHub:

```json
{"id":"NYT-UUID","type":"publish_order","order_id":"ORDRENS-UUID"}
```

Media vælger hero og Chefredaktøren afgør publicering. Teksten omskrives ikke. To kommandoer til samme ordre bruger nu samme Workflow-id; genafsendelse starter ikke en parallel billedsøgning. En korrigeret artikel bør gemmes som en ny ordre, så den tidligere vurdering bevares. Teknisk genoptagelse af en fejlet workflow er en særskilt driftsopgave.

`publish_article` understøttes stadig, men lægger hele artikelteksten i Git-historikken. Brug derfor normalt den private Supabase-reference.

## Hent resultatet

```json
{"id":"NYT-UUID","type":"status","command_id":"DEN-OPRINDELIGE-KOMMANDOS-UUID"}
```

Eller brug `order_id` for én bestemt artikel. Uden reference returneres de seneste 20 ordrer. Angiv kun én af command_id og order_id.

Status indeholder:
- Ordrestatus og senest gemte fase.
- Publiceret rubrik og artikellink, hvis publiceret.
- Chefredaktørens begrundelse, hvis afvist.
- `budget_blocked`, hvis dagsbudgettet stoppede produktionen.
- Fælles dagsbudget og eventuel workflowstatus.

Læs resultatet i GitHub Actions-loggen. En grøn dispatch alene betyder **modtaget**, ikke **publiceret**. Følg op med status indtil ordren er publiceret, afvist eller stoppet. Status kalder ingen betalte modeller. GitHub Actions-loggen er offentlig i dette repo; status inkluderer ikke hele artikelteksten.

## Kø og drift

ChatOps bruger `queue: max`, så op til 100 kørsler kan vente i stedet for at erstatte hinanden. Over 100 ventende kørsler kræver genafsendelse. Hver kørsel læser sin egen commit, så senere kommandoer ikke ændrer tidligere ordrer.

Dagsgrænsen er fortsat 10 DKK inklusive chatbestillinger. Budgetstop bliver ikke automatisk genoptaget ved midnat. Automatisk redaktionel produktion aktiveres ikke af disse ændringer.

Databasen kræver `docs/sql/v3_chat_control.sql` før kodeudrulning. `scripts/test-chat-routes.mjs` tester adgangskontrol, genafsendelse og dobbeltbestillinger uden rigtige workflows eller modelkald.
