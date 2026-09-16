import {toegang} from './gate.js?v=20260916-5';
import {inloggen, uitloggen, isIngelogd, leesBestand, schrijfBestand} from './github.js?v=20260916-5';
import {handtekening, persoonlijkeLink, valideerPersoon, kiesLogovariant} from './signature.js?v=20260916-5';
import {esc, leesPubliek, wachtOpPublicatie} from './shared.js?v=20260916-5';

await toegang();

const $ = id => document.getElementById(id);
const basis = new URL('./', location.href).href;
let personen = [], personenSha, instellingen = {}, instellingenSha, agenda;
let bewerkId = null, dirty = false, personenBezig = false, instellingenBezig = false;
let previewLogo = kiesLogovariant();
let personenPublicatie = 0, instellingenPublicatie = 0;
function melding(tekst) { $('melding').textContent = tekst; $('melding').hidden = !tekst; }
function sessie() {
  $('login').hidden = isIngelogd();
  $('beheer').hidden = !isIngelogd();
  $('uitloggen').hidden = !isIngelogd();
}
function resetForm() {
  bewerkId = null; dirty = false;
  $('persoon-form').reset();
  $('formulier-titel').textContent = 'Persoon toevoegen';
  $('persoon-status').textContent = '';
  previewPersoon();
}
function formPersoon() {
  return {id: bewerkId || 'voorbeeld-profiel', naam: $('naam').value.trim() || 'Naam',
    functie: $('functie').value.trim() || 'Functie', telefoon: $('telefoon').value.trim()};
}
function previewPersoon() {
  try {
    $('persoon-preview').innerHTML = handtekening(formPersoon(), {
      basis, versie: agenda?.versie || '', logovariant: previewLogo,
      toonAdres: $('toon-adres').checked,
    }).html;
  } catch { $('persoon-preview').textContent = 'Controleer het telefoonnummer voor een voorbeeld.'; }
}
function gekozenStijl() {
  return document.querySelector('input[name="logostijl"]:checked')?.value || 'random';
}
function updateKleurvoorbeeld() {
  previewLogo = kiesLogovariant(gekozenStijl());
  $('preview-wissel').hidden = gekozenStijl() !== 'random';
  previewPersoon();
}
function renderPersonen() {
  $('personenlijst').innerHTML = personen.length ? personen.map(p =>
    '<article class="person"><h3>' + esc(p.naam) + '</h3><p class="muted">' + esc(p.functie) +
    (p.telefoon ? ' · ' + esc(p.telefoon) : '') + '</p><div class="actions">' +
    '<button class="small secondary" data-bewerk="' + esc(p.id) + '">Bewerken</button>' +
    '<button class="small secondary" data-link="' + esc(p.id) + '">Kopieer link</button>' +
    '<a class="button small secondary" target="_blank" rel="noopener" href="' + esc(persoonlijkeLink(p.id, basis)) + '">Bekijk</a>' +
    '<button class="small danger" data-verwijder="' + esc(p.id) + '">Verwijderen</button></div></article>'
  ).join('') : '<p class="empty">Er zijn nog geen personen. Maak de eerste handtekening met het formulier.</p>';
  for (const button of $('personenlijst').querySelectorAll('button')) button.disabled = personenBezig;
}
function renderAgenda() {
  const id = instellingen.vastgezet_id;
  const vast = id !== undefined ? id : agenda?.events.find(ev => ev.titel === instellingen.vastgezet_titel)?.id;
  $('agenda').innerHTML = (agenda?.events || []).map(ev => {
    const pinned = vast === ev.id;
    return '<div class="agenda-item"><div><h3>' + esc(ev.titel) + '</h3><p class="muted">' +
      esc(ev.tekst.slice(ev.titel.length + 3)) + '</p>' +
      (pinned ? '<span class="badge">Vastgezet</span>' : agenda.gekozen_id === ev.id ? '<span class="badge">Nu gepubliceerd</span>' : '') +
      '</div><button class="small secondary" data-pin="' + esc(pinned ? '' : ev.id) + '"' +
      (instellingenBezig ? ' disabled' : '') + '>' + (pinned ? 'Vastzetten opheffen' : 'Zet vast') + '</button></div>';
  }).join('') || '<p class="empty">Er zijn momenteel geen evenementen beschikbaar.</p>';
  if (vast && !agenda?.events.some(ev => ev.id === vast)) {
    $('agenda').insertAdjacentHTML('afterbegin', '<div class="notice">Het vastgezette evenement is afgelopen of niet meer beschikbaar. De handtekening gebruikt het eerstvolgende evenement. <button class="small secondary" data-pin="">Vastzetten opheffen</button></div>');
  }
}
async function laad() {
  const [p, settings, a] = await Promise.all([
    leesBestand('data/personen.json'), leesBestand('data/instellingen.json'), leesPubliek('agenda.json'),
  ]);
  personen = p.data.personen.map(valideerPersoon); personenSha = p.sha;
  instellingen = settings.data; instellingenSha = settings.sha; agenda = a;
  $('toon-adres').checked = instellingen.toon_adres === true;
  const stijl = ['random', 'seizoen', 'groen'].includes(instellingen.logostijl) ? instellingen.logostijl : 'random';
  document.querySelector('input[name="logostijl"][value="' + stijl + '"]').checked = true;
  updateKleurvoorbeeld();
  renderPersonen(); renderAgenda(); previewPersoon();
  $('banner').src = 'handtekening-regels.png?v=' + encodeURIComponent(agenda.versie || Date.now());
  const pending = sessionStorage.getItem('park-publicatie');
  if (pending) {
    $('agenda-status').textContent = pending === agenda.aanvraag_id ?
      'Je laatste wijziging is gepubliceerd.' : 'Je laatste wijziging is opgeslagen; publicatie is nog onderweg. Herlaad de lijst om te controleren.';
    if (pending === agenda.aanvraag_id) sessionStorage.removeItem('park-publicatie');
  }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('inloggen').disabled = true; melding('');
  try {
    await inloggen($('wachtwoord').value);
    $('wachtwoord').value = '';
    await laad(); sessie();
  } catch (e) { uitloggen(); sessie(); melding(e.message); }
  finally { $('inloggen').disabled = false; }
});
$('uitloggen').addEventListener('click', () => {
  if (personenBezig || instellingenBezig) { melding('Wacht tot het opslaan is afgerond.'); return; }
  if (dirty && !confirm('Je invoer is nog niet opgeslagen. Toch uitloggen?')) return;
  uitloggen(); resetForm(); personen = []; $('personenlijst').replaceChildren(); sessie();
});
$('persoon-form').addEventListener('input', () => { dirty = true; previewPersoon(); });
for (const id of ['nieuw', 'annuleren']) $(id).addEventListener('click', () => {
  if (dirty && !confirm('Je invoer leegmaken zonder op te slaan?')) return;
  resetForm(); $('naam').focus();
});
$('herlaad').addEventListener('click', async () => {
  if (personenBezig || instellingenBezig) return;
  try { await laad(); melding('De nieuwste gegevens zijn geladen. Je invoer in het formulier is bewaard.'); }
  catch (e) { melding(e.message); }
});

