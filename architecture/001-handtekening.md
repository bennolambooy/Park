# ADR-001: Gewone tekst met een afzonderlijk actueel Park-blok

Status: Accepted for implementation — 2026-09-16

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
