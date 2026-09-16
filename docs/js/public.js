import {handtekening, kiesLogovariant} from './signature.js?v=20260916-7';
import {leesPubliek, kopieer, esc, downloadHandtekening} from './shared.js?v=20260916-7';
import {toegang} from './gate.js?v=20260916-7';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let persoon = null, agenda = null, logo = kiesLogovariant(), klaar = false;
let allePersonen = [], kaarten = [];
const basis = new URL('./', location.href).href;

function teken() {
  const versie = (agenda?.versie || agenda?.bijgewerkt || '') + '-' + new Date().toISOString().slice(0, 10);
  $('handtekening').innerHTML = handtekening(persoon, {basis, toonAdres: agenda?.toon_adres === true, versie, logovariant: logo}).html;
  if (agenda?.waarschuwing) {
    $('melding').hidden = false;
    $('melding').textContent = agenda.waarschuwing;
  }
}

async function start() {
  try {
    agenda = await leesPubliek('agenda.json');
    allePersonen = (await leesPubliek('personen.json')).personen;
    const id = params.get('persoon');
    if (id) {
      persoon = allePersonen.find(p => p.id === id);
      if (!persoon) throw new Error('Deze persoonlijke link bestaat niet meer. Vraag de beheerder om je nieuwe link.');
      $('titel').textContent = persoon.naam;
    } else if (params.has('voorbeeld')) {
      persoon = {id: 'voorbeeld-profiel', naam: 'Robin van het Park', functie: 'Medewerker · Stichting het Park',
        telefoon: '010 123 45 67'};
      $('melding').hidden = false;
      $('melding').textContent = 'Voorbeeld met fictieve gegevens.';
    } else {
      $('titel').textContent = 'Handtekeningen';
    }
    logo = kiesLogovariant(agenda.logostijl);
    teken();
    $('kopieer').disabled = false;
    $('andere-kleur').hidden = (agenda.logostijl ?? 'random') !== 'random';
    klaar = true;
    renderOverzicht();
  } catch (error) {
    $('melding').hidden = false;
    $('melding').textContent = error.message;
    $('kopieer').disabled = true;
    $('handtekening').textContent = 'Geen handtekening beschikbaar.';
  }
}

function renderOverzicht() {
  const overzicht = $('overzicht');
  overzicht.hidden = Boolean(params.get('persoon') || params.has('voorbeeld'));
  $('detail').hidden = !overzicht.hidden;
  if (overzicht.hidden) return;
  kaarten = [null, ...allePersonen].flatMap(p => ['groen', 'seizoen'].map(variant => ({persoon:p, variant})));
  overzicht.innerHTML = kaarten.map((kaart, i) => {
    const sig = handtekening(kaart.persoon, {basis, toonAdres: agenda?.toon_adres === true, versie:agenda?.versie || '', logovariant:kaart.variant});
    return '<section class="panel"><div class="kaart-kop"><h2>' + esc(kaart.persoon?.naam || 'Algemeen') +
      '</h2><span class="variant-label">' + (kaart.variant === 'groen' ? 'Groen' : 'Seizoen') +
      '</span></div><div class="signature-wrap" id="kaart-' + i + '" tabindex="0">' + sig.html +
      '</div><div class="actions"><button data-copy="' + i + '">Kopieer handtekening</button></div>' +
      '<p class="status" id="kaart-status-' + i + '" role="status"></p>' +
      '<details class="extra-opties"><summary>Meer opties</summary><div class="actions"><button class="secondary small" data-download="' + i + '">Download HTML</button></div></details></section>';
  }).join('');
}
$('overzicht').addEventListener('click', async event => {
  const button = event.target.closest('[data-copy],[data-download]');
  if (!button) return;
  const i = Number(button.dataset.copy ?? button.dataset.download);
  const kaart = kaarten[i];
  const sig = handtekening(kaart.persoon, {basis, toonAdres: agenda?.toon_adres === true, logovariant:kaart.variant});
  if (button.hasAttribute('data-download')) {
    downloadHandtekening(sig.html, kaart.persoon?.naam || 'het-Park');
  } else {
    $('kaart-' + i).innerHTML = sig.html;
    $('kaart-status-' + i).textContent = await kopieer(sig.html, sig.tekst, $('kaart-' + i));
  }
});
$('download').addEventListener('click', () => {
  downloadHandtekening(handtekening(persoon, {basis, toonAdres: agenda?.toon_adres === true, logovariant:logo}).html, persoon?.naam || 'het-Park');
});

$('kopieer').addEventListener('click', async () => {
  if (!klaar) return;
  // Copy exactly the visible choice, including an explicitly selected colour.
  const signature = handtekening(persoon, {basis, toonAdres: agenda?.toon_adres === true, logovariant: logo});
  // Manual selection fallback also needs stable URLs, not preview cache-busters.
  $('handtekening').innerHTML = signature.html;
  $('status').textContent = await kopieer(signature.html, signature.tekst, $('handtekening'));
});
$('andere-kleur').addEventListener('click', () => {
  logo = logo === 'groen' ? 'seizoen' : 'groen';
  teken();
});
$('ververs').addEventListener('click', async () => {
  $('ververs').disabled = true;
  try {
    agenda = await leesPubliek('agenda.json'); logo = kiesLogovariant(agenda.logostijl);
    $('andere-kleur').hidden = (agenda.logostijl ?? 'random') !== 'random';
    teken(); $('status').textContent = 'De nieuwste versie is geladen.';
  }
  catch (e) { $('status').textContent = e.message; }
  finally { $('ververs').disabled = false; }
});
setInterval(async () => {
  if (document.hidden || !klaar) return;
  try {
    const volgende = await leesPubliek('agenda.json');
    if (volgende.versie !== agenda?.versie || volgende.bijgewerkt !== agenda?.bijgewerkt) {
      agenda = volgende; logo = kiesLogovariant(agenda.logostijl);
      $('andere-kleur').hidden = (agenda.logostijl ?? 'random') !== 'random';
      teken(); renderOverzicht();
    }
  } catch {}
}, 60000);
await toegang();
start();
