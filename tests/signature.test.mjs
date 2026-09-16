import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handtekening, valideerPersoon, persoonlijkeLink, kiesLogovariant} from '../docs/js/signature.js';
import {dagVanJaar, wachtOpPublicatie, verzoek} from '../docs/js/shared.js';

const p = {id:'persoon-123', naam:'Zoë <script>alert(1)</script>', functie:'Hovenier & beheer', telefoon:'+31 (0)10 123 45 67'};
test('signature escapes profile fields and includes an optional phone link', () => {
  const {html, tekst} = handtekening(p, {logovariant:'groen'});
  assert.match(html, /Met vriendelijke groet/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /tel:\+310101234567/);
  assert.match(html, /woordbeeld-groen.png/);
  assert.match(tekst, /Zoë/);
});
test('no phone means no empty phone line', () => {
  assert.ok(!handtekening({...p, telefoon:''}).html.includes('tel:'));
});
test('copy assets stay absolute and use stable addresses', () => {
  const {html} = handtekening(p);
  assert.match(html, /https:\/\/bennolambooy.github.io\/Park\/handtekening-compact.png/);
  assert.ok(!html.includes('?v='));
});
test('compact signature follows the approved order and mobile dimensions', () => {
  const {html, tekst} = handtekening(p, {logovariant:'groen'});
  const parts = ['Met vriendelijke groet', 'tel:', 'woordbeeld-groen', 'Het Parkpaviljoen', 'Baden Powelllaan', 'Elke dag open van 10 tot 18 uur.', 'www.hetparkinrotterdam.nl', 'handtekening-compact.png', 'Volg ons via'];
  for (let i = 1; i < parts.length; i++) assert.ok(html.indexOf(parts[i]) > html.indexOf(parts[i-1]));
  assert.match(html, /width="300"/);
  assert.match(html, /width="120"/);
  assert.match(html, /font-size:14px/);
  assert.ok(!html.includes('width:560px'));
  assert.match(html, /uur\.<br><a[^>]+>www\.hetparkinrotterdam\.nl<\/a>/);
  assert.ok(tekst.includes(p.functie + '\n\n' + p.telefoon));
});
test('random can select either green or the current season on each call', () => {
  assert.equal(kiesLogovariant('random', () => 0.1), 'groen');
  assert.equal(kiesLogovariant('random', () => 0.9), 'seizoen');
  assert.equal(kiesLogovariant('seizoen'), 'seizoen');
  assert.equal(kiesLogovariant('groen'), 'groen');
});
test('personal links keep identity stable without name or phone in URL', () => {
  const url = new URL(persoonlijkeLink(p.id));
  assert.equal(url.searchParams.get('persoon'), p.id);
  assert.ok(!url.href.includes('Zoë'));
});
test('invalid phone and empty names are rejected', () => {
  assert.throws(() => valideerPersoon({...p, naam:' '}));
  assert.throws(() => valideerPersoon({...p, telefoon:'javascript:x'}));
});
test('calendar day numbering remains correct across DST', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Amsterdam';
  try {
    assert.equal(dagVanJaar(new Date(2026, 8, 16, 0, 0)), 259);
    assert.equal(dagVanJaar(new Date(2026, 8, 16, 18, 0)), 259);
    assert.equal(dagVanJaar(new Date(2026, 2, 30)), 89);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('publication wait never accepts the old pin or reports false success', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.location = {href:'https://bennolambooy.github.io/Park/admin.html'};
  let requests = 0;
  globalThis.fetch = async () => ({ok:true, json:async () => ({aanvraag_id:++requests < 3 ? 'oud' : 'nieuw'})});
  try {
    assert.equal((await wachtOpPublicatie('agenda.json', d => d.aanvraag_id === 'nieuw', {pogingen:4,pauze:0})).aanvraag_id, 'nieuw');
    globalThis.fetch = async () => ({ok:true,json:async()=>({aanvraag_id:'oud'})});
    assert.equal(await wachtOpPublicatie('agenda.json', d => d.aanvraag_id === 'nieuw', {pogingen:2,pauze:0}), null);
  } finally { globalThis.fetch = oldFetch; delete globalThis.location; }
});
test('a stalled save times out without claiming that data was not saved', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  try {
    await assert.rejects(verzoek('https://example.invalid', {method:'PUT'}, 10), /Herlaad de lijst om te controleren/);
  } finally { globalThis.fetch = previous; }
});
