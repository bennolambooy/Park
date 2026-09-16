import {toegang} from './gate.js?v=20260916-3';
import {inloggen, isIngelogd, leesBestand, schrijfBestand} from './github.js?v=20260916-3';
import {esc, dagVanJaar} from './shared.js?v=20260916-3';
await toegang();

const PAD = 'data/bloeikalender.json';
const MAANDEN = ['januari','februari','maart','april','mei','juni','juli',
                 'augustus','september','oktober','november','december'];
let data = null, sha = null, dirty = 0, openEdit = null;

const idxVan = (m, h) => (m - 1) * 2 + (h - 1);
const vanIdx = i => [Math.floor(i / 2) + 1, i % 2 + 1];
const labelVan = i => (i % 2 ? 'eind ' : 'begin ') + MAANDEN[Math.floor(i / 2)];
function huidigeIdx() { const n = new Date(); return idxVan(n.getMonth() + 1, n.getDate() <= 15 ? 1 : 2); }
function isActief(e, idx) {
  const v = idxVan(...e.van), t = idxVan(...e.tot);
  return v <= t ? (idx >= v && idx <= t) : (idx >= v || idx <= t);
}
const isoVan = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
  '-' + String(d.getDate()).padStart(2, '0');
const isoVandaag = () => isoVan(new Date());
const isGepauzeerd = e => e.pauze_tot && e.pauze_tot >= isoVandaag();
const periodeTekst = e => labelVan(idxVan(...e.van)) + ' t/m ' + labelVan(idxVan(...e.tot));

function keuzeOpDag(d) {
  // zelfde logica als genereer.py: actieve pool, prio 1-2, dagrotatie
  const iso = isoVan(d), idx = idxVan(d.getMonth() + 1, d.getDate() <= 15 ? 1 : 2);
  const act = data.entries.filter(e => isActief(e, idx) && !(e.pauze_tot && e.pauze_tot >= iso));
  const pool = act.filter(e => e.prio <= 2);
  const p = (pool.length ? pool : act).slice()
    .sort((a, b) => a.prio - b.prio || (a.tekst < b.tekst ? -1 : 1));
  return p.length ? p[dagVanJaar(d) % p.length] : null;
}
const WEEKD = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
function renderPreview() {
  let html = '';
  for (let k = 0; k < 7; k++) {
    const d = new Date(); d.setDate(d.getDate() + k);
    const e = keuzeOpDag(d);
    const label = k === 0 ? 'vandaag' : k === 1 ? 'morgen' :
      WEEKD[d.getDay()] + ' ' + d.getDate() + ' ' + MAANDEN[d.getMonth()].slice(0, 3);
    html += '<div class="dagregel' + (k === 0 ? ' nu' : '') + '"><span class="dag">' + label +
      '</span><span>' + (e ? esc(e.tekst) : '—') + '</span></div>';
  }
  document.getElementById('preview').innerHTML = html;
}
function naarToevoegen() {
  document.getElementById('kopje-toevoegen').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('nieuwtekst').focus({ preventScroll: true });
}

function eindDatum([m, h]) {
  const nu = new Date(); let jaar = nu.getFullYear();
  if (idxVan(m, h) < huidigeIdx()) jaar++;
  const dag = h === 1 ? 15 : new Date(jaar, m, 0).getDate();
  return jaar + '-' + String(m).padStart(2, '0') + '-' + String(dag).padStart(2, '0');
}

// ---- acties ----
function uitgebloeid(i) { data.entries[i].pauze_tot = eindDatum(data.entries[i].tot); wijzig(); }
function tochBloei(i)   { delete data.entries[i].pauze_tot; wijzig(); }
function bloeitAl(i)    { data.entries[i].van = vanIdx(huidigeIdx()); delete data.entries[i].pauze_tot; wijzig(); }
function verwijder(i)   { if (confirm('Deze regel definitief uit de kalender halen?')) { data.entries.splice(i, 1); openEdit = null; wijzig(); } }
function zetEdit(i)     { openEdit = (openEdit === i ? null : i); render(); }
function pasAan(i, veld, w) {
  const e = data.entries[i];
  if (veld === 'tekst') { if (!w.trim()) return; e.tekst = w.trim(); }
  else if (veld === 'prio') e.prio = +w;
  else e[veld] = vanIdx(+w);
  wijzig();
}
function voegToe() {
  const t = document.getElementById('nieuwtekst').value.trim();
  if (!t) { melding('Vul eerst in wat er bloeit.'); return; }
  data.entries.push({ tekst: t, van: vanIdx(huidigeIdx()),
    tot: vanIdx(+document.getElementById('nieuwtot').value),
    prio: 2,
    bron: 'gemeld via beheerpagina, ' + isoVandaag() });
  document.getElementById('nieuwtekst').value = '';
  wijzig();
}
function wijzig() { dirty++; render(); }

