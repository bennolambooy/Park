# E-mailhandtekeningen van het Park

[Handtekening kopiëren](https://bennolambooy.github.io/Park/) ·
[Beheer](https://bennolambooy.github.io/Park/admin.html) ·
[Voorbeeld met fictieve gegevens](https://bennolambooy.github.io/Park/?voorbeeld)

De beheerder maakt personen aan met naam, functie en eventueel een zakelijk telefoonnummer.
Iedere persoon krijgt een vaste kopieerlink. De handtekening bevat de groet, persoonsgegevens,
het originele Park-woordbeeld, adres, website, nieuwsbrief, sociale links, openingstijden
en het dagelijks bijgewerkte bloei- en agendablok. Het overzicht toont één
algemene kaart en daaronder een medewerkerskaart met één rij per collega,
naam, functie, telefoonnummer en rechts een kopieerknop. Kaartbreedte en kolommen
zijn gelijk aan Beheer; de handtekening binnen de kaart blijft compact.
De globale logostijl bepaalt de kleur, zonder dubbele kleurvarianten. Een klik op
de naam klapt het voorbeeld open; dat is standaard dicht voor zowel Algemeen als
medewerkers. Beide hebben dezelfde kopieerknop. ‘Kopieer HTML’ staat bij het voorbeeld
en kopieert de broncode als tekst. Persoonlijke links blijven beschikbaar via Beheer.
Algemeen bevat standaard ‘Met vriendelijke groet,’ en ‘Stichting het Park’.
De beheerkaart Algemeen laat de gedeelde groet, openingstekst, website, adres en
sociale links aanpassen, samen met logokleur en ‘Adres tonen’ onder één Opslaan-knop.
Alleen de organisatienaam geldt uitsluitend voor de
algemene handtekening; persoonlijke namen en functies blijven intact. Opslag gaat
in `data/instellingen.json.algemeen`; de generator publiceert dit in `agenda.json`.

De handtekening gebruikt Arial 14px (Helvetica als terugval), **relatieve regelafstand 1.4**, een logo van 132px,
de website, openingstijden en sociale links, gevolgd door bloei en agenda.
Gewone tekst staat in alinea's zonder breedte, maximale breedte of tabel. Apple Mail
maakte de eerdere procentuele breedtes bij plakken/verzenden alsnog 420px breed;
de aangeleverde testmail liep daardoor buiten een smal scherm. Alleen afbeeldingen
hebben nu eigen maten: het actuele blok is op desktop 420 × 56px en schaalt met
`max-width:100%;height:auto` proportioneel mee als er minder ruimte is. De gewone
tekst staat daar los van. De HTML-attributen behouden expliciet breedte en hoogte.
Browsercontroles vervangen geen echte verzendtest in Apple Mail op iPhone.
**Adres tonen** is een toolbrede optie die standaard uitstaat; aanzetten voegt straat
en postcode toe onder de website. Na een wijziging moet de handtekening opnieuw worden gekopieerd.
Bloei en agenda gebruiken bewust de Park-huisstijl: GT Walsheim 13px met
omlijnde labels. De dynamische afbeelding `handtekening-mail.png`
heeft een vast canvas van 900 × 120 pixels voor maximaal 420 × 56px weergave. De tekst volgt de
eigen pil met één gemeten spatie, zonder gedeelde tabkolom. De zichtbare letters
staan geometrisch midden in de pil. Bloei en agenda blijven altijd elk op één regel,
zonder afbreken of inkorten. Lange teksten schalen het hele blok proportioneel kleiner;
de twee regels en pillen behouden onderling dezelfde grootte. Het canvas blijft
even groot, zodat ook een volgende update bij vaste HTML-afmetingen niet vervormt.
Lange teksten worden alleen binnen deze afbeelding kleiner; dit is de afweging
bij volledige zinnen op één regel op een telefoon.
In beheer staan standaard vijf komende evenementen, met ‘Zie meer’ voor de rest.
Daaronder staat de geïntegreerde bloeikalender: één plantenlijst met de geplande
dagen erbij en een uitklapbaar jaaroverzicht. Teksten en periodes bewerken, toevoegen, verwijderen en uitgebloeid
melden gebeurt op dezelfde beheerpagina, met dezelfde sessie en knopstijlen.
De oude `beheer.html`-link verwijst naar `admin.html#bloeikalender`.
Medewerkers staan ook in één beheerkaart, met naam, functie en telefoonnummer.
Toevoegen en bewerken openen een formulier binnen die kaart. Nieuwe bloeiregels
hebben dezelfde Van/Tot-keuze als bestaande regels; bloeiteksten beginnen automatisch
met een hoofdletter. Kalenderinvoer blijft bij opslagfouten behouden.
Actieve bloei wisselt dagelijks (prioriteit bepaalt alleen de sorteervolgorde).
Met ‘Zet vast’ kies je één bloei; ‘Maak los’ hervat de dagelijkse wisseling.
Een pin krijgt een stabiel ID en een einddatum voor deze bloeiperiode, zodat hij
volgend jaar niet opnieuw actief wordt. Pauzeren of verwijderen heft de pin ook op.
Vastzetten en losmaken slaan direct op; bewerkingen eerst apart opslaan.
De verwachte dagen voor de komende week staan direct bij elke plant, inclusief een eventuele pin.
Naast de plantnaam staat de bloeiperiode. Het kruisje haalt de plant tot het
volgende bloeiseizoen uit de actieve lijst en de handtekening. De plant blijft in
het jaaroverzicht staan; ‘Overgeslagen’ > ‘Terugzetten’ maakt de keuze ongedaan.
Ook bij agenda staat een kruisje: dit sluit alleen de gekozen activiteit op die
datum uit, niet een volgende editie met dezelfde naam of URL. Overgeslagen items
zijn terug te zetten. Een eventuele pin op het overgeslagen item wordt losgemaakt.
Het actuele PNG-blok wordt op 12x getekend en glad verkleind naar 3x resolutie
voor scherpere omlijningen op schermen met hoge pixeldichtheid.
Het persoonsformulier bevat geen handtekeningvoorbeeld.
Publicatie van deze versie is op 17 september 2026 door de gebruiker gevraagd.
Kliktracking is uitgesteld; er wordt geen meetdienst of analyticskaart toegevoegd.
De afbeelding heeft expliciet breedte én hoogte: zonder hoogte verdween het actuele
blok in de aangeleverde mail op Mac Mail. De lokale EML-proef met vaste hoogte is
in Apple Mail zelf gecontroleerd; de iPhone-verzendtest blijft apart nodig.
Gewone handtekeningtekst loopt op smalle schermen door zonder opgegeven breedte.
Alle eerdere afbeeldings-URL's blijven ongewijzigd in opbouw voor bestaande mails.
Gebruikers kopiëren de nieuwe handtekening eenmalig opnieuw op ieder apparaat.
De tool stelt de berichttekst erboven niet in en kan een identieke weergave bij elke
ontvanger of het verversen van externe afbeeldingscaches niet afdwingen.
Installatiehulp voor Outlook, Apple Mail op Mac en iPhone staat standaard open op het overzicht.
Apple documenteert de iPhone-handtekening als alleen tekst; behouden van geplakte
afbeeldingen en opmaak moet op het echte apparaat worden gecontroleerd.
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
**Log uit** sluit de toegang en eventuele beheersessie. Dit is een eenvoudige schermvergrendeling,
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
npx playwright install chromium webkit
npm run test:browser
npm run test:layout
```

Browsertests controleren inloggen, personen aanmaken/bewerken/verwijderen, conflicten,
vastzetten en loslaten met vertraagde publicatie, alle logomodi, HTML-kopiëren, mobiele
weergave, kalender en uitloggen. Screenshots komen in `test-results/`.
De afzonderlijke layoutcontrole gebruikt Chromium en WebKit voor 320/375/390/900px,
lange persoonsgegevens, normale regelafstand, groeiende afbeeldingshoogte en
geblokkeerde afbeeldingen. Dit vervangt geen echte verzendtest in een mailprogramma.

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
