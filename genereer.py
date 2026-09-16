#!/usr/bin/env python3
"""Genereert de e-mailhandtekening van het Park: wat bloeit er nu + eerstvolgend event.

Vormgeving volgt de huisstijl van hetparkinrotterdam.nl: Roslindale (serif) en
GT Walsheim (schreefloos), parkgroen #00752e en de seizoenskleuren van de site
(lente paars, zomer rood, herfst oker, winter blauw).

Output in docs/: handtekening.png, handtekening.txt, index.html
Draait dagelijks via GitHub Actions, maar werkt ook lokaal: python3 genereer.py
"""
import json
import re
import hashlib
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
              if is_actief(e, idx) and not gepauzeerd(e, dag)]
    pool = [e for e in actief if e["prio"] <= 2] or actief
    if not pool:
        return "het Park, in elk seizoen de moeite waard"
    pool.sort(key=lambda e: (e["prio"], e["tekst"]))
    keuze = pool[dag.timetuple().tm_yday % len(pool)]
    return keuze["tekst"]


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
            "vastgezet_id": instellingen.get("vastgezet_id", ""),
            "vastgezet_titel": instellingen.get("vastgezet_titel", ""),
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
    if "vastgezet_id" in instellingen:
        gekozen = next((ev for ev in events if ev["id"] == instellingen["vastgezet_id"]), None)
    else:
        # Preserve the existing pinned title during the one-time migration.
        gekozen = next((ev for ev in events if ev["titel"] == instellingen.get("vastgezet_titel")), None)
    gekozen = gekozen or (events[0] if events else None)
    schrijf_agenda(events, dag, gekozen, instellingen, waarschuwing)
    if gekozen:
        return formatteer_event(gekozen), gekozen["start"]
    return "bekijk de actuele agenda op hetparkinrotterdam.nl", dag


# ---------- tekenen ----------

FONT_BRON = "https://hetparkinrotterdam.nl/assets/css/fonts/"
# GT Walsheim: het lettertype dat het Park ook in e-mailhandtekeningen gebruikt
FONTS = ["GTWalsheim-Md.ttf", "GTWalsheim-Bd.ttf"]


def zorg_voor_fonts():
    """De huisstijlfonts zijn gelicenseerd; we bewaren ze niet in het repo maar
    halen ze bij het draaien van de eigen website van het Park."""
    (BASIS / "fonts").mkdir(exist_ok=True)
    for naam in FONTS:
        doel = BASIS / "fonts" / naam
        if not doel.exists():
            doel.write_bytes(haal(FONT_BRON + naam))


def font(bestand, maat, S):
    return ImageFont.truetype(str(BASIS / "fonts" / bestand), int(maat * S))


def teken_chip(d, x, ycent, label, kleur, S):
    """Outlined pill-chip, zoals de tags op de website."""
    f = font("GTWalsheim-Bd.ttf", 8.5, S)
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


def maak_png(bloei, event, kleur_event, pad):
    S, W = 2, 560
    proef = ImageDraw.Draw(Image.new("RGB", (W * S, 100)))
    fonts = {True: font("GTWalsheim-Bd.ttf", 13, S),
             False: font("GTWalsheim-Md.ttf", 13, S)}
    if " · " in event:
        titel, rest = event.split(" · ", 1)
        event_seg = [(titel, True), ("  ·  " + rest, False)]
    else:
        event_seg = [(event, False)]
    rijen = [("NU IN BLOEI", KLEUREN["groen"], [(bloei, False)]),
             ("IN DE AGENDA", kleur_event, event_seg)]
    breedtes = [teken_chip(proef, S, 20 * S, label, kleur, S) for label, kleur, _ in rijen]
    x = S + max(breedtes) + 12 * S
    layouts = [tekstregels(proef, seg, fonts, (W - 4) * S - x) for _, _, seg in rijen]
    hoogtes = [max(32, len(regels) * 18 + 12) for regels in layouts]
    img = Image.new("RGB", (W * S, (sum(hoogtes) + 6) * S), (255, 255, 255))
    d = ImageDraw.Draw(img)
    y = 19 * S
    for (label, kleur, _), regels, hoogte in zip(rijen, layouts, hoogtes):
        teken_chip(d, S, y, label, kleur, S)
        for k, regel in enumerate(regels):
            cx = x
            for char, vet in regel:
                d.text((cx, y + k * 18 * S), char, font=fonts[vet], fill=KLEUREN["tekst"], anchor="lm")
                cx += d.textlength(char, font=fonts[vet])
        y += hoogte * S
    img.save(pad, optimize=True)


# ---------- publicatiepagina ----------

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