// ---- weergave ----
function kaart(e, i, knoppen, extra) {
  return '<div class="kaart"><div class="info"><div class="naam">' + esc(e.tekst) + '</div>' +
    '<div class="periode">' + periodeTekst(e) + '</div>' + (extra || '') + '</div>' + knoppen + '</div>';
}
function render() {
  const idx = huidigeIdx();
  const act = [], pauze = [], straks = [];
  data.entries.forEach((e, i) => {
    if (isActief(e, idx)) (isGepauzeerd(e) ? pauze : act).push(i);
    else { const afstand = (idxVan(...e.van) - idx + 24) % 24; if (afstand >= 1 && afstand <= 2) straks.push(i); }
  });
  const vandaag = keuzeOpDag(new Date());
  renderPreview();
  document.getElementById('actief').innerHTML =
    act.map(i => kaart(data.entries[i], i,
      '<button class="knopje rood" onclick="uitgebloeid(' + i + ')">Uitgebloeid</button>',
      data.entries[i] === vandaag ? '<span class="vandaag">vandaag op de handtekening</span>' : ''
    )).join('') +
    pauze.map(i => kaart(data.entries[i], i,
      '<button class="knopje" onclick="tochBloei(' + i + ')">Bloeit toch</button>',
      '<span class="badge">uitgebloeid gemeld t/m ' + data.entries[i].pauze_tot + '</span>'
    )).join('') || '<p class="klein">Niets actief in deze periode.</p>';
  document.getElementById('binnenkort').innerHTML =
    straks.map(i => kaart(data.entries[i], i,
      '<button class="knopje" onclick="bloeitAl(' + i + ')">Bloeit nu al</button>'
    )).join('') || '<p class="klein">Niets gepland voor de komende maand.</p>';
  document.getElementById('alles').innerHTML = kalender(idx);
  document.getElementById('balk').style.display = dirty ? 'block' : 'none';
  document.getElementById('telling').textContent = dirty + ' wijziging' + (dirty === 1 ? '' : 'en');
}

function bewerkPaneel(e, i) {
  const opties = n => Array.from({length: 24}, (_, k) =>
    '<option value="' + k + '"' + (k === n ? ' selected' : '') + '>' + labelVan(k) + '</option>').join('');
  let snel = '';
  if (isGepauzeerd(e)) snel = '<button class="knopje" onclick="tochBloei(' + i + ')">Bloeit toch</button>';
  else if (isActief(e, huidigeIdx())) snel = '<button class="knopje rood" onclick="uitgebloeid(' + i + ')">Uitgebloeid</button>';
  return '<div class="bewerk">' +
    '<input class="breed" value="' + esc(e.tekst) + '" maxlength="70" onchange="pasAan(' + i + ',\'tekst\',this.value)">' +
    '<label>van <select onchange="pasAan(' + i + ',\'van\',this.value)">' + opties(idxVan(...e.van)) + '</select></label>' +
    '<label>tot <select onchange="pasAan(' + i + ',\'tot\',this.value)">' + opties(idxVan(...e.tot)) + '</select></label>' +
    '<span style="align-self:end;display:flex;gap:8px">' + snel +
    '<button class="knopje rood" onclick="verwijder(' + i + ')">Verwijderen</button></span>' +
    '</div>';
}
function kalender(idx) {
  const orde = data.entries.map((_, i) => i).sort((a, b) =>
    idxVan(...data.entries[a].van) - idxVan(...data.entries[b].van) ||
    (data.entries[a].tekst < data.entries[b].tekst ? -1 : 1));
  const kop = '<div class="kalkop"><div class="kallabel">' + new Date().getFullYear() + ' →</div>' +
    MAANDEN.map(m => '<div style="grid-column:span 2">' + m[0].toUpperCase() + '</div>').join('') + '</div>';
  const rijen = orde.map(i => {
    const e = data.entries[i];
    const v = idxVan(...e.van), t = idxVan(...e.tot);
    const stukken = v <= t ? [[v, t]] : [[v, 23], [0, t]];
    const balken = stukken.map(([a, b]) =>
      '<div class="balk" style="grid-column:' + (a + 2) + '/' + (b + 3) + ';background:#00752e' +
      (isGepauzeerd(e) ? ';opacity:.35' : '') + '"></div>').join('');
    const inpool = isActief(e, idx) && e.prio <= 2 && !isGepauzeerd(e);
    return '<div class="kalrij' + (openEdit === i ? ' open' : '') + '" onclick="zetEdit(' + i + ')">' +
      '<div class="kallabel' + (inpool ? ' inpool' : '') + '">' + esc(e.tekst) + '</div>' +
      '<div class="nucol" style="grid-column:' + (idx + 2) + '"></div>' + balken + '</div>' +
      (openEdit === i ? '<div class="kaledit" onclick="event.stopPropagation()">' + bewerkPaneel(e, i) + '</div>' : '');
  }).join('');
  return '<div class="kal"><div class="kalbinnen">' + kop + rijen + '</div></div>' +
    '<div class="legenda">' +
    '<span><span class="bol" style="background:#eaf5ee"></span>de groene kolom is nu</span>' +
    '<span><span class="bol" style="background:#00752e;opacity:.35"></span>vage balk = uitgebloeid gemeld</span>' +
    '<span style="color:#00752e;font-weight:700">groene naam = nu in de handtekening</span></div>';
}

