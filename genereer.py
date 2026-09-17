#!/usr/bin/env python3
"""Genereert de e-mailhandtekening van het Park: wat bloeit er nu + eerstvolgend event.

Vormgeving volgt de huisstijl van hetparkinrotterdam.nl: Roslindale (serif) en
GT Walsheim (schreefloos), parkgroen #00752e en de seizoenskleuren van de site
(lente paars, zomer rood, herfst oker, winter blauw).

Output in docs/: handtekening.png, handtekening.txt, index.html
Draait dagelijks via GitHub Actions, maar werkt ook lokaal: python3 genereer.py
"""
import json
import math
import re
import hashlib
import shutil
from html import escape
import sys
import time
import urllib.request
from datetime import date, datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from park.agenda import MAANDEN, parse_events, formatteer_event
from park.personen import valideer_personen

BASIS = Path(__file__).parent
DOCS = BASIS / "docs"
AGENDA_URL = "https://hetparkinrotterdam.nl/agenda"

# huisstijlkleuren van hetparkinrotterdam.nl (uit assets/css/bundle.css)
KLEUREN = {
    "groen": (0, 117, 46),     # #00752e — basiskleur van het Park
    "tekst": (29, 29, 27),     # #1d1d1b
    "rand": (227, 227, 220),
    "lente": (108, 32, 155),   # #6c209b
    "zomer": (219, 0, 20),     # #db0014
    "herfst": (202, 123, 0),   # #ca7b00
    "winter": (0, 43, 137),    # #002b89
}


def vandaag():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Amsterdam")).date()
    except Exception:
        return date.today()


def seizoen(d):
    md = (d.month, d.day)
    if (3, 21) <= md <= (6, 20):
        return "lente"
    if (6, 21) <= md <= (9, 20):
        return "zomer"
    if (9, 21) <= md <= (12, 20):
        return "herfst"
    return "winter"


# ---------- bloeikalender ----------

def periode_index(maand, helft):
    return (maand - 1) * 2 + (helft - 1)


def is_actief(entry, idx):
    van = periode_index(*entry["van"])
    tot = periode_index(*entry["tot"])
    if van <= tot:
        return van <= idx <= tot
    return idx >= van or idx <= tot  # loopt over de jaarwisseling heen


def gepauzeerd(entry, dag):
    """Via de beheerpagina 'uitgebloeid' gemeld tot en met deze datum."""
    try:
        return dag <= date.fromisoformat(entry.get("pauze_tot", ""))
    except ValueError:
        return False


def kies_bloei(dag):
    kalender = json.loads((BASIS / "data" / "bloeikalender.json").read_text())
    idx = periode_index(dag.month, 1 if dag.day <= 15 else 2)
    actief = [e for e in kalender["entries"]
              if is_actief(e, idx) and not gepauzeerd(e, dag)
              and not (e.get("overslaan_tot", "") >= dag.isoformat())]
    pool = actief
    if not pool:
        return "Het Park, in elk seizoen de moeite waard"
    pool.sort(key=lambda e: (e["prio"], e["tekst"]))
    pin = kalender.get("vastgezet") or {}
    vast = next((e for e in pool if pin.get("id") and e.get("id") == pin["id"]
                 and pin.get("tot", "") >= dag.isoformat()), None)
    keuze = vast or pool[dag.timetuple().tm_yday % len(pool)]
    tekst = keuze["tekst"].strip()
    return ('IJ' + tekst[2:]) if tekst[:2].lower() == 'ij' else tekst[:1].upper() + tekst[1:]


# ---------- agenda ----------

def haal(url, pogingen=3):
    """urlopen met retries: het netwerk van een GitHub-runner hapert soms even."""
    fout = None
    for poging in range(pogingen):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "park-handtekening (stichting het Park)"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except Exception as e:
            fout = e
            time.sleep(5 * (poging + 1))
    raise fout


def haal_agenda():
    return haal(AGENDA_URL).decode("utf-8", "replace")


def lees_instellingen():
    """data/instellingen.json: { "vastgezet_titel": "..." } — gezet via de kopieerpagina."""
    try:
        return json.loads((BASIS / "data" / "instellingen.json").read_text())
    except Exception:
        return {}


