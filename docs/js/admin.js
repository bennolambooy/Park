import {toegang} from './gate.js?v=20260917-8';
import {inloggen, uitloggen, isIngelogd, leesBestand, schrijfBestand} from './github.js?v=20260917-8';
import {persoonlijkeLink, valideerPersoon} from './signature.js?v=20260917-8';
import {esc, leesPubliek, wachtOpPublicatie} from './shared.js?v=20260917-8';
import {bloeikalender} from './calendar.js?v=20260917-8';
import {ALGEMENE_VELDEN, algemeneTekst} from './general.js?v=20260917-8';

await toegang();

const $ = id => document.getElementById(id);
const kalender = bloeikalender($('bloeikalender'));
const basis = new URL('./', location.href).href;
let personen = [], personenSha, instellingen = {}, instellingenSha, agenda;
let bewerkId = null, dirty = false, personenBezig = false, instellingenBezig = false;
let personenPublicatie = 0, instellingenPublicatie = 0;
let agendaUitgeklapt = false;
let algemeenDirty = false;
$('algemeen-velden').innerHTML=ALGEMENE_VELDEN.map(([key,label,,max])=>'<label class="field">'+esc(label)+'<input data-algemeen="'+key+'" type="'+(key.endsWith('_url')?'url':'text')+'" required maxlength="'+max+'"></label>').join('');
function vulAlgemeen(){
  const data=algemeneTekst(instellingen.algemeen);
  $('algemeen-naam').textContent=data.naam;
  if(!algemeenDirty){
    for(const veld of $('algemeen-velden').querySelectorAll('input'))veld.value=data[veld.dataset.algemeen];
    $('toon-adres').checked=instellingen.toon_adres===true;
    const stijl=['random','seizoen','groen'].includes(instellingen.logostijl)?instellingen.logostijl:'random';
    document.querySelector('input[name="logostijl"][value="'+stijl+'"]').checked=true;
  }
}
$('algemeen-bewerken').addEventListener('click',()=>{
  if(instellingenBezig)return;
  const open=$('algemeen-editor').hidden;
  $('algemeen-editor').hidden=!open;$('algemeen-bewerken').setAttribute('aria-expanded',String(open));
  if(open)$('algemeen-velden').querySelector('input').focus();
});
$('algemeen-form').addEventListener('input',()=>{algemeenDirty=true;$('algemeen-status').textContent='Nog niet opgeslagen.';});
$('algemeen-annuleren').addEventListener('click',()=>{
  if(instellingenBezig || (algemeenDirty&&!confirm('Je invoer leegmaken zonder op te slaan?')))return;
  algemeenDirty=false;vulAlgemeen();$('algemeen-editor').hidden=true;$('algemeen-bewerken').setAttribute('aria-expanded','false');$('algemeen-status').textContent='';
});
$('algemeen-form').addEventListener('submit',async event=>{
  event.preventDefault();if(instellingenBezig)return;
  try{
    const algemeen=algemeneTekst(Object.fromEntries([...$('algemeen-velden').querySelectorAll('input')].map(el=>[el.dataset.algemeen,el.value])));
    if(await bewaarInstellingen({algemeen,logostijl:gekozenStijl(),toon_adres:$('toon-adres').checked},'algemeen-status')){algemeenDirty=false;vulAlgemeen();}
  }catch(e){$('algemeen-status').textContent=e.message;}
});
function parkVandaag() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Amsterdam'}).format(new Date());
}
function melding(tekst) { $('melding').textContent = tekst; $('melding').hidden = !tekst; }
function sessie() {
  $('login').hidden = isIngelogd();
  $('beheer').hidden = !isIngelogd();
  if(isIngelogd() && location.hash === '#bloeikalender') $('bloeikalender').scrollIntoView();
}
function resetForm() {
  bewerkId = null; dirty = false;
  $('persoon-form').reset();
  $('formulier-titel').textContent = 'Medewerker toevoegen';
  $('persoon-status').textContent = '';
  $('persoon-editor').hidden=true;
  $('persoon-extra').replaceChildren();
}
function gekozenStijl() {
  return document.querySelector('input[name="logostijl"]:checked')?.value || 'random';
}
function instellingenGewijzigd() {
  return isIngelogd() && (algemeenDirty || gekozenStijl() !== (instellingen.logostijl || 'random') || $('toon-adres').checked !== (instellingen.toon_adres === true));
}
window.addEventListener('park-uitloggen', event => {
  if(personenBezig || instellingenBezig || kalender.bezig) {
    melding('Wacht tot het opslaan is afgerond.');event.preventDefault();return;
  }
  if((dirty || kalender.dirty || instellingenGewijzigd()) && !confirm('Niet-opgeslagen wijzigingen wissen en uitloggen?')) {
    event.preventDefault();return;
  }
  dirty=false;algemeenDirty=false;kalender.reset();
});
function renderPersonen() {
  $('personenlijst').innerHTML = personen.length ? '<div class="medewerker-kop" aria-hidden="true"><span>Naam</span><span>Functie</span><span>Telefoon</span><span></span></div><ul class="medewerker-lijst">'+personen.map(p =>
    '<li class="medewerker-rij"><a class="collega-naam" target="_blank" rel="noopener" href="'+esc(persoonlijkeLink(p.id,basis))+'">'+esc(p.naam)+'</a><span>'+esc(p.functie)+'</span><span>'+esc(p.telefoon || '—')+'</span>'+
    '<button class="small secondary" data-bewerk="'+esc(p.id)+'" aria-label="Bewerk '+esc(p.naam)+'">Bewerken</button></li>'
  ).join('')+'</ul>' : '<p class="muted">Er zijn nog geen personen.</p>';
  $('persoon-extra').innerHTML=bewerkId ? '<button type="button" class="tekstlink" data-link="'+esc(bewerkId)+'">Kopieer link</button><button type="button" class="tekstlink verwijder-link" data-verwijder="'+esc(bewerkId)+'">Verwijderen</button>' : '';
  for (const button of $('personenlijst').querySelectorAll('button')) button.disabled = personenBezig;
  for (const button of $('persoon-extra').querySelectorAll('button')) button.disabled = personenBezig;
}
function agendaVerborgen(ev) {
  return (instellingen.agenda_verborgen || []).some(item=>item.id===ev.id && item.start===ev.start);
}
function renderAgenda() {
  const herstelOpen=$('agenda-herstel')?.open;
  const id = instellingen.vastgezet_id;
  const vast = id !== undefined ? id : agenda?.events.find(ev => ev.titel === instellingen.vastgezet_titel)?.id;
  const komende = (agenda?.events || []).filter(ev => ev.eind >= parkVandaag()).sort((a,b) => a.start.localeCompare(b.start) || (a.tijd || '').localeCompare(b.tijd || ''));
  const events=komende.filter(ev=>!agendaVerborgen(ev));
  const verborgen=komende.filter(agendaVerborgen);
  const zichtbaar = agendaUitgeklapt ? events : events.slice(0, 5);
  $('agenda-meer').hidden = events.length <= 5;
  $('agenda-meer').textContent = agendaUitgeklapt ? 'Zie minder' : 'Zie meer';
  $('agenda-meer').setAttribute('aria-expanded', String(agendaUitgeklapt));
  $('agenda').innerHTML = zichtbaar.map(ev => {
    const pinned = vast === ev.id;
    return '<div class="agenda-item"><div><h3>' + esc(ev.titel) + '</h3><p class="muted">' +
      esc(ev.tekst.slice(ev.titel.length + 3)) + '</p>' +
      (pinned ? '<span class="badge">Vastgezet</span>' : agenda.gekozen_id === ev.id ? '<span class="badge">Nu gepubliceerd</span>' : '') +
      '</div><div class="bloei-acties"><button class="small secondary" data-pin="' + esc(pinned ? '' : ev.id) + '"' +
      (instellingenBezig ? ' disabled' : '') + '>' + (pinned ? 'Vastzetten opheffen' : 'Zet vast') + '</button><button class="bloei-overslaan" data-agenda-skip="'+esc(ev.id)+'" data-start="'+esc(ev.start)+'" title="Deze activiteit overslaan" aria-label="'+esc(ev.titel+': deze activiteit overslaan')+'"'+(instellingenBezig?' disabled':'')+'>×</button></div></div>';
  }).join('') || '<p class="empty">Er zijn momenteel geen evenementen beschikbaar.</p>';
  if (vast && !events.some(ev => ev.id === vast)) {
    $('agenda').insertAdjacentHTML('afterbegin', '<div class="notice">Het vastgezette evenement is afgelopen of niet meer beschikbaar. De handtekening gebruikt het eerstvolgende evenement. <button class="small secondary" data-pin="">Vastzetten opheffen</button></div>');
  } else if (vast && !zichtbaar.some(ev => ev.id === vast)) {
    const pinned = events.find(ev => ev.id === vast);
    $('agenda').insertAdjacentHTML('afterbegin', '<div class="notice">Vastgezet: ' + esc(pinned.tekst) + ' <button class="small secondary" data-pin="">Vastzetten opheffen</button></div>');
  }
  if(verborgen.length)$('agenda').insertAdjacentHTML('beforeend','<details id="agenda-herstel"'+(herstelOpen?' open':'')+'><summary>Overgeslagen</summary>'+verborgen.map(ev=>'<div class="agenda-item"><span>'+esc(ev.tekst)+'</span><button class="tekstlink" data-agenda-skip="'+esc(ev.id)+'" data-start="'+esc(ev.start)+'"'+(instellingenBezig?' disabled':'')+'>Terugzetten</button></div>').join('')+'</details>');
}
$('agenda-meer').addEventListener('click', () => { agendaUitgeklapt = !agendaUitgeklapt; renderAgenda(); });
async function laad() {
  const [p, settings, a] = await Promise.all([
    leesBestand('data/personen.json'), leesBestand('data/instellingen.json'), leesPubliek('agenda.json'),
  ]);
  personen = p.data.personen.map(valideerPersoon); personenSha = p.sha;
  instellingen = settings.data; instellingenSha = settings.sha; agenda = a;
  vulAlgemeen();
  renderPersonen(); renderAgenda();
  await kalender.laad();
  if(location.hash === '#bloeikalender') $('bloeikalender').scrollIntoView();
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
$('persoon-form').addEventListener('input', () => { dirty = true; });
for (const id of ['nieuw', 'annuleren']) $(id).addEventListener('click', () => {
  if (dirty && !confirm('Je invoer leegmaken zonder op te slaan?')) return;
  resetForm();
  if(id==='nieuw'){$('persoon-editor').hidden=false;$('naam').focus();}
  else $('nieuw').focus();
});
$('herlaad').addEventListener('click', async () => {
  if (personenBezig || instellingenBezig || kalender.bezig) return;
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
    if (gelukt) { bewerkId = profiel.id; $('formulier-titel').textContent = 'Medewerker bewerken';renderPersonen(); }
  } catch (e) { $('persoon-status').textContent = e.message; }
});
async function persoonActie(event) {
  const button = event.target.closest('button');
  if (!button || personenBezig) return;
  const id = button.dataset.bewerk || button.dataset.link || button.dataset.verwijder;
  const profiel = personen.find(p => p.id === id);
  if (!profiel) return;
  if (button.hasAttribute('data-bewerk')) {
    if (dirty && !confirm('Je invoer is nog niet opgeslagen. Een andere persoon openen?')) return;
    bewerkId = id; dirty = false;
    for (const key of ['naam', 'functie', 'telefoon']) $(key).value = profiel[key];
    $('formulier-titel').textContent = 'Medewerker bewerken'; $('persoon-status').textContent = ''; $('persoon-editor').hidden=false;renderPersonen();$('naam').focus();
  } else if (button.hasAttribute('data-link')) {
    const link = persoonlijkeLink(id, basis);
    try { await navigator.clipboard.writeText(link); melding('Persoonlijke link van ' + profiel.naam + ' gekopieerd.'); }
    catch { melding('Kopieer deze link: ' + link); }
  } else if (confirm('De persoonlijke link van ' + profiel.naam + ' intrekken? Een al geplakte handtekening wordt hierdoor niet uit e-mails verwijderd.')) {
    const gelukt = await bewaarPersonen(personen.filter(p => p.id !== id), 'Persoonlijke handtekening verwijderd',
      data => !data.personen.some(p => p.id === id));
    if (gelukt && bewerkId === id) resetForm();
  }
}
$('personenlijst').addEventListener('click',persoonActie);
$('persoon-extra').addEventListener('click',persoonActie);

