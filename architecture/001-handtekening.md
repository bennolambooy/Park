# ADR-001: Gewone tekst met een afzonderlijk actueel Park-blok

Status: Accepted for implementation — 2026-09-16

## Huidige correctie na echte mailtest — 2026-09-17

Deze keuze vervangt de breedte/hoogtekeuzes in de historische notities hieronder.
`Laatste testmail.eml` bevat twee blokken maar Apple Mail heeft hun 100%-breedtes
vervangen door 420px. Op 390px meet de mail 428px breed. Ook verdwijnt de afbeelding
in Mac Mail. Dezelfde lokale EML met expliciete afbeeldingshoogte toont hem wel;
alleen de regelhoogte aanpassen lost dit niet op.

Gewone tekst krijgt daarom breedtevrije alinea's, zonder tabel of 100%-breedte.
Typografie blijft Arial 14px/1.4. De nieuwe PNG `handtekening-mail.png` heeft een
vast canvas van 900×120 pixels en expliciete HTML-maten van 300×40px. Complete
bloei- en agendaregels passen proportioneel binnen dat canvas: geen afbreking,
afkapping of uitrekking bij toekomstige updates. Lange regels worden daardoor
klein; dit compromis blijft beperkt tot het beeld. Alle bestaande PNG-URL's blijven
hun oude generatie behouden. Opnieuw kopiëren is nodig. De nieuwe lokale EML is
zichtbaar in Mac Mail; ontvangst/verzending op de echte iPhone is nog onbewezen.

## Historische keuzes

Aanvulling tweedelige opbouw 2026-09-17: gewone tekst/logo krijgen een eigen
flexibel blok (100%, maximaal 420px). Het dynamische beeld staat daaronder buiten
de teksttabel, eveneens flexibel. Geen gedeelde vaste breedte die mailclients kan
aanzetten de hele handtekening te verkleinen. Tekst blijft Arial 14px/1.4;
uitsluitend het dynamische beeld wordt intern geschaald. Browsers lokaal getest,
weergave in een daadwerkelijk verzonden iPhone-mail moet nog worden bevestigd.

Definitieve aanvulling 2026-09-17: bloei en agenda mogen NOOIT afbreken.
Elk blijft één complete regel; de gezamenlijke afbeelding schaalt proportioneel
kleiner bij lange teksten. Dit vervangt alle eerdere keuzes voor regelafbreking
in het dynamische blok hieronder. Publicatie is door de gebruiker gevraagd.

Local refinement, pending user approval (2026-09-16): the user found the 12px
normal-spaced version too cramped. Local signature now uses Arial/Helvetica 14px,
relative line-height 1.4. The separate 420px image uses Park GT Walsheim 13px; 9px bold pill
labels are centered by visible ink bounds. Each description follows its own pill
with one measured space; the current entries fit on one line each. Longer entries
can wrap and the whole image scales on narrow screens. This supersedes
the typography and stacked-label decisions below. Do not publish until approved.

## Context

Het team gebruikt verschillende mailprogramma's en apparaten. De handtekening moet
herkenbaar, compact en eenvoudig te installeren zijn. Bloei en agenda moeten zonder
opnieuw kopiëren kunnen veranderen. De gebruiker kiest natuurlijke regelafstand en
staat afbreken op mobiel toe. Berichttekst, lettertype-instellingen van ontvangers
en afbeeldingscaches liggen buiten de invloed van deze statische tool.

## Decision

Behoud gewone HTML-tekst voor persoonsgegevens en links, het originele PNG-logo,
en één online PNG voor het actuele blok met omlijnde labels. Gebruik Helvetica/Arial
12px met normale regelafstand. Maak de HTML flexibel tot maximaal 420px en het
actuele blok 300px breed, 2x resolutie, zonder vaste HTML-hoogte. Labels staan boven
de bijbehorende tekst. Lange inhoud krijgt extra regels, geen kleinere letters.
De afbeelding heeft op desktop en mobiel dezelfde interne regelverdeling.

## Options considered

| Optie | Beheer en complexiteit | Voordeel | Nadeel |
| --- | --- | --- | --- |
| Gewone tekst + actueel beeld (gekozen) | Laag; bestaande generator en hosting | Klikbare, selecteerbare contactgegevens; actuele inhoud zonder installatie per wijziging | Beeldcache en appverschillen blijven |
| Hele handtekening als afbeelding | Laag | Eén vaste interne vormgeving | Slechter toegankelijk; contacttekst en individuele links gaan verloren; helpt niet de berichttekst |
| Alles gewone tekst | Laag | Flexibel en toegankelijk | Bloei en agenda verouderen na het kopiëren |
| Server-side toevoegen of app-integraties | Hoog; andere infrastructuur en accounts | Meer centrale controle over verzonden opmaak | Buiten gekozen werkwijze; installatie/beheer; niet steeds zichtbaar tijdens schrijven |

## Consequences

Herkenbaarheid komt uit logo, kleur, hiërarchie en het actuele blok, niet uit een
belofte dat elk mailprogramma exact dezelfde letters tekent. Contactgegevens blijven
bruikbaar als afbeeldingen niet laden. Online beeld kan door caching vertraagd
verversen of door een mailclient worden ingesloten als statische bijlage. iPhone Mail
documenteert alleen teksthandtekeningen: rich-copy-behoud vereist echte mailtests.

Nieuwe installaties gebruiken `handtekening-mobiel.png`; de drie oudere assets
behouden hun oude vormgeving en generatie. De gebruiker kopieert deze nieuwe
handtekening eenmalig opnieuw. Geen migratie van personen of beheerinstellingen.
De bestaande schermvergrendeling blijft schermvergrendeling, geen serverbeveiliging.

## Verification and release

JS/Python-regressietests; beheerflows met gesimuleerde opslag; Chromium/WebKit
op 320/375/390/900px; lange namen en titels; wisselende beeldhoogte; geblokkeerde
afbeeldingen; klembord en HTML-download. Tests zijn geen bewijs van Apple Mail
of Outlook-verzending. Publiceer pas na groene branch-CI, controleer de live assets
en mobiele pagina. Bij kapot kopiëren of beeldvervorming: revert de releasecommit
zonder gegevenswijzigingen terug te draaien, daarna opnieuw publiceren.
