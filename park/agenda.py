"""Lees uitsluitend evenementkaarten; navigatie en footer zijn geen agenda."""
import re
from datetime import date
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
           'augustus', 'september', 'oktober', 'november', 'december']
WEEKDAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
MND_AFKO = dict(zip(['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug',
                     'sep', 'okt', 'nov', 'dec'], range(1, 13)))
MND_AFKO.update({'mar': 3, 'maa': 3, 'may': 5, 'oct': 10})


def parse_events(html, dag):
    events, gezien = [], set()
    for kaart in BeautifulSoup(html, 'html.parser').select('.card-group__card'):
        link = kaart.select_one('a[href]')
        titel = kaart.select_one('.title')
        if not link or not titel:
            continue
        url = urljoin('https://hetparkinrotterdam.nl', link['href'])
        parsed = urlparse(url)
        if parsed.hostname != 'hetparkinrotterdam.nl' or not parsed.path.startswith('/agenda/') or '/tag:' in parsed.path:
            continue
        datums = []
        # Only dates in this card's figure: never dates in adjacent content.
        for blok in kaart.select('figure .date__block'):
            mnd = blok.select_one('.mnd')
            maand = MND_AFKO.get(mnd.get_text(strip=True).lower()[:3]) if mnd else None
            cijfers = re.findall(r'\b\d{1,4}\b', blok.get_text(' ', strip=True))
            if not maand or not cijfers:
                continue
            jaar = next((int(x) for x in cijfers if len(x) == 4), dag.year)
            # The source omits years. Only roll over around New Year, not every
            # event more than 45 days ago (which resurrected stale events).
            if not any(len(x) == 4 for x in cijfers):
                if dag.month >= 10 and maand <= 3:
                    jaar += 1
                elif dag.month <= 3 and maand >= 10:
                    jaar -= 1
                if datums and maand < datums[-1].month:
                    jaar = datums[-1].year + 1
            try:
                datums.append(date(jaar, maand, int(cijfers[0])))
            except ValueError:
                continue  # A malformed card must not wipe out the whole agenda.
        if not datums:
            continue
        sub = kaart.select_one('.subTitle')
        tijd = re.search(r'\b([01]?\d|2[0-3])[:.]([0-5]\d)\b', sub.get_text(' ', strip=True)) if sub else None
        event = {'id': url, 'url': url, 'titel': titel.get_text(' ', strip=True),
                 'start': datums[0], 'eind': datums[-1],
                 'tijd': f'{int(tijd[1])}:{tijd[2]}' if tijd else None}
        sleutel = (url, event['start'])
        if sleutel not in gezien:
            events.append(event)
            gezien.add(sleutel)
    events.sort(key=lambda e: (e['start'], e['tijd'] or '00:00'))
    return events


def formatteer_event(ev):
    start, eind = ev['start'], ev['eind']
    if start == eind:
        wanneer = f'{WEEKDAGEN[start.weekday()]} {start.day} {MAANDEN[start.month - 1]}'
        if ev.get('tijd'):
            wanneer += f", {ev['tijd']} uur"
    elif start.year != eind.year:
        wanneer = f'{start.day} {MAANDEN[start.month - 1]} {start.year} t/m {eind.day} {MAANDEN[eind.month - 1]} {eind.year}'
    elif start.month == eind.month:
        wanneer = f'{start.day} t/m {eind.day} {MAANDEN[start.month - 1]}'
    else:
        wanneer = f'{start.day} {MAANDEN[start.month - 1]} t/m {eind.day} {MAANDEN[eind.month - 1]}'
    return f"{ev['titel']} · {wanneer}"
