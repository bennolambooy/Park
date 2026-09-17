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

    def test_hidden_occurrence_is_not_selected_even_if_pinned_but_other_dates_remain(self):
        url='https://hetparkinrotterdam.nl/agenda/parkwoensdag'
        settings={'vastgezet_id':url,'agenda_verborgen':[{'id':url,'start':'2026-10-11','eind':'2026-10-11'}]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(genereer,'DOCS',Path(tmp)), \
             patch.object(genereer,'haal_agenda',return_value=kaart('Parkwoensdag',dag=11,url='parkwoensdag')+kaart('Parkwoensdag',dag=18,url='parkwoensdag')), \
             patch.object(genereer,'lees_instellingen',return_value=settings):
            self.assertEqual(genereer.kies_event(date(2026,10,1))[1],date(2026,10,18))
            published=json.loads((Path(tmp)/'agenda.json').read_text())
            self.assertEqual(len(published['events']),2,'hidden events remain available for undo')
            self.assertEqual(published['agenda_verborgen'],settings['agenda_verborgen'])

    def test_all_hidden_events_produce_neutral_fallback_even_offline(self):
        url='https://hetparkinrotterdam.nl/agenda/parkbaden'
        settings={'agenda_verborgen':[{'id':url,'start':'2026-10-11','eind':'2026-10-11'}]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(genereer,'DOCS',Path(tmp)), \
             patch.object(genereer,'haal_agenda',return_value=kaart()), \
             patch.object(genereer,'lees_instellingen',return_value=settings):
            self.assertIn('bekijk de actuele agenda',genereer.kies_event(date(2026,10,1))[0])
            with patch.object(genereer,'haal_agenda',side_effect=OSError('offline')):
                self.assertIn('bekijk de actuele agenda',genereer.kies_event(date(2026,10,1))[0])


class BloomTests(unittest.TestCase):
    def test_season_skip_excludes_even_pinned_bloom_and_returns_next_bloom_season(self):
        entry={'id':'roos','tekst':'Rozen','van':[6,1],'tot':[9,2],'prio':1,'overslaan_tot':'2026-09-30'}
        calendar={'entries':[entry],'vastgezet':{'id':'roos','tot':'2026-09-30'}}
        with patch.object(Path,'read_text',return_value=json.dumps(calendar)):
            self.assertEqual(genereer.kies_bloei(date(2026,9,20)),'Het Park, in elk seizoen de moeite waard')
            self.assertEqual(genereer.kies_bloei(date(2026,9,30)),'Het Park, in elk seizoen de moeite waard')
            self.assertEqual(genereer.kies_bloei(date(2026,10,1)),'Het Park, in elk seizoen de moeite waard')
            self.assertEqual(genereer.kies_bloei(date(2027,6,1)),'Rozen')

    def test_bloom_pin_and_expiry(self):
        entry = {'id':'rozen', 'tekst': 'rozen', 'van': [6, 1], 'tot': [9, 2], 'prio': 1}
        pin = {'id':'rozen','tot':'2026-09-30'}
        other = {**entry, 'id':'asters', 'tekst':'Asters', 'van':[1,1], 'tot':[12,2], 'prio':3}
        def keuze(entries, dag=date(2026, 9, 16), vast=pin):
            with patch.object(Path, 'read_text', return_value=json.dumps({'entries': entries, 'vastgezet':vast})):
                return genereer.kies_bloei(dag)
        for day in range(16,23):
            self.assertEqual(keuze([entry,other],date(2026,9,day)), 'Rozen')
        self.assertEqual(keuze([{**entry, 'pauze_tot': '2026-09-30'},other]), 'Asters')
        self.assertEqual(keuze([entry,other],date(2026,10,1)), 'Asters')
        self.assertEqual(keuze([other]),'Asters')
        self.assertEqual(keuze([entry,other],date(2027,9,17)),keuze([entry,other],date(2027,9,17),None))


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
    def test_body_capitals_align_with_pill_label_center(self):
        d = ImageDraw.Draw(Image.new('RGB', (840, 120)))
        f, chip = genereer.font('GTWalsheim-Md.ttf', 13, 2), genereer.font('GTWalsheim-Bd.ttf', 9, 2)
        for y, label in [(4, 'NU IN BLOEI'), (59, 'IN DE AGENDA')]:
            w, h, x, ty = genereer.pil_geometrie(d, label, chip, 2)
            py = y + (39-h)/2
            _, t, _, b = d.textbbox((0, genereer.tekst_bovenkant(d, f, y, 39)), 'H', font=f)
            _, ct, _, cb = d.textbbox((x, py+ty), label, font=chip)
            self.assertAlmostEqual((t+b)/2, (ct+cb)/2, delta=0.5)

    def test_pill_ink_is_centered_and_spacing_is_not_a_shared_column(self):
        d = ImageDraw.Draw(Image.new('RGB', (600, 100)))
        f = genereer.font('GTWalsheim-Bd.ttf', 9, 2)
        widths = []
        for label in ['NU IN BLOEI', 'IN DE AGENDA']:
            w, h, x, y = genereer.pil_geometrie(d, label, f, 2)
            l, t, r, b = d.textbbox((x, y), label, font=f)
            self.assertAlmostEqual(l, w-r, delta=1)
            self.assertAlmostEqual(t, h-b, delta=1)
            widths.append(w)
        self.assertNotEqual(*widths)

    def test_inline_wrap_uses_remaining_first_line_and_full_following_lines(self):
        d = ImageDraw.Draw(Image.new('RGB', (600, 1)))
        f = genereer.mailfont(14, 2)
        text = 'Rozen en lampenpoetsersgras bij het Parkpaviljoen'
        lines = genereer.mobiele_regels(d, text, f, 596, 400)
        self.assertEqual(' '.join(lines), text)
        self.assertLessEqual(d.textlength(lines[0], font=f), 400)
        for line in lines[1:]:
            self.assertLessEqual(d.textlength(line, font=f), 596)
        lines = genereer.mobiele_regels(d, 'Lampenpoetsersgras bij het Park', f, 596, 30)
        self.assertEqual(lines[0], '')
        self.assertIn('Lampenpoetsersgras', lines[1])

    def test_mobile_banner_keeps_two_unbroken_rows_and_scales_to_fit(self):
        with tempfile.TemporaryDirectory() as tmp:
            short, long = Path(tmp) / 'short.png', Path(tmp) / 'long.png'
            genereer.maak_mobiel_png('Rozen', 'Parkwoensdag', '#00752e', short)
            genereer.maak_mobiel_png('Lampenpoetsersgras bij het Parkpaviljoen ' * 4,
                                    'Een lange evenementtitel met veel woorden · woensdag 30 september, 13:00 uur ' * 4,
                                    '#ca7b00', long)
            with Image.open(short) as a, Image.open(long) as b:
                self.assertEqual(a.width, 1260)
                self.assertEqual(b.width, 1260)
                self.assertLess(b.height, a.height)
                # Longer content scales the whole block, never adds lines.
                self.assertEqual(a.height, 153)

    def test_mobile_banner_draws_complete_sentences_once(self):
        bloom = 'De bloembedden van Jacqueline van der Kloet bij het Parkpaviljoen'
        event = 'Anne Vegter presenteert Herfst · zo 20 september, 15:30 uur'
        original = ImageDraw.ImageDraw.text
        with tempfile.TemporaryDirectory() as tmp, patch.object(
                ImageDraw.ImageDraw, 'text', autospec=True, side_effect=original) as draw:
            genereer.maak_mobiel_png(bloom, event, '#ca7b00', Path(tmp) / 'banner.png')
            self.assertEqual([call.args[2] for call in draw.call_args_list],
                             ['NU IN BLOEI', bloom, 'IN DE AGENDA', event])

    def test_fixed_mail_canvas_keeps_full_lines_and_constant_aspect_ratio(self):
        original = ImageDraw.ImageDraw.text
        for bloom, event in [('Rozen', 'Parkwandeling'),
                             ('De bloembedden van Jacqueline van der Kloet bij het Parkpaviljoen',
                              'Anne Vegter presenteert Herfst · zo 20 september, 15:30 uur'),
                             ('Bloemen in het Park ' * 8, 'Een lange titel · 13:00 uur ' * 8)]:
            with tempfile.TemporaryDirectory() as tmp, patch.object(
                    ImageDraw.ImageDraw, 'text', autospec=True, side_effect=original) as draw:
                pad = Path(tmp) / 'mail.png'
                genereer.maak_mobiel_png(bloom, event, '#ca7b00', pad, vaste_mailmaat=True)
                self.assertEqual([call.args[2] for call in draw.call_args_list],
                                 ['NU IN BLOEI', bloom.strip(), 'IN DE AGENDA', event.strip()])
                with Image.open(pad) as img:
                    self.assertEqual(img.size, (900, 120))
                    # The longest possible fitted block is 110px high; the
                    # bottom stays white, proving the fixed canvas did not crop.
                    self.assertEqual(img.crop((0, 110, 900, 120)).getextrema(),
                                     ((255, 255), (255, 255), (255, 255)))

    def test_current_park_lines_fit_without_breaking(self):
        d = ImageDraw.Draw(Image.new('RGB', (840, 1)))
        f, chip = genereer.font('GTWalsheim-Md.ttf', 13, 2), genereer.font('GTWalsheim-Bd.ttf', 9, 2)
        for label, text in [('NU IN BLOEI', 'lampenpoetsersgras bij het Parkpaviljoen'),
                            ('IN DE AGENDA', 'Parkwoensdag · wo 30 september, 13:00 uur')]:
            width = genereer.pil_geometrie(d, label, chip, 2)[0]
            self.assertEqual(genereer.mobiele_regels(d, text, f, 836, 836-width-d.textlength(' ', font=f)), [text])

    def test_mobile_wrap_preserves_words_accents_and_long_unbroken_text(self):
        d = ImageDraw.Draw(Image.new('RGB', (600, 1)))
        f = genereer.helvetica(12, 2)
        for text in ['Lampenpoetsersgras bij het Parkpaviljoen', 'Coördinatie & café — wandeling · 13:00 uur',
                     'Park' * 80, '', '  Rozen\n en\t grassen  ']:
            lines = genereer.mobiele_regels(d, text, f, 592)
            self.assertEqual(''.join(lines).replace(' ', ''), ''.join(text.split()))
            for line in lines:
                self.assertLessEqual(d.textlength(line, font=f), 592)
        words = 'Rozen in het Park en bloemen bij het paviljoen'
        self.assertEqual(' '.join(genereer.mobiele_regels(d, words, f, 200)), words)

    def test_unbroken_banner_grows_sideways_without_shrinking_or_wrapping(self):
        with tempfile.TemporaryDirectory() as tmp:
            short, long = Path(tmp) / 'short.png', Path(tmp) / 'long.png'
            genereer.maak_regels_png('Rozen', 'Parkwoensdag', '#00752e', short)
            genereer.maak_regels_png('Lampenpoetsersgras bij het Parkpaviljoen',
                                    'Een bijzonder lange evenementtitel met veel woorden · woensdag 30 september, 13:00 uur',
                                    '#00752e', long)
            with Image.open(short) as a, Image.open(long) as b:
                self.assertEqual(a.height, 112)
                self.assertEqual(b.height, 112)
                self.assertGreater(b.width, a.width)

    def test_compact_banner_uses_mobile_width_and_grows_for_long_titles(self):
        with tempfile.TemporaryDirectory() as tmp:
            short, long = Path(tmp) / 'short.png', Path(tmp) / 'long.png'
            genereer.maak_png('Rozen', 'Parkwoensdag', '#00752e', short, compact=True)
            genereer.maak_png('Lampenpoetsersgras bij het Parkpaviljoen',
                             'Parkbaden in Japanse herfstsfeer en seizoensafsluiter · zondag 30 september, 13:00 uur',
                             '#00752e', long, compact=True)
            with Image.open(short) as a, Image.open(long) as b:
                self.assertEqual(a.width, 600)
                self.assertEqual(b.width, 600)
                self.assertGreater(b.height, a.height)

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