async function bewaarPersonen(volgende, message, controle) {
  const versie = ++personenPublicatie;
  personenBezig = true; $('opslaan').disabled = true; renderPersonen();
  for (const veld of $('persoon-form').querySelectorAll('input,button')) veld.disabled = true;
  $('nieuw').disabled = true;
  $('persoon-status').textContent = 'Bezig met opslaan…';
  try {
    const sha = await schrijfBestand('data/personen.json', {personen: volgende}, personenSha, message);
    personen = volgende; personenSha = sha; dirty = false; renderPersonen();
    $('persoon-status').textContent = 'Opgeslagen. Je kunt verder; de persoonlijke link wordt op de achtergrond bijgewerkt.';
    void volgPersonenPublicatie(controle, versie);
    return true;
  } catch (e) { $('persoon-status').textContent = e.message; return false; }
  finally {
    personenBezig = false;
    for (const veld of $('persoon-form').querySelectorAll('input,button')) veld.disabled = false;
    $('nieuw').disabled = false; renderPersonen();
  }
}
async function volgPersonenPublicatie(controle, versie) {
  const isActueel = () => versie === personenPublicatie && isIngelogd();
  const gepubliceerd = await wachtOpPublicatie('personen.json', controle, {isActueel});
  if (!isActueel()) return;
  $('persoon-status').textContent = gepubliceerd ?
    'Gepubliceerd. De persoonlijke link is klaar om te delen.' :
    'Je gegevens zijn opgeslagen. Publicatie duurt wat langer; je kunt gewoon verder. Controleer later de persoonlijke link.';
}
$('persoon-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (personenBezig) return;
  try {
    const profiel = valideerPersoon({id: bewerkId || crypto.randomUUID(), naam: $('naam').value,
      functie: $('functie').value, telefoon: $('telefoon').value});
    if (bewerkId && !personen.some(p => p.id === bewerkId))
      throw new Error('Deze persoon is inmiddels verwijderd. Maak zo nodig een nieuwe persoon aan.');
    const volgende = bewerkId ? personen.map(p => p.id === bewerkId ? profiel : p) : [...personen, profiel];
    const gelukt = await bewaarPersonen(volgende, 'Persoonlijke handtekening bijgewerkt', data =>
      data.personen.some(p => p.id === profiel.id && p.naam === profiel.naam && p.functie === profiel.functie && p.telefoon === profiel.telefoon));
    if (gelukt) { bewerkId = profiel.id; $('formulier-titel').textContent = 'Persoon bewerken'; }
  } catch (e) { $('persoon-status').textContent = e.message; }
});
$('personenlijst').addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || personenBezig) return;
  const id = button.dataset.bewerk || button.dataset.link || button.dataset.verwijder;
  const profiel = personen.find(p => p.id === id);
  if (!profiel) return;
  if (button.hasAttribute('data-bewerk')) {
    if (dirty && !confirm('Je invoer is nog niet opgeslagen. Een andere persoon openen?')) return;
    bewerkId = id; dirty = false;
    for (const key of ['naam', 'functie', 'telefoon']) $(key).value = profiel[key];
    $('formulier-titel').textContent = 'Persoon bewerken'; $('persoon-status').textContent = ''; previewPersoon(); $('naam').focus();
  } else if (button.hasAttribute('data-link')) {
    const link = persoonlijkeLink(id, basis);
    try { await navigator.clipboard.writeText(link); melding('Persoonlijke link van ' + profiel.naam + ' gekopieerd.'); }
    catch { melding('Kopieer deze link: ' + link); }
  } else if (confirm('De persoonlijke link van ' + profiel.naam + ' intrekken? Een al geplakte handtekening wordt hierdoor niet uit e-mails verwijderd.')) {
    const gelukt = await bewaarPersonen(personen.filter(p => p.id !== id), 'Persoonlijke handtekening verwijderd',
      data => !data.personen.some(p => p.id === id));
    if (gelukt && bewerkId === id) resetForm();
  }
});

