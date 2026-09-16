import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import genereer
from PIL import Image, ImageDraw, ImageFont
from park.agenda import parse_events
from park.personen import valideer_personen


def kaart(naam="Parkbaden", maand="Okt", dag=11, url="parkbaden", extra=""):
    return f'''<div class="card-group__card extra">
      <a href="/agenda/{url}"><figure><div class="date">
      <div class="date__block"><span class="mnd">{maand}</span><br/>{dag}</div>{extra}
      </div></figure><div class="subTitle">10:00 uur</div><h1 class="title">{naam}</h1></a></div>'''


class AgendaTests(unittest.TestCase):
    def test_footer_does_not_extend_last_event(self):
        html = kaart() + '<footer><div class="date__block"><span class="mnd">Sep</span><br>4</div></footer>'
        event = parse_events(html, date(2026, 9, 16))[0]
        self.assertEqual(event["start"], date(2026, 10, 11))
        self.assertEqual(event["eind"], event["start"])

    def test_stale_event_not_moved_to_next_year(self):
        self.assertEqual(parse_events(kaart(maand="Jun", dag=1), date(2026, 9, 16))[0]["start"], date(2026, 6, 1))

    def test_new_year_and_html_entities(self):
        ev = parse_events(kaart("Bos &amp; Park", maand="Jan", dag=4), date(2026, 12, 20))[0]
        self.assertEqual(ev["start"], date(2027, 1, 4))
        self.assertEqual(ev["titel"], "Bos & Park")

    def test_range_crosses_new_year(self):
        extra = '<div class="date__block"><span class="mnd">Jan</span><br>2</div>'
        ev = parse_events(kaart(maand="Dec", dag=30, extra=extra), date(2026, 12, 20))[0]
        self.assertEqual(ev["eind"], date(2027, 1, 2))

    def test_invalid_date_does_not_drop_valid_cards(self):
        events = parse_events(kaart(maand="Feb", dag=30) + kaart(url="ander"), date(2026, 9, 16))
        self.assertEqual(len(events), 1)

    def test_pin_distinguishes_repeating_titles(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(genereer, "DOCS", Path(tmp)), \
             patch.object(genereer, "haal_agenda", return_value=kaart("Parkwoensdag", dag=11, url="eerste") + kaart("Parkwoensdag", dag=18, url="tweede")), \
             patch.object(genereer, "lees_instellingen", return_value={"vastgezet_id": "https://hetparkinrotterdam.nl/agenda/tweede", "aanvraag_id": "nieuw"}):
            tekst, dag = genereer.kies_event(date(2026, 10, 1))
            self.assertEqual(dag, date(2026, 10, 18))
            data = json.loads((Path(tmp) / "agenda.json").read_text())
            self.assertEqual(data["gekozen_id"], "https://hetparkinrotterdam.nl/agenda/tweede")
            self.assertEqual(data["aanvraag_id"], "nieuw")

    def test_expired_pin_falls_back_to_next_event(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(genereer, "DOCS", Path(tmp)), \
             patch.object(genereer, "haal_agenda", return_value=kaart(dag=1, url="oud") + kaart(dag=18, url="nieuw")), \
             patch.object(genereer, "lees_instellingen", return_value={"vastgezet_id": "https://hetparkinrotterdam.nl/agenda/oud"}):
            self.assertEqual(genereer.kies_event(date(2026, 10, 10))[1], date(2026, 10, 18))

    def test_outage_uses_last_known_future_events(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(genereer, "DOCS", Path(tmp)), \
             patch.object(genereer, "haal_agenda", side_effect=OSError("offline")), \
             patch.object(genereer, "lees_instellingen", return_value={}):
            (Path(tmp) / "agenda.json").write_text(json.dumps({"events": [{
                "id": "evt", "titel": "Bekend evenement", "start": "2026-10-11",
                "eind": "2026-10-11", "tijd": "10:00"}]}))
            self.assertIn("Bekend evenement", genereer.kies_event(date(2026, 10, 10))[0])
            self.assertTrue(json.loads((Path(tmp) / "agenda.json").read_text())["waarschuwing"])

    def test_season_boundaries(self):
        for d, kleur in [(date(2026,3,20), "winter"), (date(2026,3,21), "lente"),
                         (date(2026,6,21), "zomer"), (date(2026,9,21), "herfst"),
                         (date(2026,12,21), "winter")]:
            self.assertEqual(genereer.seizoen(d), kleur)


class PersonTests(unittest.TestCase):
    def test_optional_phone(self):
        self.assertEqual(valideer_personen({"personen": [{"id":"persoon-1", "naam":"Zoë", "functie":"Hovenier"}]})["personen"][0]["telefoon"], "")

    def test_invalid_data_fails_before_publication(self):
        for people in [
            [{"id":"../../etc", "naam":"A", "functie":"B"}],
            [{"id":"persoon-1", "naam":"", "functie":"B"}],
            [{"id":"persoon-1", "naam":"A", "functie":"B", "telefoon":"javascript:alert(1)"}],
            [{"id":"persoon-1", "naam":"A", "functie":"B"}] * 2,
        ]:
            with self.assertRaises(ValueError):
                valideer_personen({"personen": people})


class LayoutTests(unittest.TestCase):
    def test_long_titles_wrap_without_losing_content(self):
        drawing = ImageDraw.Draw(Image.new("RGB", (1000, 200)))
        fonts = {True: ImageFont.load_default(), False: ImageFont.load_default()}
        text = "Parkbaden in Japanse herfst sfeer - seizoensafsluiter"
        lines = genereer.tekstregels(drawing, [(text, True)], fonts, 100)
        self.assertGreater(len(lines), 1)
        self.assertEqual(''.join(c for line in lines for c, _ in line).replace(' ', ''), text.replace(' ', ''))
        for line in lines:
            self.assertLessEqual(sum(drawing.textlength(c, font=fonts[b]) for c, b in line), 100)


if __name__ == "__main__":
    unittest.main()