function melding(t, kort) {
  const m = document.getElementById('melding');
  m.textContent = t; m.style.display = 'block';
  if (kort) setTimeout(() => m.style.display = 'none', 6000);
}

// ---- Shared administrator session and conflict-safe persistence ----
async function laad() {
  if (!isIngelogd()) { toonSleutel(); return; }
  try {
    const bestand = await leesBestand(PAD);
    sha = bestand.sha; data = bestand.data; dirty = 0;
    document.getElementById('kalender-inhoud').hidden = false;
    render();
  } catch (e) { melding(e.message); toonSleutel(); }
}
function toonSleutel(uitleg) {
  document.getElementById('sleutelkaart').hidden = false;
  if (uitleg) document.getElementById('sleuteluitleg').textContent = uitleg;
  document.getElementById('sleutelveld').focus();
}
async function bewaarSleutel() {
  try {
    await inloggen(document.getElementById('sleutelveld').value);
    document.getElementById('sleutelveld').value = '';
    document.getElementById('sleutelkaart').hidden = true;
    if (dirty) await opslaan(); else await laad();
  } catch (e) { melding(e.message); }
}
let bezig = false;
async function opslaan() {
  if (bezig) return;
  if (!isIngelogd()) { toonSleutel(); return; }
  bezig = true;
  document.querySelector('#balk button').disabled = true;
  try {
    const kopie = structuredClone(data);
    kopie.entries.forEach(e => { if (e.pauze_tot && e.pauze_tot < isoVandaag()) delete e.pauze_tot; });
    sha = await schrijfBestand(PAD, kopie, sha, 'Bloeikalender bijgewerkt via beheerpagina');
    data = kopie; dirty = 0; render();
    melding('Opgeslagen. De handtekening wordt nu opnieuw gepubliceerd.', true);
  } catch (e) {
    melding(e.message);
    if (e.status === 401 || e.status === 403) toonSleutel();
  } finally {
    bezig = false;
    document.querySelector('#balk button').disabled = false;
  }
}
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
// Legacy calendar markup retains its handlers while using shared modules.
Object.assign(window, {naarToevoegen, uitgebloeid, tochBloei, bloeitAl, verwijder,
  zetEdit, pasAan, voegToe, opslaan, bewaarSleutel});

// dropdown "bloeit tot": komende 12 halfmaanden, standaard ± een maand vooruit
document.getElementById('nieuwtot').innerHTML = Array.from({length: 12}, (_, k) => {
  const i = (huidigeIdx() + k) % 24;
  return '<option value="' + i + '"' + (k === 2 ? ' selected' : '') + '>' + labelVan(i) + '</option>';
}).join('');
laad();
