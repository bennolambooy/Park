import {handtekening, kiesLogovariant} from './signature.js';
import {leesPubliek, kopieer} from './shared.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let persoon = null, agenda = null, logo = kiesLogovariant(), klaar = false;
const basis = new URL('./', location.href).href;

function teken() {
  const versie = (agenda?.versie || agenda?.bijgewerkt || '') + '-' + new Date().toISOString().slice(0, 10);
  $('handtekening').innerHTML = handtekening(persoon, {basis, versie, logovariant: logo}).html;
  const gekozen = agenda?.events?.find(ev => ev.id === agenda.gekozen_id);
  $('actueel').textContent = gekozen ? gekozen.tekst : 'Bekijk wat er binnenkort in het Park te doen is.';
  if (agenda?.waarschuwing) {
    $('melding').hidden = false;
    $('melding').textContent = agenda.waarschuwing;
  }
}

async function start() {
  try {
    agenda = await leesPubliek('agenda.json');
    const id = params.get('persoon');
    if (id) {
      const data = await leesPubliek('personen.json');
      persoon = data.personen.find(p => p.id === id);
      if (!persoon) throw new Error('Deze persoonlijke link bestaat niet meer. Vraag de beheerder om je nieuwe link.');
      $('titel').textContent = 'De handtekening van ' + persoon.naam;
      $('intro').textContent = 'Je gegevens staan al goed. Kopieer je handtekening en plak hem in de instellingen van je e-mailprogramma.';
    } else if (params.has('voorbeeld')) {
      persoon = {id: 'voorbeeld-profiel', naam: 'Robin van het Park', functie: 'Medewerker · Stichting het Park',
        telefoon: '010 123 45 67'};
      $('melding').hidden = false;
      $('melding').textContent = 'Voorbeeld met fictieve gegevens. De beheerder maakt voor iedere persoon een eigen link.';
    } else {
      $('intro').textContent = 'Gebruik je persoonlijke link voor je naam en functie. De beheerder kan deze voor je aanmaken. Hieronder staat het algemene Park-blok.';
    }
    logo = kiesLogovariant(agenda.logostijl);
    teken();
    $('kopieer').disabled = false;
    $('andere-kleur').hidden = (agenda.logostijl ?? 'random') !== 'random';
    klaar = true;
  } catch (error) {
    $('melding').hidden = false;
    $('melding').textContent = error.message;
    $('kopieer').disabled = true;
    $('handtekening').textContent = 'Geen handtekening beschikbaar.';
  }
}

$('kopieer').addEventListener('click', async () => {
  if (!klaar) return;
  logo = kiesLogovariant(agenda.logostijl);
  teken();
  const signature = handtekening(persoon, {basis, logovariant: logo});
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
      teken();
    }
  } catch {}
}, 60000);
start();
