# E-mailhandtekening van het Park

Een blokje onder de e-mailhandtekening van Stichting het Park dat elke dag
automatisch laat zien **wat er nu bloeit in het Park** en **wat het
eerstvolgende evenement is** (live van de agenda op hetparkinrotterdam.nl).

Zo ziet het eruit:

![voorbeeld](docs/handtekening.png)

## Hoe het werkt

- `data/bloeikalender.json` — de bloeikalender, samengesteld uit de
  beplantingslijsten van het Park (hoofdroute 2025, vak 11, gebied 10,
  Schiereiland/gebieden 1+7), de toelichting gebieden 12+13, het
  stinzenplanten-artikel en de Van der Kloet-bedden bij het Parkpaviljoen.
- `genereer.py` — kiest de bloeiregel van de dag (wisselt dagelijks tussen wat
  er op dat moment bloeit), leest het eerstvolgende evenement van
  [de agenda](https://hetparkinrotterdam.nl/agenda) en tekent het plaatje.
- `.github/workflows/ververs.yml` — draait het script elke ochtend en publiceert
  het resultaat in `docs/`.
- `docs/index.html` — de pagina waar medewerkers en vrijwilligers met één klik
  hun handtekening kopiëren.

De handtekening verwijst naar het plaatje via een **vast webadres**. Het is dus
géén bijlage: mailprogramma's van ontvangers laden het plaatje van internet,
en daar staat altijd de versie van vandaag.

## Eenmalige installatie

1. Zet deze map op GitHub (nieuw repository, bijv. `park-handtekening`,
   zichtbaarheid *public* — nodig voor GitHub Pages).
2. Ga naar **Settings → Pages** en kies bij *Source*: branch `main`,
   map `/docs`. Opslaan.
3. Ga naar de **Actions**-tab en zet workflows aan (groene knop).
   Start de workflow *Ververs handtekening* één keer handmatig via *Run workflow*.
4. Na een paar minuten staat de kopieerpagina op
   `https://<gebruikersnaam>.github.io/park-handtekening/`.
   Deel die link met iedereen die de handtekening wil gebruiken.

## Bloeikalender bijwerken

Klopt een bloeimoment niet, of is er iets nieuws geplant? Pas
`data/bloeikalender.json` aan (kan gewoon op GitHub in de browser, potloodje →
commit). Elke regel heeft een periode (`van`/`tot`, als `[maand, helft]`),
een prioriteit (1 = blikvanger, 2 = mooi, 3 = voor de fijnproever) en de bron.
De volgende ochtend rekent de workflow ermee.

Lokaal testen kan ook:

```bash
pip install pillow
python3 genereer.py        # schrijft docs/handtekening.png + index.html
```
