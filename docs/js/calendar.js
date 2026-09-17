import {leesBestand, schrijfBestand} from './github.js?v=20260917-7';
import {esc} from './shared.js?v=20260917-7';
import {keuzeOpDag, bloeiTekst, bloeiEinde} from './bloom.js?v=20260917-7';

const PAD = 'data/bloeikalender.json';
const MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const idx = ([m,h]) => (m-1)*2+h-1;
const periode = i => [Math.floor(i/2)+1,i%2+1];
const label = i => (i%2 ? 'eind ' : 'begin ') + MAANDEN[Math.floor(i/2)];
const vandaag = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Amsterdam'}).format(new Date());
const parkDatum = () => new Date(vandaag() + 'T12:00:00');
const nu = () => { const d=parkDatum(); return d.getMonth()*2+(d.getDate()>15 ? 1 : 0); };
const actief = e => idx(e.van)<=idx(e.tot) ? nu()>=idx(e.van)&&nu()<=idx(e.tot) : nu()>=idx(e.van)||nu()<=idx(e.tot);
const gepauzeerd = e => e.pauze_tot && e.pauze_tot>=vandaag();
const overgeslagen = e => e.overslaan_tot && e.overslaan_tot>=vandaag();
const opties = gekozen => Array.from({length:24},(_,i) => '<option value="'+i+'"'+(i===gekozen?' selected':'')+'>'+label(i)+'</option>').join('');

