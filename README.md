# E-mailhandtekening van het Park

Een blokje onder de e-mailhandtekening van Stichting het Park dat elke dag
automatisch laat zien **wat er nu bloeit in het Park** en **wat het
eerstvolgende evenement is** (live van de agenda op hetparkinrotterdam.nl).

Zo ziet het eruit:

<img src="docs/handtekening.png" width="560" alt="voorbeeld van de handtekening">

Het plaatje staat op dubbele resolutie (1120px) en wordt op 560px getoond,
zodat het op high-dpi-schermen scherp blijft.

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

**Voor hoveniers en vrijwilligers:** open `beheer.html` op de kopieerpagina-site.
Daar staat wat er volgens de kalender nu bloeit, met grote knoppen: *Uitgebloeid*
(verbergt de regel voor de rest van dit seizoen), *Bloeit nu al* en een
invulveld om zelf iets toe te voegen. Opslaan vraagt eenmalig een sleutel:
een *fine-grained personal access token* (github.com → Settings → Developer
settings) met alléén *Contents: read and write* op alléén dit repository.
De beheerder maakt die aan en deelt hem onderhands met de hoveniers.

Handmatig kan ook: pas `data/bloeikalender.json` aan (potloodje op GitHub →
commit). Elke regel heeft een periode (`van`/`tot`, als `[maand, helft]`),
een prioriteit (1 = blikvanger, 2 = mooi, 3 = voor de fijnproever) en de bron.
Een entry kan ook `"pauze_tot": "JJJJ-MM-DD"` hebben: tot en met die datum
wordt hij overgeslagen (zo werkt de *Uitgebloeid*-knop).

Na elke aanpassing aan de kalender draait de workflow automatisch en staat de
nieuwe versie binnen een minuut op het plaatje.

Lokaal testen kan ook:

```bash
pip install pillow
python3 genereer.py        # schrijft docs/handtekening.png + index.html
```
