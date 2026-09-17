import {handtekening, kiesLogovariant} from './signature.js?v=20260917-11';
import {leesPubliek, kopieer, kopieerHtmlTekst, esc} from './shared.js?v=20260917-11';
import {toegang} from './gate.js?v=20260917-11';
import {algemeneTekst} from './general.js?v=20260917-11';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let persoon = null, agenda = null, logo = kiesLogovariant(), klaar = false;
let allePersonen = [], kaarten = [];
const basis = new URL('./', location.href).href;
const maakHandtekening=(p,opties={})=>handtekening(p,{basis,algemeen:agenda?.algemeen,toonAdres:agenda?.toon_adres===true,logovariant:logo,...opties});

function teken() {
  const versie = (agenda?.versie || agenda?.bijgewerkt || '') + '-' + new Date().toISOString().slice(0, 10);
  $('handtekening').innerHTML = maakHandtekening(persoon,{versie}).html;
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
  // One choice per person, following the global style. Copy keeps this choice.
  kaarten = [null, ...allePersonen].map(p => ({persoon:p, variant:logo}));
  const preview=(p,n)=>'<div class="kaart-voorbeeld" id="voorbeeld-'+n+'" hidden><div class="signature-wrap" id="kaart-'+n+'" tabindex="0">'+maakHandtekening(p,{versie:agenda?.versie || ''}).html+'</div><button class="tekstlink" data-html="'+n+'">Kopieer HTML</button></div>';
  const naamKnop=(naam,n)=>'<button type="button" class="naam-voorbeeld" data-preview="'+n+'" aria-expanded="false" aria-controls="voorbeeld-'+n+'" aria-label="Bekijk handtekening van '+esc(naam)+'">'+esc(naam)+'</button>';
  const kopieerKnop=(naam,n)=>'<button class="secondary small" data-copy="'+n+'" aria-label="Kopieer handtekening van '+esc(naam)+'">Kopieer</button>';
  const algemeenNaam=algemeneTekst(agenda?.algemeen).naam;
  overzicht.innerHTML = '<section class="panel"><h2>Algemeen</h2>' +
    '<div class="algemeen-rij">'+naamKnop(algemeenNaam,0)+kopieerKnop(algemeenNaam,0)+'</div>'+preview(null,0)+
    '<p class="status" id="kaart-status-0" role="status"></p>' +
    '</section>' +
    (allePersonen.length ? '<section class="panel medewerkers"><h2>Medewerkers</h2><div class="medewerker-kop" aria-hidden="true"><span>Naam</span><span>Functie</span><span>Telefoon</span><span></span></div><ul class="medewerker-lijst" aria-label="Medewerkers">' + allePersonen.map((p, i) => {
      const n = i+1;
      return '<li class="collega"><div class="medewerker-rij">'+naamKnop(p.naam,n)+'<span>'+esc(p.functie)+'</span><span>'+esc(p.telefoon || '—')+'</span>' +
        kopieerKnop(p.naam,n)+'</div>'+preview(p,n)+
        '<p class="status" id="kaart-status-' + n + '" role="status"></p></li>';
    }).join('') + '</ul></section>' : '');
}
$('overzicht').addEventListener('click', async event => {
  const button = event.target.closest('[data-copy],[data-html],[data-preview]');
  if (!button) return;
  if(button.hasAttribute('data-preview')){
    const preview=$('voorbeeld-'+button.dataset.preview);
    preview.hidden=!preview.hidden;button.setAttribute('aria-expanded',String(!preview.hidden));return;
  }
  const i = Number(button.dataset.copy ?? button.dataset.html);
  const kaart = kaarten[i];
  const sig = maakHandtekening(kaart.persoon, {logovariant:kaart.variant});
  if (button.hasAttribute('data-html')) {
    $('kaart-status-' + i).textContent = await kopieerHtmlTekst(sig.html);
  } else {
    const preview = $('kaart-' + i);
    const container=$('voorbeeld-'+i), wasHidden=container.hidden;
    preview.innerHTML = sig.html;
    // Selection-based copy must have a rendered element, including older Safari.
    container.hidden = false;
    const status = await kopieer(sig.html, sig.tekst, preview);
    if (status.startsWith('Gekopieerd.')) container.hidden = wasHidden;
    $('overzicht').querySelector('[data-preview="'+i+'"]').setAttribute('aria-expanded',String(!container.hidden));
    $('kaart-status-' + i).textContent = status;
  }
});
$('kopieer-html').addEventListener('click', async () => {
  if (!klaar) return;
  $('status').textContent = await kopieerHtmlTekst(maakHandtekening(persoon).html);
});

$('kopieer').addEventListener('click', async () => {
  if (!klaar) return;
  // Copy exactly the visible choice, including an explicitly selected colour.
  const signature = maakHandtekening(persoon);
  // Manual selection fallback also needs stable URLs, not preview cache-busters.
  $('handtekening').innerHTML = signature.html;
  $('status').textContent = await kopieer(signature.html, signature.tekst, $('handtekening'));
});
$('andere-kleur').addEventListener('click', () => {
  logo = logo === 'groen' ? 'seizoen' : 'groen';
  teken();
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