export function bloeikalender(root) {
  const $ = id => root.querySelector('#'+id);
  let data=null, sha=null, dirty=false, bezig=false, edit=null, nieuwDirty=false;
  const status = tekst => { $('bloei-status').textContent=tekst; };
  function gewijzigd() {
    dirty=true;
    $('bloei-opslaan').disabled=false;
    status('Nog niet opgeslagen.');
    renderWeek();
  }
  function renderWeek() {
    const planning=new Map();
    for(let i=0;i<7;i++){
      const d=parkDatum(); d.setDate(d.getDate()+i);
      const kop=i===0?'Vandaag':i===1?'Morgen':new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short'}).format(d);
      const keuze=keuzeOpDag(data.entries,d,data.vastgezet);
      if(keuze){if(!planning.has(keuze))planning.set(keuze,[]);planning.get(keuze).push(kop);}
    }
    for(const rij of $('bloei-keuzes').querySelectorAll('[data-keuze]')){
      const dagen=planning.get(data.entries[Number(rij.dataset.keuze)]) || [];
      const tekst=rij.querySelector('.bloei-planning');
      tekst.textContent=dagen.length===7?'Komende 7 dagen':dagen.join(' · ');
      tekst.hidden=!dagen.length;
      tekst.setAttribute('aria-label','In de handtekening: '+tekst.textContent);
    }
  }
  function renderKeuzes() {
    const nuBloei=data.entries.map((e,i)=>({e,i})).filter(({e})=>actief(e)&&!gepauzeerd(e)&&!overgeslagen(e));
    const lijst=$('bloei-keuzes');
    // Keep existing buttons mounted: an input's blur/change fires between
    // pointerdown and click and must not replace the button being clicked.
    const behoud=new Set(nuBloei.map(({i})=>String(i)));
    for(const rij of [...lijst.children])if(!behoud.has(rij.dataset.keuze))rij.remove();
    for(const {e,i} of nuBloei){
      let rij=lijst.querySelector('[data-keuze="'+i+'"]');
      if(!rij){
        rij=document.createElement('div');rij.className='bloei-keuze';rij.dataset.keuze=i;
        rij.innerHTML='<span class="bloei-info"><span class="bloei-naam"></span> <small class="bloei-periode"></small><small class="bloei-planning" hidden></small></span><span class="bloei-acties"><button type="button" class="secondary small" data-vast="'+i+'"></button><button type="button" class="bloei-overslaan" data-overslaan="'+i+'">×</button></span>';
        lijst.append(rij);
      }
      rij.querySelector('.bloei-naam').textContent=e.tekst;
      rij.querySelector('.bloei-periode').textContent=label(idx(e.van))+' – '+label(idx(e.tot));
      const knop=rij.querySelector('[data-vast]');
      knop.textContent=isVast(e)?'Maak los':'Zet vast';knop.setAttribute('aria-pressed',String(isVast(e)));
      const overslaan=rij.querySelector('[data-overslaan]');
      overslaan.title='Dit bloeiseizoen overslaan';
      overslaan.setAttribute('aria-label',e.tekst+': '+overslaan.title.toLowerCase());
    }
    if(!nuBloei.length)lijst.innerHTML='<p class="muted">Geen bloei in deze periode. Andere periodes staan in het jaaroverzicht.</p>';
    const verborgen=data.entries.map((e,i)=>({e,i})).filter(({e})=>overgeslagen(e));
    $('bloei-verborgen').hidden=!verborgen.length;
    $('bloei-herstel').innerHTML=verborgen.map(({e,i})=>'<div class="bloei-keuze"><span>'+esc(e.tekst)+' <small class="bloei-periode">'+esc(label(idx(e.van))+' – '+label(idx(e.tot)))+'</small></span><button type="button" class="tekstlink" data-overslaan="'+i+'">Terugzetten</button></div>').join('');
    renderWeek();
  }
  function editor(e,i) {
    return '<div class="bloei-editor" data-editor="'+i+'">'+
      '<label class="field bloei-tekst">Tekst<input data-veld="tekst" value="'+esc(e.tekst)+'" maxlength="70" required></label>'+
      '<label class="field">Van<select data-veld="van">'+opties(idx(e.van))+'</select></label>'+
      '<label class="field">Tot<select data-veld="tot">'+opties(idx(e.tot))+'</select></label>'+
      '<div class="actions bloei-tekst">'+
      '<button class="secondary small" data-actie="'+(gepauzeerd(e)?'hervat':actief(e)?'pauze':'start')+'" data-i="'+i+'">'+(gepauzeerd(e)?'Bloeit weer':actief(e)?'Uitgebloeid':'Bloeit al')+'</button>'+
      '<button class="danger small" data-actie="verwijder" data-i="'+i+'">Verwijderen</button></div></div>';
  }
  function renderJaar(behoudEditor=false) {
    const order=data.entries.map((e,i)=>({e,i})).sort((a,b)=>idx(a.e.van)-idx(b.e.van)||a.e.tekst.localeCompare(b.e.tekst,'nl'));
    $('bloei-jaar').innerHTML='<div class="kal"><div class="kalbinnen"><div class="kalkop"><span>'+parkDatum().getFullYear()+'</span>'+MAANDEN.map(m=>'<span style="grid-column:span 2" title="'+m+'">'+m.slice(0,3)+'</span>').join('')+'</div>'+
      order.map(({e,i})=>{
        const v=idx(e.van),t=idx(e.tot), stukken=v<=t?[[v,t]]:[[v,23],[0,t]];
        return '<button type="button" class="kalrij" data-edit="'+i+'" aria-expanded="'+(edit===i)+'" aria-label="'+esc(e.tekst+', '+label(v)+' tot '+label(t)+(gepauzeerd(e)?', uitgebloeid':''))+'">'+
          '<span class="kallabel'+(actief(e)&&!gepauzeerd(e)&&!overgeslagen(e)?' inpool':'')+'">'+esc(e.tekst)+'</span>'+
          '<span class="nucol" style="grid-column:'+(nu()+2)+'" aria-hidden="true"></span>'+
          stukken.map(([a,b])=>'<span class="bloeibalk'+(gepauzeerd(e)?' gepauzeerd':'')+'" style="grid-column:'+(a+2)+' / '+(b+3)+'" aria-hidden="true"></span>').join('')+'</button>';
      }).join('')+'</div></div>';
    if(!behoudEditor)$('bloei-bewerken').innerHTML=edit===null?'':editor(data.entries[edit],edit);
    renderKeuzes();
    $('bloei-opslaan').disabled=!dirty||bezig;
  }
  function reset() {
    data=null;sha=null;dirty=false;nieuwDirty=false;edit=null;
    $('bloei-velden').hidden=true;
    $('bloei-nieuw').reset();$('bloei-nieuw').hidden=true;
    $('bloei-toevoegen').setAttribute('aria-expanded','false');
    $('bloei-herlaad').hidden=true;
    status('');
  }
  async function laad() {
    // Reloading colleagues must never discard unsaved calendar edits.
    if (dirty||nieuwDirty||bezig) return;
    try {
      const bestand=await leesBestand(PAD);
      data=bestand.data;sha=bestand.sha;edit=null;
      data.entries.forEach(e=>{e.tekst=bloeiTekst(e.tekst);});
      $('bloei-velden').hidden=false;
      $('bloei-nieuw-tot').innerHTML=opties((nu()+2)%24);
      $('bloei-nieuw-van').innerHTML=opties(nu());
      renderWeek();renderJaar();status('');$('bloei-herlaad').hidden=true;
    } catch(e) { status(e.message);$('bloei-herlaad').hidden=false; }
  }
  $('bloei-jaar').addEventListener('click',event=>{
    const b=event.target.closest('[data-edit]');if(!b||bezig)return;
    const i=Number(b.dataset.edit);edit=edit===i?null:i;renderJaar();
    if(edit!==null)$('bloei-bewerken').querySelector('input').focus();
  });
  function isVast(e) {
    return Boolean(e.id && data.vastgezet?.id===e.id && data.vastgezet.tot>=vandaag() && actief(e) && !gepauzeerd(e) && !overgeslagen(e));
  }
  root.addEventListener('click',async event=>{
    const knop=event.target.closest('[data-vast], [data-overslaan]');if(!knop||bezig)return;
    if(dirty||nieuwDirty){status('Sla je wijzigingen eerst op voordat je de bloeikeuze wijzigt.');return;}
    const e=data.entries[Number(knop.dataset.vast ?? knop.dataset.overslaan)];
    if(knop.hasAttribute('data-overslaan')){
      if(overgeslagen(e))delete e.overslaan_tot;
      else {
        e.overslaan_tot=bloeiEinde(e,parkDatum());
        if(e.id && data.vastgezet?.id===e.id)delete data.vastgezet;
      }
    }
    else if(isVast(e)) delete data.vastgezet;
    else {
      e.id ||= crypto.randomUUID();
      data.vastgezet={id:e.id,tot:bloeiEinde(e,parkDatum())};
    }
    gewijzigd();renderJaar(true);await opslaan();
  });
  $('bloei-bewerken').addEventListener('input',event=>{
    const veld=event.target.dataset.veld;if(!veld||bezig||edit===null)return;
    if(veld==='tekst')data.entries[edit].tekst=event.target.value;
    else data.entries[edit][veld]=periode(Number(event.target.value));
    gewijzigd();
  });
  $('bloei-bewerken').addEventListener('change',event=>{
    if(bezig)return;
    if(event.target.dataset.veld==='tekst' && edit!==null){
      data.entries[edit].tekst=bloeiTekst(event.target.value);
      event.target.value=data.entries[edit].tekst;renderWeek();
    }
    renderJaar(true);
  });
  $('bloei-bewerken').addEventListener('click',event=>{
    const b=event.target.closest('[data-actie]');if(!b||bezig)return;
    const i=Number(b.dataset.i),e=data.entries[i];
    if(b.dataset.actie==='verwijder'){
      if(!confirm('Deze bloeiregel verwijderen?'))return;
      data.entries.splice(i,1);edit=null;
    } else if(b.dataset.actie==='pauze'){
      e.pauze_tot=bloeiEinde(e,parkDatum());
    } else {
      delete e.pauze_tot;
      if(b.dataset.actie==='start')e.van=periode(nu());
    }
    gewijzigd();renderJaar();
  });
  $('bloei-toevoegen').addEventListener('click',()=>{
    if(bezig)return;
    $('bloei-nieuw').hidden=!$('bloei-nieuw').hidden;
    $('bloei-toevoegen').setAttribute('aria-expanded',String(!$('bloei-nieuw').hidden));
    if(!$('bloei-nieuw').hidden)$('bloei-nieuw-tekst').focus();
  });
  $('bloei-nieuw').addEventListener('input',()=>{nieuwDirty=true;});
  $('bloei-nieuw').addEventListener('submit',event=>{
    event.preventDefault();if(bezig||!data)return;
    const tekst=bloeiTekst($('bloei-nieuw-tekst').value);if(!tekst){status('Vul in wat er bloeit.');return;}
    data.entries.push({id:crypto.randomUUID(),tekst,van:periode(Number($('bloei-nieuw-van').value)),tot:periode(Number($('bloei-nieuw-tot').value)),prio:2,bron:'gemeld via beheerpagina, '+vandaag()});
    $('bloei-nieuw').reset();$('bloei-nieuw').hidden=true;nieuwDirty=false;
    $('bloei-toevoegen').setAttribute('aria-expanded','false');
    edit=data.entries.length-1;gewijzigd();renderJaar();
  });
  async function opslaan(){
    if(bezig||!dirty)return;
    if(data.entries.some(e=>!e.tekst.trim()||e.tekst.length>70)){status('Vul voor elke regel een tekst van maximaal 70 tekens in.');return;}
    bezig=true;$('bloei-velden').disabled=true;status('Opslaan…');
    try {
      const kopie=structuredClone(data);
      if(!data.entries.some(isVast))delete kopie.vastgezet;
      kopie.entries.forEach(e=>{delete e.in_handtekening;e.tekst=bloeiTekst(e.tekst);if(e.pauze_tot&&e.pauze_tot<vandaag())delete e.pauze_tot;if(e.overslaan_tot&&e.overslaan_tot<vandaag())delete e.overslaan_tot;});
      sha=await schrijfBestand(PAD,kopie,sha,'Bloeikalender bijgewerkt via beheerpagina');
      data=kopie;dirty=false;renderWeek();renderJaar();
      status('Opgeslagen. De handtekening wordt bijgewerkt.');$('bloei-herlaad').hidden=true;
    } catch(e) {status(e.message);$('bloei-herlaad').hidden=false;}
    finally {bezig=false;$('bloei-velden').disabled=false;$('bloei-opslaan').disabled=!dirty;}
  }
  $('bloei-opslaan').addEventListener('click',opslaan);
  $('bloei-herlaad').addEventListener('click',async()=>{
    if(bezig)return;
    if((dirty||nieuwDirty)&&!confirm('Niet-opgeslagen wijzigingen in de bloeikalender wissen en de nieuwste versie laden?'))return;
    reset();await laad();
  });
  return {laad,reset,get dirty(){return dirty||nieuwDirty;},get bezig(){return bezig;}};
}
