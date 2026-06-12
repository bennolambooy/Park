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
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASIS = Path(__file__).parent
DOCS = BASIS / "docs"
AGENDA_URL = "https://hetparkinrotterdam.nl/agenda"

MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli",
           "augustus", "september", "oktober", "november", "december"]
WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]
MND_AFKO = {"jan": 1, "feb": 2, "mrt": 3, "mar": 3, "maa": 3, "apr": 4,
            "mei": 5, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9,
            "okt": 10, "oct": 10, "nov": 11, "dec": 12}

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


def parse_events(html, dag):
    events = []
    for kaart in re.split(r'class="card-group__card"', html)[1:]:
        link = re.search(r'href="(https://hetparkinrotterdam\.nl/agenda/(?!tag:)[^"]+)"', kaart)
        titel = re.search(r'<h1 class="title">\s*(.*?)\s*</h1>', kaart, re.S)
        if not link or not titel:
            continue
        blokken = re.findall(r'class="date__block[^"]*"\s*>(.*?)</div>', kaart, re.S)
        datums = []
        for blok in blokken:
            mnd = re.search(r'class="mnd">\s*([A-Za-z]+)', blok)
            dagnr = re.search(r'<br>\s*(\d{1,2})', blok)
            if not (mnd and dagnr):
                continue
            maand = MND_AFKO.get(mnd.group(1).strip().lower()[:3])
            if not maand:
                continue
            jaar = dag.year
            d = date(jaar, maand, int(dagnr.group(1)))
            if d < dag - timedelta(days=45):  # ruim voorbij: hoort bij volgend jaar
                d = date(jaar + 1, maand, int(dagnr.group(1)))
            datums.append(d)
        if not datums:
            continue
        start, eind = datums[0], datums[-1]
        if eind < start:
            eind = date(start.year + 1, eind.month, eind.day)
        sub = re.search(r'class="subTitle">(.*?)</div>', kaart, re.S)
        tijd = re.search(r'(\d{1,2})[:.](\d{2})', sub.group(1)) if sub else None
        events.append({
            "titel": re.sub(r"<[^>]+>", "", titel.group(1)).strip(),
            "start": start, "eind": eind,
            "tijd": f"{int(tijd.group(1))}:{tijd.group(2)}" if tijd else None,
        })
    events.sort(key=lambda e: e["start"])
    return events


def formatteer_event(ev):
    start, eind = ev["start"], ev["eind"]
    if start == eind:
        wanneer = f"{WEEKDAGEN[start.weekday()]} {start.day} {MAANDEN[start.month - 1]}"
        if ev["tijd"]:
            wanneer += f", {ev['tijd']} uur"
    elif start.month == eind.month:
        wanneer = f"{start.day} & {eind.day} {MAANDEN[start.month - 1]}"
    else:
        wanneer = f"{start.day} {MAANDEN[start.month - 1]} t/m {eind.day} {MAANDEN[eind.month - 1]}"
    return f"{ev['titel']} · {wanneer}"


def lees_instellingen():
    """data/instellingen.json: { "vastgezet_titel": "..." } — gezet via de kopieerpagina."""
    try:
        return json.loads((BASIS / "data" / "instellingen.json").read_text())
    except Exception:
        return {}


def schrijf_agenda(events, dag):
    """docs/agenda.json: de geparste agenda, zodat de kopieerpagina hem kan tonen."""
    DOCS.mkdir(exist_ok=True)
    data = {"bijgewerkt": dag.isoformat(),
            "vastgezet_titel": lees_instellingen().get("vastgezet_titel", ""),
            "events": [{"titel": ev["titel"], "start": ev["start"].isoformat(),
                        "eind": ev["eind"].isoformat(), "tekst": formatteer_event(ev)}
                       for ev in events]}
    (DOCS / "agenda.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))


def kies_event(dag):
    """Geeft (tekst, datum) terug; de datum bepaalt de seizoenskleur van de regel.

    Normaal het eerstvolgende evenement; is er via de kopieerpagina een evenement
    vastgezet, dan dat — tot de einddatum voorbij is (of het van de site verdwijnt),
    daarna vanzelf weer het eerstvolgende."""
    try:
        events = [ev for ev in parse_events(haal_agenda(), dag) if ev["eind"] >= dag]
        schrijf_agenda(events, dag)
        vast = lees_instellingen().get("vastgezet_titel")
        gekozen = next((ev for ev in events if ev["titel"] == vast), None) \
            or (events[0] if events else None)
        if gekozen:
            return formatteer_event(gekozen), gekozen["start"]
    except Exception as e:
        print(f"agenda ophalen mislukt ({e}), gebruik vaste tekst", file=sys.stderr)
    return "elke woensdagmiddag werken de vrijwilligers in het Park", dag


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


def teken_tekst(d, x, ycent, segmenten, S, max_x):
    """Tekent [(tekst, vet?)]-segmenten in GT Walsheim, verkleint tot het past."""
    maat = 14.0
    while maat >= 11:
        fonts = {True: font("GTWalsheim-Bd.ttf", maat, S),
                 False: font("GTWalsheim-Md.ttf", maat, S)}
        breedte = sum(d.textlength(t, font=fonts[v]) for t, v in segmenten)
        if x + breedte <= max_x:
            break
        maat -= 0.5
    cx = x
    for t, vet in segmenten:
        d.text((cx, ycent), t, font=fonts[vet], fill=KLEUREN["tekst"], anchor="lm")
        cx += d.textlength(t, font=fonts[vet])


def maak_png(bloei, event, kleur_event, pad):
    # Retina: we tekenen op dubbele resolutie (1120px) en tonen op 560px,
    # zodat het plaatje ook op high-dpi-schermen scherp is.
    S = 2
    W, H = 560, 70
    img = Image.new("RGB", (W * S, H * S), (255, 255, 255))
    d = ImageDraw.Draw(img)

    if " · " in event:
        titel, rest = event.split(" · ", 1)
        event_seg = [(titel, True), ("  ·  " + rest, False)]
    else:
        event_seg = [(event, False)]

    rijen = [
        ("NU IN BLOEI", KLEUREN["groen"], [(bloei, False)], 19),
        ("IN DE AGENDA", kleur_event, event_seg, 51),
    ]
    # pills strak links uitgelijnd, tekstkolom erachter op één lijn
    breedtes = [teken_chip(d, S, ym * S, label, kleur, S)
                for label, kleur, _, ym in rijen]
    kolom_x = S + max(breedtes) + 12 * S
    for label, kleur, segmenten, ym in rijen:
        teken_tekst(d, kolom_x, ym * S, segmenten, S, (W - 4) * S)

    img.save(pad, optimize=True)


# ---------- publicatiepagina ----------

def maak_index(bloei, event, dag):
    sjabloon = (BASIS / "sjabloon_index.html").read_text()
    pagina = (sjabloon
              .replace("{{BLOEI}}", bloei)
              .replace("{{EVENT}}", event)
              .replace("{{DATUM}}", f"{dag.day} {MAANDEN[dag.month - 1]} {dag.year}"))
    (DOCS / "index.html").write_text(pagina)


def main():
    DOCS.mkdir(exist_ok=True)
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
    maak_index(bloei, event, dag)
    print(f"Geschreven naar {DOCS}/")


if __name__ == "__main__":
    main()