def schrijf_agenda(events, dag, gekozen, instellingen, waarschuwing=""):
    """Publiceer de werkelijk gekozen activiteit en de verwerkte aanvraag."""
    data = {"bijgewerkt": dag.isoformat(),
            "logostijl": instellingen.get("logostijl", "random"),
            "toon_adres": instellingen.get("toon_adres") is True,
            "algemeen": instellingen.get("algemeen", {}),
            "vastgezet_id": instellingen.get("vastgezet_id", ""),
            "vastgezet_titel": instellingen.get("vastgezet_titel", ""),
            "agenda_verborgen": instellingen.get("agenda_verborgen", []),
            "aanvraag_id": instellingen.get("aanvraag_id", ""),
            "gekozen_id": gekozen["id"] if gekozen else "",
            "waarschuwing": waarschuwing,
            "events": [{**ev, "start": ev["start"].isoformat(),
                        "eind": ev["eind"].isoformat(), "tekst": formatteer_event(ev)}
                       for ev in events]}
    # Content version changes even when a second pin happens on the same day.
    data["versie"] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
    (DOCS / "agenda.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


def kies_event(dag):
    instellingen = lees_instellingen()
    waarschuwing = ""
    try:
        events = parse_events(haal_agenda(), dag)
        if not events:
            raise ValueError("Geen evenementkaarten herkend")
    except Exception as e:
        print(f"Agenda ophalen mislukt ({e}); gebruik de laatst bekende agenda.", file=sys.stderr)
        waarschuwing = "De agenda kon niet worden opgehaald. De laatst bekende evenementen worden gebruikt."
        try:
            vorige = json.loads((DOCS / "agenda.json").read_text())
            events = [{**ev, "start": date.fromisoformat(ev["start"]),
                       "eind": date.fromisoformat(ev["eind"]),
                       "id": ev.get("id", ev.get("url", ev["titel"]))}
                      for ev in vorige["events"]]
        except (OSError, ValueError, KeyError):
            events = []
    events = [ev for ev in events if ev["eind"] >= dag]
    verborgen = instellingen.get("agenda_verborgen", [])
    beschikbaar = [ev for ev in events if not any(
        item.get("id") == ev["id"] and item.get("start") == ev["start"].isoformat()
        for item in verborgen)]
    if "vastgezet_id" in instellingen:
        gekozen = next((ev for ev in beschikbaar if ev["id"] == instellingen["vastgezet_id"]), None)
    else:
        # Preserve the existing pinned title during the one-time migration.
        gekozen = next((ev for ev in beschikbaar if ev["titel"] == instellingen.get("vastgezet_titel")), None)
    gekozen = gekozen or (beschikbaar[0] if beschikbaar else None)
    schrijf_agenda(events, dag, gekozen, instellingen, waarschuwing)
    if gekozen:
        return formatteer_event(gekozen), gekozen["start"]
    return "bekijk de actuele agenda op hetparkinrotterdam.nl", dag


# ---------- tekenen ----------

FONT_BRON = "https://hetparkinrotterdam.nl/assets/css/fonts/"
# GT Walsheim: het lettertype dat het Park ook in e-mailhandtekeningen gebruikt
FONTS = ["GTWalsheim-Md.ttf", "GTWalsheim-Bd.ttf", "RoslindaleText-Regular.woff2"]


def zorg_voor_fonts():
    """De huisstijlfonts zijn gelicenseerd; we bewaren ze niet in het repo maar
    halen ze bij het draaien van de eigen website van het Park."""
    (BASIS / "fonts").mkdir(exist_ok=True)
    (DOCS / "fonts").mkdir(parents=True, exist_ok=True)
    for naam in FONTS:
        doel = BASIS / "fonts" / naam
        if not doel.exists():
            doel.write_bytes(haal(FONT_BRON + naam))
        # Serve from the Pages origin: the Park font server disallows cross-origin
        # browser requests. Fonts stay out of Git, but belong in the Pages artifact.
        shutil.copyfile(doel, DOCS / "fonts" / naam)


def font(bestand, maat, S):
    return ImageFont.truetype(str(BASIS / "fonts" / bestand), int(maat * S))


def mailfont(maat, S, vet=False):
    """Arial on macOS; its metric-compatible Liberation Sans on Linux."""
    naam = 'Arial Bold.ttf' if vet else 'Arial.ttf'
    linux = 'LiberationSans-Bold.ttf' if vet else 'LiberationSans-Regular.ttf'
    kandidaten = [Path('/System/Library/Fonts/Supplemental') / naam,
                  Path('/usr/share/fonts/truetype/liberation2') / linux,
                  Path('/usr/share/fonts/truetype/liberation') / linux]
    for pad in kandidaten:
        if pad.exists():
            return ImageFont.truetype(str(pad), int(maat * S))
    raise RuntimeError('Installeer Arial of fonts-liberation voor de compacte handtekening.')


def teken_chip(d, x, ycent, label, kleur, S, compact=False, lettertype=None):
    """Outlined pill-chip, zoals de tags op de website."""
    f = lettertype or (mailfont(8.5, S, True) if compact else font("GTWalsheim-Bd.ttf", 8.5, S))
    # lichte letterspatiëring, zoals caps op de site
    tw = sum(d.textlength(c, font=f) + 0.7 * S for c in label) - 0.7 * S
    padx, h = 9 * S, 19 * S
    w = tw + 2 * padx
    d.rounded_rectangle([x, ycent - h / 2, x + w, ycent + h / 2],
                        radius=h / 2, outline=kleur, width=S)
    cx = x + padx
    for c in label:
        d.text((cx, ycent), c, font=f, fill=kleur, anchor="lm")
        cx += d.textlength(c, font=f) + 0.7 * S
    return w


def tekstregels(d, segmenten, fonts, breedte):
    """Word wrap instead of clipping long titles or shrinking them to tiny type."""
    regels, regel, gebruikt = [], [], 0
    for tekst, vet in segmenten:
        for woord in re.findall(r"\S+\s*|\s+", tekst):
            if not regel:
                woord = woord.lstrip()
            w = d.textlength(woord, font=fonts[vet])
            if regel and gebruikt + w > breedte:
                regels.append(regel)
                regel, gebruikt = [], 0
                woord = woord.lstrip()
            # Very long unbroken words are split rather than lost off-canvas.
            for char in woord:
                cw = d.textlength(char, font=fonts[vet])
                if regel and gebruikt + cw > breedte:
                    regels.append(regel)
                    regel, gebruikt = [], 0
                regel.append((char, vet))
                gebruikt += cw
    if regel:
        regels.append(regel)
    return regels or [[("", False)]]


def maak_png(bloei, event, kleur_event, pad, compact=False):
    S, W = 2, 300 if compact else 560
    proef = ImageDraw.Draw(Image.new("RGB", (W * S, 100)))
    if compact:
        fonts = {True: mailfont(14, S), False: mailfont(14, S)}
    else:
        fonts = {True: font("GTWalsheim-Bd.ttf", 13, S),
                 False: font("GTWalsheim-Md.ttf", 13, S)}
    if " · " in event and not compact:
        titel, rest = event.split(" · ", 1)
        event_seg = [(titel, True), ("  ·  " + rest, False)]
    else:
        event_seg = [(event, False)]
    rijen = [("NU IN BLOEI", KLEUREN["groen"], [(bloei, False)]),
             ("IN DE AGENDA", kleur_event, event_seg)]
    breedtes = [teken_chip(proef, S, 20 * S, label, kleur, S, compact) for label, kleur, _ in rijen]
    x = S + max(breedtes) + 12 * S
    layouts = [tekstregels(proef, seg, fonts, (W - 4) * S - x) for _, _, seg in rijen]
    regelhoogte = 20 if compact else 18
    hoogtes = [max(32, len(regels) * regelhoogte + 12) for regels in layouts]
    img = Image.new("RGB", (W * S, (sum(hoogtes) + 6) * S), (255, 255, 255))
    d = ImageDraw.Draw(img)
    y = 19 * S
    for (label, kleur, _), regels, hoogte in zip(rijen, layouts, hoogtes):
        teken_chip(d, S, y, label, kleur, S, compact)
        for k, regel in enumerate(regels):
            cx = x
            for char, vet in regel:
                d.text((cx, y + k * regelhoogte * S), char, font=fonts[vet], fill=KLEUREN["tekst"], anchor="lm")
                cx += d.textlength(char, font=fonts[vet])
        y += hoogte * S
    img.save(pad, optimize=True)


# ---------- publicatiepagina ----------

def helvetica(maat, S, vet=False):
    mac = Path('/System/Library/Fonts/Helvetica.ttc')
    if mac.exists():
        return ImageFont.truetype(str(mac), int(maat * S), index=1 if vet else 0)
    # Nimbus Sans is the Helvetica-compatible font supplied by URW on Linux.
    naam = 'NimbusSans-Bold.otf' if vet else 'NimbusSans-Regular.otf'
    return ImageFont.truetype('/usr/share/fonts/opentype/urw-base35/' + naam, int(maat * S))


def maak_regels_png(bloei, event, kleur_event, pad):
    """Two unbroken lines at 12px. Fixed display height preserves type size as width changes."""
    S = 2
    f, chipfont = helvetica(12, S), helvetica(8.5, S, True)
    rijen = [('NU IN BLOEI', KLEUREN['groen'], ' '.join(bloei.split())),
             ('IN DE AGENDA', kleur_event, ' '.join(event.split()))]
    proef = ImageDraw.Draw(Image.new('RGB', (1000, 112)))
    chipbreedtes = [teken_chip(proef, S, 13*S, label, kleur, S, lettertype=chipfont)
                   for label, kleur, _ in rijen]
    x = S + max(chipbreedtes) + 12*S
    breedte = max(300*S, math.ceil(x + max(proef.textlength(t, font=f) for _, _, t in rijen) + 3*S))
    img = Image.new('RGB', (breedte, 56*S), 'white')
    d = ImageDraw.Draw(img)
    for i, (label, kleur, tekst) in enumerate(rijen):
        y = (13 + 26*i)*S
        teken_chip(d, S, y, label, kleur, S, lettertype=chipfont)
        d.text((x, y), tekst, font=f, fill='#000000', anchor='lm')
    img.save(pad, optimize=True)


def mobiele_regels(d, tekst, f, breedte, eerste_breedte=None):
    """Wrap whole words using the same kerning as the final drawing; never truncate."""
    regels, regel = [], ''
    def beschikbaar():
        return eerste_breedte if not regels and eerste_breedte is not None else breedte
    for woord in tekst.split():
        voorstel = (regel + ' ' + woord).strip()
        if d.textlength(voorstel, font=f) <= beschikbaar():
            regel = voorstel
            continue
        if regel:
            regels.append(regel)
            regel = ''
        elif not regels and eerste_breedte is not None and d.textlength(woord, font=f) > eerste_breedte:
            # Keep a word whole on the next line if it cannot fit after the pill.
            regels.append('')
        # Exceptionally long unbroken words must not push the image off-screen.
        for char in woord:
            if regel and d.textlength(regel + char, font=f) > beschikbaar():
                regels.append(regel)
                regel = ''
            regel += char
    if regel:
        regels.append(regel)
    return regels or ['']


def pil_geometrie(d, label, f, S):
    """Center visible ink, not the font's ascender/descender box."""
    links, boven, rechts, onder = d.textbbox((0, 0), label, font=f)
    breedte, hoogte = rechts-links + 14*S, 18*S
    return breedte, hoogte, (breedte-(rechts-links))/2-links, (hoogte-(onder-boven))/2-boven


def tekst_bovenkant(d, f, y, regelhoogte):
    """Match the capital-height centre of body type to the pill's label centre."""
    _, top, _, bottom = d.textbbox((0, 0), 'H', font=f)
    return y + (regelhoogte-(bottom-top))/2-top


def maak_mobiel_png(bloei, event, kleur_event, pad, *, vaste_mailmaat=False):
    """Exactly two unbroken rows; scale the whole block to fit, never wrap or cut."""
    # Supersample curves and type, then retain 3x resolution for high-DPI mail.
    S, W = 12, 420
    f, chipfont = font('GTWalsheim-Md.ttf', 13, S), font('GTWalsheim-Bd.ttf', 9, S)
    proef = ImageDraw.Draw(Image.new('RGB', (W*S, 1)))
    regelhoogte = round(13 * 1.5 * S)
    spatie = proef.textlength(' ', font=f)
    rijen = [('NU IN BLOEI', KLEUREN['groen'], ' '.join(bloei.split())),
             ('IN DE AGENDA', kleur_event, ' '.join(event.split()))]
    pillen = [pil_geometrie(proef, label, chipfont, S) for label, _, _ in rijen]
    breedte = max(W*S, math.ceil(max(
        2*S + pil[0] + spatie + proef.textlength(tekst, font=f)
        for (_, _, tekst), pil in zip(rijen, pillen))))
    hoogte = 4*S + 2*regelhoogte + 8*S
    img = Image.new('RGB', (breedte, hoogte), 'white')
    d = ImageDraw.Draw(img)
    y = 2*S
    # Align capital-height centres with the all-caps pill label. Including a
    # descender (e.g. Ag) lifts the body baseline and makes adjacent text float.
    for (label, kleur, tekst), (pw, ph, tx, ty) in zip(rijen, pillen):
        py = y + (regelhoogte-ph)/2
        d.rounded_rectangle((S, py, S+pw, py+ph), radius=ph/2, outline=kleur, width=S)
        d.text((S+tx, py+ty), label, font=chipfont, fill=kleur)
        d.text((S+pw+spatie, tekst_bovenkant(d, f, y, regelhoogte)), tekst, font=f, fill=KLEUREN['tekst'])
        y += regelhoogte + 8*S
    if vaste_mailmaat:
        # A fixed 300 x 40 display canvas lets Mail reserve an explicit height.
        # Fit the full, unbroken rows proportionally; never stretch to the box.
        # At 300px it also fits a 320px viewport with normal message margins.
        inhoud = img.resize((900, max(1, round(hoogte*900/breedte))), Image.Resampling.LANCZOS)
        img = Image.new('RGB', (900, 120), 'white')
        img.paste(inhoud, (0, 0))
    else:
        img = img.resize((W*3, max(1, round(hoogte*W*3/breedte))), Image.Resampling.LANCZOS)
    img.save(pad, optimize=True)


def maak_index(bloei, event, dag):
    sjabloon = (BASIS / "sjabloon_index.html").read_text()
    pagina = (sjabloon
              .replace("{{BLOEI}}", escape(bloei))
              .replace("{{EVENT}}", escape(event))
              .replace("{{DATUM}}", f"{dag.day} {MAANDEN[dag.month - 1]} {dag.year}"))
    (DOCS / "index.html").write_text(pagina)


def maak_woordbeeld(dag):
    # The original vector wordmark is rasterised once, preserving its alpha mask.
    with Image.open(BASIS / "assets" / "woordbeeld-masker.png") as masker:
        for variant, kleur in [("groen", "groen"), ("seizoen", seizoen(dag))]:
            img = Image.new("RGBA", masker.size, KLEUREN[kleur] + (255,))
            img.putalpha(masker.convert("RGBA").getchannel("A"))
            img.save(DOCS / f"woordbeeld-{variant}.png", optimize=True)


def main():
    DOCS.mkdir(exist_ok=True)
    personen = valideer_personen(json.loads((BASIS / "data" / "personen.json").read_text()))
    zorg_voor_fonts()
    dag = vandaag()
    bloei = kies_bloei(dag)
    event, event_datum = kies_event(dag)
    print(f"Nu in bloei:  {bloei}")
    print(f"In de agenda: {event}  [{seizoen(event_datum)}]")
    maak_png(bloei, event, KLEUREN[seizoen(event_datum)], DOCS / "handtekening.png")
    maak_png(bloei, event, KLEUREN[seizoen(event_datum)], DOCS / "handtekening-compact.png", compact=True)
    maak_regels_png(bloei, event, KLEUREN[seizoen(event_datum)], DOCS / 'handtekening-regels.png')
    maak_mobiel_png(bloei, event, KLEUREN[seizoen(event_datum)], DOCS / 'handtekening-mobiel.png')
    maak_mobiel_png(bloei, event, KLEUREN[seizoen(event_datum)], DOCS / 'handtekening-mail.png', vaste_mailmaat=True)
    (DOCS / "handtekening.txt").write_text(
        f"Nu in bloei: {bloei}\nIn de agenda: {event}\n")
    # kopie van de bloeikalender voor de tabel op de kopieerpagina
    (DOCS / "bloei.json").write_text((BASIS / "data" / "bloeikalender.json").read_text())
    maak_woordbeeld(dag)
    (DOCS / "personen.json").write_text(json.dumps(personen, ensure_ascii=False, indent=2) + "\n")
    maak_index(bloei, event, dag)
    print(f"Geschreven naar {DOCS}/")


if __name__ == "__main__":
    main()
