import test from 'node:test';
import assert from 'node:assert/strict';
import {keuzeOpDag, bloeiTekst, bloeiEinde} from '../docs/js/bloom.js';

test('bloom text starts with a capital without changing proper names',()=>{
  assert.equal(bloeiTekst('  rozen bij het Parkpaviljoen  '),'Rozen bij het Parkpaviljoen');
  assert.equal(bloeiTekst('ijzerhout'),'IJzerhout');
  assert.equal(bloeiTekst('één magnolia'),'Één magnolia');
  assert.equal(bloeiTekst(''),'');
});

test('bloom choice respects half-month boundaries, winter periods and pauses', () => {
  const a = {tekst:'Winter', van:[12,1], tot:[2,1], prio:1};
  assert.equal(keuzeOpDag([a], new Date(2026,0,15)).tekst, 'Winter');
  assert.equal(keuzeOpDag([a], new Date(2026,1,16)), null);
  assert.equal(keuzeOpDag([{...a,pauze_tot:'2026-01-15'}], new Date(2026,0,15)), null);
  assert.equal(keuzeOpDag([{...a,pauze_tot:'2026-01-15'}], new Date(2026,0,16)).tekst, 'Winter');
});
test('all enabled bloom entries participate in stable daily rotation', () => {
  const entries = ['A','B','C'].map((tekst,i) => ({tekst,van:[1,1],tot:[12,2],prio:i+1}));
  assert.equal(keuzeOpDag(entries, new Date(2026,0,1)).tekst, 'B');
  assert.equal(keuzeOpDag(entries, new Date(2026,0,2)).tekst, 'C');
  assert.equal(keuzeOpDag([entries[2]], new Date(2026,0,2)).tekst, 'C');
  assert.equal(keuzeOpDag([], new Date(2026,0,2)), null);
});
test('a pin overrides rotation, expires permanently and respects pauses and periods',()=>{
  const e={id:'rozen',tekst:'Rozen',van:[6,1],tot:[9,2],prio:1};
  const other={id:'asters',tekst:'Asters',van:[1,1],tot:[12,2],prio:2};
  const pin={id:'rozen',tot:'2026-09-30'};
  for(let day=16;day<23;day++)assert.equal(keuzeOpDag([e,other],new Date(2026,8,day),pin).id,'rozen');
  assert.equal(keuzeOpDag([{...e,tekst:'Nieuwe naam'},other],new Date(2026,8,17),pin).tekst,'Nieuwe naam');
  assert.equal(keuzeOpDag([other],new Date(2026,8,17),pin).id,'asters');
  assert.equal(keuzeOpDag([{...e,pauze_tot:'2026-09-30'},other],new Date(2026,8,17),pin).id,'asters');
  assert.equal(keuzeOpDag([e,other],new Date(2026,9,1),pin).id,'asters');
  const nextYear=new Date(2027,8,17);
  assert.deepEqual(keuzeOpDag([e,other],nextYear,pin),keuzeOpDag([e,other],nextYear));
});
test('winter pin spans the year boundary but not the following season',()=>{
  const e={id:'winter',tekst:'Winterzoet',van:[12,1],tot:[2,1],prio:1};
  const pin={id:'winter',tot:'2027-02-15'};
  assert.equal(keuzeOpDag([e],new Date(2027,0,5),pin).id,'winter');
  assert.equal(keuzeOpDag([e],new Date(2027,1,16),pin),null);
});

test('skip lasts through this bloom season and returns next season, including winter',()=>{
  const e={id:'bloei',tekst:'Rozen',van:[6,1],tot:[9,2],prio:1,overslaan_tot:'2026-09-30'};
  assert.equal(bloeiEinde(e,new Date(2026,8,17)),'2026-09-30');
  assert.equal(bloeiEinde({...e,tot:[9,1]},new Date(2026,8,15)),'2026-09-15');
  const pin={id:'bloei',tot:'2026-09-30'};
  assert.equal(keuzeOpDag([e],new Date(2026,8,20),pin),null);
  assert.equal(keuzeOpDag([e],new Date(2026,8,30)),null);
  assert.equal(keuzeOpDag([e],new Date(2026,9,1)),null);
  assert.equal(keuzeOpDag([e],new Date(2027,5,1))?.id,'bloei');
  const winter={...e,van:[12,1],tot:[2,2],overslaan_tot:'2027-02-28'};
  assert.equal(bloeiEinde(winter,new Date(2026,11,5)),'2027-02-28');
  assert.equal(bloeiEinde(winter,new Date(2027,0,5)),'2027-02-28');
  assert.equal(bloeiEinde(winter,new Date(2028,0,5)),'2028-02-29');
  assert.equal(keuzeOpDag([winter],new Date(2027,0,5)),null);
  assert.equal(keuzeOpDag([winter],new Date(2027,11,1))?.id,'bloei');
});