async function bewaarInstellingen(wijzigingen, statusId) {
  if (instellingenBezig) return;
  const versie = ++instellingenPublicatie;
  instellingenBezig = true; $('logo-opslaan').disabled = true; renderAgenda();
  for (const veld of $('logo-form').querySelectorAll('input')) veld.disabled = true;
  $(statusId).textContent = 'Bezig met opslaan…';
  const aanvraag = crypto.randomUUID();
  const volgende = {...instellingen, ...wijzigingen, aanvraag_id: aanvraag};
  try {
    instellingenSha = await schrijfBestand('data/instellingen.json', volgende, instellingenSha, 'Handtekeninginstellingen bijgewerkt');
    instellingen = volgende;
    sessionStorage.setItem('park-publicatie', aanvraag);
    renderAgenda();
    $(statusId).textContent = 'Opgeslagen. Je kunt verder; de handtekening wordt op de achtergrond bijgewerkt.';
    void volgInstellingenPublicatie(aanvraag, statusId, versie);
  } catch (e) { $(statusId).textContent = e.message; }
  finally {
    instellingenBezig = false; $('logo-opslaan').disabled = false;
    for (const veld of $('logo-form').querySelectorAll('input')) veld.disabled = false;
    renderAgenda();
  }
}
async function volgInstellingenPublicatie(aanvraag, statusId, versie) {
  const isActueel = () => versie === instellingenPublicatie && isIngelogd();
  const gepubliceerd = await wachtOpPublicatie('agenda.json', data => data.aanvraag_id === aanvraag, {isActueel});
  if (!isActueel()) return;
  if (!gepubliceerd) {
    $(statusId).textContent = 'Je wijziging is opgeslagen. Publicatie duurt wat langer; je kunt gewoon verder. Gebruik ‘Lijst herladen’ om opnieuw te controleren.';
    return;
  }
  agenda = gepubliceerd;
  $('banner').src = 'handtekening-regels.png?v=' + encodeURIComponent(agenda.versie);
  updateKleurvoorbeeld(); renderAgenda();
  sessionStorage.removeItem('park-publicatie');
  $(statusId).textContent = statusId === 'logo-status'
    ? 'Gepubliceerd. De instellingen zijn actief voor alle nieuwe handtekeningen.'
    : 'Gepubliceerd. Het agendavoorbeeld is bijgewerkt.';
}
$('agenda').addEventListener('click', event => {
  const button = event.target.closest('[data-pin]');
  if (!button || instellingenBezig) return;
  const id = button.dataset.pin;
  const activiteit = agenda.events.find(ev => ev.id === id);
  bewaarInstellingen({vastgezet_id: id, vastgezet_titel: activiteit?.titel || ''}, 'agenda-status');
});
$('logo-form').addEventListener('submit', event => {
  event.preventDefault();
  bewaarInstellingen({logostijl: gekozenStijl(), toon_adres: $('toon-adres').checked}, 'logo-status');
});
$('logo-form').addEventListener('change', () => {
  updateKleurvoorbeeld();
  $('logo-status').textContent = gekozenStijl() === (instellingen.logostijl || 'random') && $('toon-adres').checked === (instellingen.toon_adres === true)
    ? '' : 'Het voorbeeld is aangepast. Sla op om deze instellingen voor iedereen te gebruiken.';
});
$('preview-wissel').addEventListener('click', () => {
  previewLogo = previewLogo === 'groen' ? 'seizoen' : 'groen';
  previewPersoon();
});
window.addEventListener('beforeunload', event => {
  if (dirty || personenBezig || instellingenBezig) { event.preventDefault(); event.returnValue = ''; }
});
sessie();
if (isIngelogd()) laad().catch(e => { uitloggen(); sessie(); melding(e.message); });