async function bewaarInstellingen(wijzigingen, statusId) {
  if (instellingenBezig) return;
  const versie = ++instellingenPublicatie;
  instellingenBezig = true; renderAgenda();
  $('algemeen-velden').disabled=true;$('algemeen-opslaan').disabled=true;
  for (const veld of $('algemeen-form').querySelectorAll('input')) veld.disabled = true;
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
    return true;
  } catch (e) { $(statusId).textContent = e.message; return false; }
  finally {
    instellingenBezig = false;
    $('algemeen-velden').disabled=false;$('algemeen-opslaan').disabled=false;
    for (const veld of $('algemeen-form').querySelectorAll('input')) veld.disabled = false;
    renderAgenda();
  }
}
async function volgInstellingenPublicatie(aanvraag, statusId, versie) {
  const isActueel = () => versie === instellingenPublicatie && isIngelogd();
  const gepubliceerd = await wachtOpPublicatie('agenda.json', data => data.aanvraag_id === aanvraag, {isActueel});
  if (!isActueel()) return;
  if (!gepubliceerd) {
    $(statusId).textContent = 'Opgeslagen. Publicatie duurt langer. Gebruik ‘Herladen’ om opnieuw te controleren.';
    return;
  }
  agenda = gepubliceerd;
  renderAgenda();
  sessionStorage.removeItem('park-publicatie');
  $(statusId).textContent = statusId==='algemeen-status'
    ? 'Gepubliceerd. De instellingen zijn actief voor alle nieuwe handtekeningen.'
    : 'Gepubliceerd. De agenda is bijgewerkt.';
}
$('agenda').addEventListener('click', event => {
  const button = event.target.closest('[data-pin], [data-agenda-skip]');
  if (!button || instellingenBezig) return;
  if(button.hasAttribute('data-agenda-skip')){
    const activiteit=agenda.events.find(ev=>ev.id===button.dataset.agendaSkip && ev.start===button.dataset.start);
    if(!activiteit)return;
    const verborgen=agendaVerborgen(activiteit);
    const lijst=(instellingen.agenda_verborgen || []).filter(item=>item.eind>=parkVandaag() && !(item.id===activiteit.id && item.start===activiteit.start));
    if(!verborgen)lijst.push({id:activiteit.id,start:activiteit.start,eind:activiteit.eind});
    const wijziging={agenda_verborgen:lijst};
    if(!verborgen && (instellingen.vastgezet_id===activiteit.id || (instellingen.vastgezet_id===undefined && instellingen.vastgezet_titel===activiteit.titel))){
      wijziging.vastgezet_id='';wijziging.vastgezet_titel='';
    }
    bewaarInstellingen(wijziging,'agenda-status');return;
  }
  const id = button.dataset.pin;
  const activiteit = agenda.events.find(ev => ev.id === id);
  bewaarInstellingen({vastgezet_id: id, vastgezet_titel: activiteit?.titel || ''}, 'agenda-status');
});
window.addEventListener('beforeunload', event => {
  if (dirty || personenBezig || instellingenBezig || kalender.dirty || kalender.bezig || instellingenGewijzigd()) { event.preventDefault(); event.returnValue = ''; }
});
sessie();
if (isIngelogd()) laad().catch(e => { uitloggen(); sessie(); melding(e.message); });
