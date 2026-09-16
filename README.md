# E-mailhandtekeningen van het Park

[Handtekening kopiëren](https://bennolambooy.github.io/Park/) ·
[Beheer](https://bennolambooy.github.io/Park/admin.html) ·
[Voorbeeld met fictieve gegevens](https://bennolambooy.github.io/Park/?voorbeeld)

De beheerder maakt personen aan met naam, functie en eventueel een zakelijk telefoonnummer.
Iedere persoon krijgt een vaste kopieerlink. De handtekening bevat de groet, persoonsgegevens,
het originele Park-woordbeeld, adres, website, nieuwsbrief, sociale links, openingstijden
en het dagelijks bijgewerkte bloei- en agendablok. Het overzicht toont direct alle personen
in Park-groen en de actuele seizoenskleur. Elke variant kan worden gekopieerd of als HTML gedownload.

De actuele indeling gebruikt Helvetica 12px (Arial als terugval), een logo van 132px,
de website, openingstijden en sociale links, gevolgd door bloei en agenda.
**Adres tonen** is een toolbrede optie die standaard uitstaat; aanzetten voegt straat
en postcode toe onder de website. Na een wijziging moet de handtekening opnieuw worden gekopieerd.
Bloei en agenda behouden de omlijnde labels met Helvetica 12px (op Linux de
Helvetica-compatibele Nimbus Sans). De dynamische afbeelding `handtekening-regels.png`
heeft een vaste schermhoogte van 56px en dubbele pixelresolutie; de breedte groeit
mee met de inhoud. Geen regels worden afgebroken of kleiner gemaakt. Op een smal
scherm kan het voorbeeld daarom horizontaal scrollen; mailapps kunnen zelf schalen.
De oude afbeeldingen blijven beschikbaar voor bestaande mails.
Op Linux zijn voor generatie `fonts-liberation` en `fonts-urw-base35` nodig.

## Gebruik

1. Open **Beheer** en log in met het bestaande beheerwachtwoord.
2. Voeg een persoon toe, wacht op “Gepubliceerd” en deel de persoonlijke link.
3. De persoon kopieert de hele handtekening naar de e-mailinstellingen.
4. Na een wijziging van naam of functie moet de persoon opnieuw kopiëren. De link blijft gelijk.

De beheerder kan personen bewerken en verwijderen. Verwijderen trekt de kopieerlink in;
al verstuurde mails of eerder geplakte handtekeningen verdwijnen daarmee niet.

**Logokleur** is één algemene instelling:

- **Random** kiest bij openen tussen standaardgroen en de huidige seizoenskleur.
  ‘Andere logokleur’ wisselt de keuze; kopiëren neemt precies het zichtbare voorbeeld over.
- **Seizoenskleur** gebruikt paars (lente), rood (zomer), oker (herfst) of blauw (winter).
- **Groen** gebruikt altijd het standaard Park-groen.

De random keuze zit daarna in de gekopieerde handtekening; hij wordt niet opnieuw geloot
wanneer een ontvanger dezelfde e-mail opent. Seizoenskleur-afbeeldingen veranderen automatisch
met het seizoen. Een gewijzigde algemene modus geldt voor nieuwe kopieën.
De seizoensgrenzen zijn gelijk aan de oorspronkelijke tool: 21 maart, 21 juni, 21 september en 21 december.

## Vastzetten en vernieuwen

Vastzetten gebruikt de unieke evenement-URL, niet alleen de titel. Terugkerende activiteiten
met dezelfde naam zijn daardoor afzonderlijk selecteerbaar. Na de einddatum wordt automatisch
het eerstvolgende evenement gekozen.

Opslaan start een nieuwe publicatie. Het formulier is direct weer beschikbaar zodra GitHub
de opslag bevestigt. Op de achtergrond controleert de beheerpagina de bijbehorende aanvraag-id
in de gepubliceerde agenda en laadt daarna de nieuwe afbeelding. Bij vertraging blijft
er “opgeslagen, nog niet gepubliceerd” staan; **Lijst herladen** controleert opnieuw.
De kopieerpagina controleert elke minuut op een nieuwe versie.

Mailprogramma’s kunnen externe afbeeldingen cachen of blokkeren. De tool kan die cache niet
op afstand wissen. De preview krijgt een nieuwe afbeeldings-URL per versie; in gekopieerde
mails houden de afbeeldingen vaste URL’s, zodat toekomstige updates mogelijk blijven.

## Toegang en gegevens

Dit is een statische GitHub Pages-site. Voor alle schermen staat een wachtwoordscherm;
het gebruikt het bestaande Park-wachtwoord en onthoudt toegang alleen binnen het tabblad.
**Vergrendelen** sluit de toegang en eventuele beheersessie. Dit is een eenvoudige schermvergrendeling,
geen serverbeveiliging: de bestanden en repository blijven openbaar.
Er is één gedeelde beheerrol; personen hebben geen eigen account nodig. De eerste toegang
maakt nog geen beheersessie aan. De afzonderlijke beheerlogin ontgrendelt een beperkte GitHub-sleutel.
GitHub controleert schrijfbevoegdheid bij iedere wijziging. De ontsleutelde sleutel blijft
alleen in sessionStorage van het tabblad, met een expliciete uitlogknop. Er wordt geen nieuwe
sleutel of wachtwoord in dit project aangemaakt.

De site én repository zijn openbaar. Personen en zakelijke telefoonnummers zijn dus openbare
gegevens; persoonlijke links zijn geen toegangsbeveiliging. Vul geen privégegevens in.
Het verwijderen van een persoon wist de historische Git-commits niet.

Bij gelijktijdige wijzigingen controleert GitHub de bestandsversie. Een conflict overschrijft
geen gegevens en laat de invoer staan. Herlaad en controleer de invoer voordat je opnieuw opslaat.

## Opbouw

- `genereer.py`: dagelijkse generatie van banner, woordbeelden en openbare gegevens.
- `park/agenda.py`: begrensde HTML-parser, datums en evenementweergave.
- `park/personen.py`: profielvalidatie voor publicatie.
- `data/bloeikalender.json`, `data/instellingen.json`, `data/personen.json`: brongegevens.
- `sjabloon_index.html`: bron van de kopieerpagina; `docs/index.html` is gegenereerd.
- `docs/js/`: losse modules voor handtekening, beheer, kalender, opslag en klembord.
- `assets/woordbeeld.svg`: het originele horizontale woordbeeld van de Park-website.
- `assets/woordbeeld-masker.png`: transparante weergave op hoge resolutie; de generator
  kleurt alleen de originele vorm. Bron: https://hetparkinrotterdam.nl/assets/img/hetParkT.svg.
- `docs/woordbeeld-groen.png` en `docs/woordbeeld-seizoen.png`: e-mailgeschikte PNG’s.
- `tests/`: regressietests en browsercontrole met gesimuleerde GitHub-opslag.

## Lokaal uitvoeren

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python genereer.py
.venv/bin/python -m http.server 8765 --directory docs
```

De huisstijlfonts worden bij de eerste generatie van de eigen Park-website opgehaald en
blijven buiten de repository. De publicatie bevat een kopie onder `docs/fonts/`, zodat browsers
de echte fonts vanaf hetzelfde domein laden, zonder CORS-blokkade.
Open http://localhost:8765/?voorbeeld voor fictieve gegevens.
Beheerpagina’s schrijven met een geldige login naar het echte Park-repository; gebruik voor
testen de browsercontrole hieronder, die alle schrijftoegang vervangt door testgegevens.

```sh
.venv/bin/python -m unittest discover -s tests -v
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Browsertests controleren inloggen, personen aanmaken/bewerken/verwijderen, conflicten,
vastzetten en loslaten met vertraagde publicatie, alle logomodi, HTML-kopiëren, mobiele
weergave, kalender en uitloggen. Screenshots komen in `test-results/`.

## Publicatie

GitHub Pages gebruikt **GitHub Actions** als bron. `.github/workflows/ververs.yml`
draait dagelijks, handmatig en na wijzigingen op `main`. Hij valideert, genereert,
bewaart de output en publiceert die expliciet met `actions/deploy-pages`. Daarmee
zijn generatie en publicatie onderdeel van dezelfde gecontroleerde run.

`vercel.json` schakelt automatische Vercel-Git-deployments uit. Vercel is niet nodig voor
deze GitHub Pages-site; bestaande mislukte deployments blijven wel in de Vercel-historie staan.

Bij eerste ingebruikname van deze versie: zet bij **Settings → Pages → Source**
de bron op **GitHub Actions**, merge naar `main` en controleer de workflow.
De bestaande site-URL blijft gelijk. De productiejob draait uitsluitend op `main`.
`controle.yml` voert de volledige regressie- en browsertests uit op werkbranches en PR’s.

## Gerepareerde fouten

- De laatste agendakaart nam datums uit de footer mee: 11 oktober werd ten onrechte
  11 oktober t/m 4 september van het volgende jaar.
- Oude evenementen werden na 45 dagen naar volgend jaar verschoven.
- Vastzetten meldde succes vóór publicatie en ververste de afbeelding niet.
- Evenementen met dezelfde titel konden niet afzonderlijk worden vastgezet.
- Lange evenementtitels konden van de afbeelding vallen; ze worden nu afgebroken.
- De kalenderpreview telde dagen op basis van verstreken uren, met een afwijking rond
  zomertijd; hij gebruikt nu kalenderdagen.
- Het formulier bleef tijdens publicatie geblokkeerd. Opslag en publicatie lopen nu los;
  netwerkverzoeken hebben een tijdslimiet en fouten laten de invoer intact.
- De beheerkop gebruikte getypte tekst en het huisstijlfont werd geblokkeerd door CORS.
  Alle schermen gebruiken nu het bestaande PNG-woordbeeld en de echte Park-lettertypes.
