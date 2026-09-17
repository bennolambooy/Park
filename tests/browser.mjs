import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createServer} from 'node:http';
import {webcrypto} from 'node:crypto';
import {chromium} from 'playwright';
import {bloeiEinde} from '../docs/js/bloom.js';

const docs = resolve('docs');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.ttf':'font/ttf', '.woff2':'font/woff2'};
const server = createServer(async (req, res) => {
  const path = resolve(docs, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(docs + '/')) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/';
await mkdir('test-results', {recursive:true});
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({permissions:['clipboard-read', 'clipboard-write'], viewport:{width:1280,height:1000}});
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const baseAgenda = JSON.parse(await readFile('docs/agenda.json', 'utf8'));
let agenda = structuredClone(baseAgenda);
const people = {personen:[]};
let publicPeople = {personen:[]};
let peoplePending = null, settingsPending = null, peopleReads = 0, settingsReads = 0, writes = 0, conflict = false, offline = false;
const files = {
  'data/personen.json': {data: people, sha:'people-0'},
  'data/instellingen.json': {data:{vastgezet_id:baseAgenda.vastgezet_id, vastgezet_titel:baseAgenda.vastgezet_titel, logostijl:'random'}, sha:'settings-0'},
  'data/bloeikalender.json': {data:JSON.parse(await readFile('data/bloeikalender.json','utf8')),sha:'calendar-0'},
};

// A fake encrypted credential exercises login without using the production password/token.
const salt = new Uint8Array(16).fill(7), iv = new Uint8Array(12).fill(9);
const keyMaterial = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('test-park-password'), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:300000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt']);
const cipher = await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('test-only-credential'));
const envelope = {zout:Buffer.from(salt).toString('base64'), iv:Buffer.from(iv).toString('base64'), blob:Buffer.from(cipher).toString('base64')};
await context.route('**/js/config.js*', async route => {
  const source = await readFile('docs/js/config.js','utf8');
  await route.fulfill({contentType:'text/javascript',body:source.replace(/export const GEHEIM = .*?;/, 'export const GEHEIM = ' + JSON.stringify(envelope) + ';')});
});
await context.route('https://api.github.com/**', async route => {
  const request = route.request();
  assert.equal(request.headers().authorization, 'Bearer test-only-credential');
  const path = new URL(request.url()).pathname.split('/contents/')[1];
  if (!path) { await route.fulfill({json:{permissions:{push:true}}}); return; }
  const file = files[path];
  if (!file) { await route.fulfill({status:404,json:{message:'Not found'}}); return; }
  if (request.method() === 'GET') {
    await route.fulfill({json:{sha:file.sha,content:Buffer.from(JSON.stringify(file.data)).toString('base64')}});
  } else {
    if (offline) { offline = false; await route.abort('connectionfailed'); return; }
    const body = request.postDataJSON();
    if (conflict || body.sha !== file.sha) { conflict = false; await route.fulfill({status:409,json:{message:'Conflict'}}); return; }
    assert.equal(body.branch, 'main');
    file.data = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    file.sha += '-next'; writes++;
    if (path === 'data/personen.json') { peoplePending = structuredClone(file.data); peopleReads = 0; }
    if (path === 'data/instellingen.json') { settingsPending = structuredClone(file.data); settingsReads = 0; }
    await route.fulfill({json:{content:{sha:file.sha}}});
  }
});
await context.route(base + 'personen.json?*', async route => {
  if (peoplePending && ++peopleReads >= 2) { publicPeople = peoplePending; peoplePending = null; }
  await route.fulfill({json:publicPeople});
});
await context.route(base + 'agenda.json?*', async route => {
  if (settingsPending && ++settingsReads >= 2) {
    const beschikbaar=agenda.events.filter(ev=>!(settingsPending.agenda_verborgen || []).some(item=>item.id===ev.id&&item.start===ev.start));
    agenda = {...agenda, ...settingsPending, gekozen_id:beschikbaar.find(ev=>ev.id===settingsPending.vastgezet_id)?.id || beschikbaar[0]?.id || '', versie:'test-version-' + writes};
    settingsPending = null;
  }
  await route.fulfill({json:agenda});
});

try {
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-16T12:00:00+02:00'));
  await page.goto(base + 'admin.html');
  assert.equal(await page.locator('.shell').isVisible(), false);
  assert.ok(!(await page.locator('.toegang').innerText()).includes('Vul het Park-wachtwoord'));
  await page.locator('.toegang input').fill('verkeerd');
  await page.locator('.toegang button').click();
  await page.waitForFunction(() => document.querySelector('.toegang .status').textContent.includes('klopt niet'));
  await page.locator('.toegang input').fill('test-park-password');
  await page.locator('.toegang button').click();
  await page.locator('.toegang').waitFor({state:'detached'});
  assert.equal(await page.evaluate(() => sessionStorage.getItem('park-beheer-sessie')), null);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('16px Walsheim') && document.fonts.check('16px Roslindale')), true, 'real house fonts load from the site origin');
  assert.equal(await page.locator('.brand img').count(), 1, 'header uses the real PNG wordmark');
  assert.match(await page.locator('.brand img').getAttribute('src'), /woordbeeld-groen.png/);
  assert.equal(await page.locator('#beheer').isVisible(), false);
  await page.locator('#wachtwoord').fill('verkeerd');
  await page.locator('#login-form button').click();
  await page.waitForFunction(() => document.querySelector('#melding').textContent.includes('klopt niet'));
  assert.equal(writes, 0);
  await page.locator('#wachtwoord').fill('test-park-password');
  await page.locator('#login-form button').click();
  await page.locator('#beheer').waitFor({state:'visible'});
  assert.equal(await page.locator('#agenda .agenda-item').count(), 5);
  assert.equal(await page.locator('#agenda-meer').getAttribute('aria-expanded'), 'false');
  await page.locator('#agenda-meer').click();
  assert.equal(await page.locator('#agenda .agenda-item').count(), agenda.events.length);
  assert.equal(await page.locator('#agenda-meer').innerText(), 'Zie minder');
  await page.locator('#agenda-meer').click();
  assert.equal(await page.locator('#agenda .agenda-item').count(), 5);
  assert.equal(await page.locator('#bloeiagenda').count(), 0);
  assert.ok((await page.locator('#bloei-keuzes .bloei-planning').allTextContents()).join(' ').includes('Vandaag'));
  assert.equal(await page.locator('#wachtwoord').inputValue(), '');
  assert.equal(await page.evaluate(() => localStorage.getItem('parksleutel')), null);
  assert.equal(await page.locator('#persoon-editor').isVisible(),false);
  assert.equal(await page.locator('#medewerkers-beheer').count(),1);
  await page.locator('#nieuw').click();
  await page.locator('#naam').fill('Zoë van het Park');
  await page.locator('#functie').fill('Hovenier & beheer');
  await page.locator('#telefoon').fill('010 123 45 67');
  await page.locator('#opslaan').click();
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(await page.locator('#opslaan').isEnabled(), true, 'editing unlocks before publication');
  assert.equal(await page.locator('#naam').isEnabled(), true);
  assert.equal(publicPeople.personen.length, 0, 'do not claim publication before public data changes');
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(publicPeople.personen.length, 1);
  assert.equal(await page.locator('#medewerkers-beheer .medewerker-rij').count(),1);
  assert.equal(await page.locator('.medewerker-rij [data-link],.medewerker-rij [data-verwijder]').count(),0);
  const id = publicPeople.personen[0].id;
  await page.locator('#functie').fill('Coördinator vrijwilligers');
  await page.locator('#telefoon').fill('');
  await page.locator('#opslaan').click();
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(publicPeople.personen[0].id, id);

  conflict = true;
  await page.locator('#functie').fill('Nog niet opgeslagen');
  await page.locator('#opslaan').click();
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.includes('ondertussen gewijzigd'));
  assert.equal(await page.locator('#functie').inputValue(), 'Nog niet opgeslagen');
  assert.equal(publicPeople.personen[0].functie, 'Coördinator vrijwilligers');
  offline = true;
  await page.locator('#opslaan').click();
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.includes('Geen bevestiging ontvangen'));
  assert.equal(await page.locator('#opslaan').isEnabled(), true, 'failed request always releases save button');
  assert.equal(await page.locator('#functie').inputValue(), 'Nog niet opgeslagen');
  assert.equal(publicPeople.personen[0].functie, 'Coördinator vrijwilligers');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#annuleren').click();

  // Pin, then unpin, using ids; the preview changes only after public confirmation.
  const pin = agenda.events.find(ev => ev.id !== agenda.gekozen_id);
  await page.locator('[data-pin="' + pin.id + '"]').click();
  await page.waitForFunction(() => document.querySelector('#agenda-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(await page.locator('#logo-opslaan').isEnabled(), true, 'publication cannot freeze other controls');
  await page.waitForFunction(() => document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(agenda.gekozen_id, pin.id);
  assert.equal(await page.locator('#agenda .badge').filter({hasText:'Vastgezet'}).count(), 1);
  await page.locator('[data-pin=""]').click();
  await page.waitForFunction(() => document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(agenda.gekozen_id, agenda.events[0].id);

  // Hiding the pinned occurrence removes it from the active list and selection.
  await page.locator('[data-pin="'+pin.id+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  await page.locator('[data-agenda-skip="'+pin.id+'"][data-start="'+pin.start+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(files['data/instellingen.json'].data.vastgezet_id,'');
  assert.equal(await page.locator('#agenda > .agenda-item [data-pin="'+pin.id+'"]').count(),0);
  assert.notEqual(agenda.gekozen_id,pin.id);
  assert.deepEqual(files['data/instellingen.json'].data.agenda_verborgen,[{id:pin.id,start:pin.start,eind:pin.eind}]);
  await page.reload();await page.locator('#agenda-herstel').waitFor();
  await page.locator('#agenda-herstel > summary').click();
  await page.locator('#agenda-herstel [data-agenda-skip="'+pin.id+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  assert.deepEqual(files['data/instellingen.json'].data.agenda_verborgen,[]);
  assert.equal(await page.locator('[data-pin="'+pin.id+'"]').count(),1);

  await page.locator('input[value="groen"]').check();
  assert.equal(await page.locator('#persoon-preview, #preview-wissel').count(), 0, 'person form has no preview or preview controls');
  await page.locator('#logo-opslaan').click();
  await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(agenda.logostijl, 'groen');
  assert.equal(files['data/instellingen.json'].data.vastgezet_id, '');
  await page.screenshot({path:'test-results/beheer-desktop.png',fullPage:true});

  const copy = await context.newPage();
  await copy.goto(base + '?persoon=' + id);
  await copy.locator('.toegang input').fill('test-park-password');
  await copy.locator('.toegang button').click();
  await copy.locator('#kopieer:not([disabled])').waitFor();
  assert.match(await copy.locator('#handtekening').innerText(), /Met vriendelijke groet,[\s\S]*Zoë van het Park[\s\S]*Coördinator/);
  assert.equal(await copy.locator('#handtekening a[href^="tel:"]').count(), 0);
  assert.match(await copy.locator('#handtekening img').first().getAttribute('src'), /woordbeeld-groen/);
  assert.equal(await copy.locator('#andere-kleur').isVisible(), false);
  await copy.locator('#kopieer').click();
  await copy.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Gekopieerd.'));
  const copied = await copy.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType('text/html')).text();
  });
  assert.match(copied, /Met vriendelijke groet/);
  assert.match(copied, /woordbeeld-groen.png/);
  assert.ok(!copied.includes('Baden Powelllaan 2'));
  assert.ok(!copied.includes('3016 GJ Rotterdam'));
  assert.match(copied, /list-manage.com/);
  assert.match(copied, /facebook.com/);
  assert.match(copied, /instagram.com/);
  assert.match(copied, /linkedin.com/);
  assert.match(copied, /width="132"/);
  assert.match(copied, /Het Parkpaviljoen is elke dag open van 10 tot 18 uur\./);
  assert.ok(copied.indexOf('handtekening-mobiel.png') > copied.indexOf('Volg onze'));
  assert.ok(copied.indexOf('www.hetparkinrotterdam.nl') < copied.indexOf('Het Parkpaviljoen'));
  assert.ok(!copied.includes('?v='), 'email images must keep stable URLs');
  await copy.screenshot({path:'test-results/handtekening-desktop.png',fullPage:true});
  await copy.setViewportSize({width:390,height:844});
  await copy.screenshot({path:'test-results/handtekening-mobiel.png',fullPage:true});
  assert.ok(await copy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await copy.locator('#handtekening img').last().evaluate(img => img.decode());
  assert.equal(await copy.locator('#handtekening img').last().evaluate(img => img.naturalWidth), 1260);
  assert.ok(await copy.locator('#handtekening img').last().evaluate(img => Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height - img.naturalWidth / img.naturalHeight) < 0.02), 'banner keeps its proportions at any content height');
  assert.ok(await copy.locator('#handtekening').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'signature itself does not scroll sideways');
  const pavilion = copy.locator('#handtekening td').nth(2);
  assert.equal(await pavilion.evaluate(el => getComputedStyle(el).fontSize), '14px');
  assert.equal(await pavilion.evaluate(el => getComputedStyle(el).whiteSpace), 'normal');
  assert.ok(Math.abs(parseFloat(await pavilion.evaluate(el => getComputedStyle(el).lineHeight)) - 19.6) < 0.1);

  // Global address switch persists, survives reload and reaches copied HTML.
  assert.equal(await page.locator('#toon-adres').isChecked(), false);
  await page.locator('#toon-adres').check();
  assert.equal(await page.locator('#logo-status').innerText(), 'Nog niet opgeslagen.');
  await page.locator('#logo-opslaan').click();
  await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(files['data/instellingen.json'].data.toon_adres, true);
  await copy.reload(); await copy.locator('#kopieer:not([disabled])').waitFor();
  assert.match(await copy.locator('#handtekening').innerText(), /Baden Powelllaan 2/);
  await copy.locator('#kopieer').click();
  const addressHtml = await copy.evaluate(async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text());
  assert.match(addressHtml, /Baden Powelllaan 2/);
  await page.reload(); await page.locator('#beheer').waitFor({state:'visible'});
  assert.equal(await page.locator('#toon-adres').isChecked(), true);
  await page.locator('#toon-adres').uncheck();
  await page.locator('#logo-opslaan').click();
  await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(files['data/instellingen.json'].data.toon_adres, false);
  await copy.reload(); await copy.locator('#kopieer:not([disabled])').waitFor();
  assert.ok(!(await copy.locator('#handtekening').innerText()).includes('Baden Powelllaan'));

  await page.locator('input[value="seizoen"]').check();
  assert.equal(await page.locator('#logo-status').innerText(), 'Nog niet opgeslagen.');
  await page.locator('#logo-opslaan').click();
  await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Gepubliceerd.'));
  await copy.reload(); await copy.locator('#kopieer:not([disabled])').waitFor();
  assert.match(await copy.locator('#handtekening img').first().getAttribute('src'), /woordbeeld-seizoen/);

  await page.locator('input[value="random"]').check();
  await page.locator('#logo-opslaan').click();
  await page.waitForFunction(() => document.querySelector('#logo-status').textContent.startsWith('Gepubliceerd.'));
  await copy.reload(); await copy.locator('#kopieer:not([disabled])').waitFor();
  assert.equal(await copy.locator('#andere-kleur').isVisible(), true);
  const before = await copy.locator('#handtekening img').first().getAttribute('src');
  await copy.locator('#andere-kleur').click();
  assert.notEqual(await copy.locator('#handtekening img').first().getAttribute('src'), before);
  const visibleLogo = new URL(await copy.locator('#handtekening img').first().getAttribute('src')).pathname;
  await copy.locator('#kopieer').click();
  await copy.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Gekopieerd.'));
  assert.equal(new URL(await copy.locator('#handtekening img').first().getAttribute('src')).pathname, visibleLogo, 'copy keeps the displayed logo colour');

  await copy.goto(base);
  await copy.locator('[data-copy="1"]').waitFor();
  assert.equal(await copy.locator('#titel').innerText(), 'Handtekeningen');
  assert.equal(await copy.locator('.eyebrow').count(), 0);
  assert.equal(await copy.locator('#intro').count(), 0);
  assert.equal(await copy.locator('#installeren').getAttribute('open'), '');
  assert.equal(await copy.locator('[data-html="0"]').isVisible(), false);
  assert.equal(await copy.locator('#kaart-0').isVisible(), false);
  assert.equal(await copy.locator('#overzicht .panel').count(), 2);
  assert.equal(await copy.locator('.medewerkers .collega').count(), 1);
  assert.equal(await copy.locator('.extra-opties').count(), 0);
  assert.equal(await copy.locator('.collega').count(), 1);
  assert.equal(await copy.locator('#overzicht [data-copy]').count(), 2);
  assert.equal(await copy.locator('#kaart-1').isVisible(), false);
  assert.equal(await copy.locator('[data-preview="1"]').getAttribute('aria-expanded'), 'false');
  await copy.locator('[data-preview="1"]').click();
  assert.equal(await copy.locator('#kaart-1').isVisible(),true);
  await copy.locator('[data-preview="1"]').click();
  assert.equal(await copy.locator('#detail').isVisible(), false);
  const overviewLogo = new URL(await copy.locator('#kaart-0 img').first().getAttribute('src')).pathname;
  await copy.locator('[data-copy="1"]').click();
  await copy.waitForFunction(() => document.querySelector('#kaart-status-1').textContent.startsWith('Gekopieerd.'));
  const galleryHtml = await copy.evaluate(async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text());
  assert.match(galleryHtml, /Zoë van het Park/);
  assert.ok(galleryHtml.includes(overviewLogo), 'colleague copy uses the same global colour as the general preview');
  assert.equal(await copy.locator('#kaart-1').isVisible(), false);
  await copy.locator('[data-copy="0"]').click();
  await copy.waitForFunction(()=>document.querySelector('#kaart-status-0').textContent.startsWith('Gekopieerd.'));
  assert.match(await copy.evaluate(()=>navigator.clipboard.readText()),/Met vriendelijke groet,[\s\S]*Stichting het Park/);
  assert.equal(await copy.locator('#kaart-0').isVisible(),false,'copy does not leave collapsed preview open');
  await copy.locator('[data-preview="0"]').click();
  await copy.locator('[data-html="0"]').click();
  await copy.waitForFunction(() => document.querySelector('#kaart-status-0').textContent === 'HTML-code gekopieerd.');
  const sourceHtml = await copy.evaluate(() => navigator.clipboard.readText());
  assert.match(sourceHtml, /<table role="presentation"/);
  assert.match(sourceHtml, /handtekening-mobiel.png/);
  assert.ok(!sourceHtml.includes('?v='));
  assert.ok(await copy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the page does not scroll horizontally');
  assert.ok(await copy.locator('.signature-wrap:visible').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), 'none of the previews scroll horizontally');
  assert.equal(await copy.locator('#installeren').isVisible(), true, 'installation help is also available on the overview');
  await copy.locator('#installeren details').filter({hasText:'Apple Mail op iPhone'}).locator('summary').click();
  assert.equal(await copy.getByText('Apple documenteert dit veld als alleen tekst.', {exact:false}).isVisible(), true, 'important limitations remain available in help');
  await copy.locator('#installeren > summary').click();
  for (const width of [320, 375, 390]) {
    await copy.setViewportSize({width,height:844});
    assert.ok(await copy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overview fits ${width}px`);
    assert.ok(await copy.locator('.signature-wrap:visible').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), `all variants fit ${width}px`);
    assert.ok(await copy.locator('.collega').evaluate(el => {
      const name = el.querySelector('[data-preview]').getBoundingClientRect();
      const button = el.querySelector('[data-copy]').getBoundingClientRect();
      return button.left >= name.right;
    }), `copy button stays to the right at ${width}px`);
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `admin fits ${width}px`);
    assert.equal(await page.locator('#persoon-preview').count(), 0, `no person preview at ${width}px`);
  }
  await page.setViewportSize({width:1280,height:1000});
  await copy.screenshot({path:'test-results/overzicht-mobiel.png',fullPage:true});
  for (const variant of ['groen', 'seizoen']) {
    agenda.logostijl = variant;
    await copy.reload(); await copy.locator('[data-copy="1"]').waitFor();
    assert.equal(await copy.locator('#overzicht .panel').count(), 2);
    assert.match(await copy.locator('#kaart-0 img').first().getAttribute('src'), new RegExp('woordbeeld-' + variant));
    await copy.locator('[data-copy="1"]').click();
    await copy.waitForFunction(() => document.querySelector('#kaart-status-1').textContent.startsWith('Gekopieerd.'));
    const colourCopy = await copy.evaluate(async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text());
    assert.match(colourCopy, new RegExp('woordbeeld-' + variant));
  }

  // Multiple colleagues stay together in one card, with dividers only between rows.
  publicPeople.personen.push({id:'test-collega-twee',naam:'Tweede collega',functie:'Medewerker',telefoon:''});
  await copy.reload(); await copy.locator('[data-copy="2"]').waitFor();
  assert.equal(await copy.locator('.medewerkers').count(), 1);
  assert.equal(await copy.locator('.medewerkers .collega').count(), 2);
  assert.equal(await copy.locator('.collega').last().evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
  assert.equal(await copy.locator('.collega').last().locator(':scope > span').nth(0).innerText(),'Medewerker');
  assert.equal(await copy.locator('.collega').last().locator(':scope > span').nth(1).innerText(),'—');
  await copy.locator('[data-copy="2"]').click();
  await copy.waitForFunction(() => document.querySelector('#kaart-status-2').textContent.startsWith('Gekopieerd.'));
  assert.match(await copy.evaluate(() => navigator.clipboard.readText()), /Tweede collega/);
  await copy.setViewportSize({width:1100,height:1000});
  await page.setViewportSize({width:1100,height:1000});
  assert.equal(await copy.locator('.collega').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns),await page.locator('#personenlijst .medewerker-rij').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns),'employee columns match admin exactly');
  for(const card of await copy.locator('#overzicht > .panel').all()){
    assert.ok(await card.evaluate(el=>Math.abs(el.getBoundingClientRect().width-document.querySelector('main').getBoundingClientRect().width)<1),'home cards fill the same content width as admin cards');
  }
  assert.ok(await copy.locator('#kaart-0 table').first().evaluate(el=>el.getBoundingClientRect().width<=420),'signature stays compact inside wide card');
  await copy.screenshot({path:'test-results/overzicht-kaarten-desktop.png',fullPage:true});
  await copy.setViewportSize({width:390,height:844});
  await copy.screenshot({path:'test-results/overzicht-kaarten-mobiel.png',fullPage:true});
  publicPeople.personen.pop();

  // Legacy URL opens the calendar within the same admin screen and session.
  await page.goto(base + 'beheer.html');
  await page.locator('#bloei-velden').waitFor({state:'visible'});
  assert.match(page.url(), /admin\.html#bloeikalender$/);
  assert.equal(await page.locator('h1').innerText(), 'Beheer');
  assert.equal(await page.locator('#login').isVisible(), false);
  assert.equal(await page.locator('a[href="beheer.html"]').count(), 0);
  assert.equal(await page.locator('.brand img').count(), 1);
  // Pinning saves immediately, survives reload and overrides the daily forecast.
  const bloomToggle=page.locator('#bloei-keuzes button').first();
  const bloomIndex=Number(await bloomToggle.getAttribute('data-vast'));
  const bloomText=files['data/bloeikalender.json'].data.entries[bloomIndex].tekst;
  await bloomToggle.click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.vastgezet.id,files['data/bloeikalender.json'].data.entries[bloomIndex].id);
  assert.ok(files['data/bloeikalender.json'].data.vastgezet.tot>='2026-09-16');
  assert.equal(await page.locator('#bloei-keuzes .bloei-planning:visible').count(),1);
  assert.equal(await page.locator('#bloei-keuzes .bloei-planning:visible').innerText(),'Komende 7 dagen');
  assert.equal(await page.locator('#bloeiagenda').count(),0,'planning is merged into the plant list');
  await page.reload();await page.locator('#bloei-velden').waitFor({state:'visible'});
  assert.equal(await page.locator('#bloei-keuzes [data-vast="'+bloomIndex+'"]').innerText(),'Maak los');
  await page.locator('#bloei-keuzes [data-vast="'+bloomIndex+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.vastgezet,undefined);
  const bloomRow=page.locator('#bloei-keuzes [data-keuze="'+bloomIndex+'"]');
  assert.match(await bloomRow.locator('.bloei-periode').innerText(),/^(begin|eind) .+ – (begin|eind) /);
  // Skip this bloom season, remove from active list, persist and allow undo.
  await bloomRow.locator('[data-overslaan]').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.entries[bloomIndex].overslaan_tot,bloeiEinde(files['data/bloeikalender.json'].data.entries[bloomIndex],new Date(2026,8,16)));
  assert.equal(await bloomRow.count(),0);
  assert.ok(!(await page.locator('#bloei-keuzes').innerText()).includes(bloomText));
  await page.reload();await page.locator('#bloei-velden').waitFor({state:'visible'});
  assert.equal(await bloomRow.count(),0);
  await page.locator('#bloei-verborgen > summary').click();
  await page.locator('#bloei-herstel [data-overslaan="'+bloomIndex+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.entries[bloomIndex].overslaan_tot,undefined);
  assert.equal(await bloomRow.locator('[data-vast]').isDisabled(),false);
  // Skipping a pinned plant also releases the pin, without affecting other entries.
  await bloomRow.locator('[data-vast]').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  await bloomRow.locator('[data-overslaan]').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.vastgezet,undefined);
  if(!await page.locator('#bloei-verborgen').evaluate(el=>el.open))await page.locator('#bloei-verborgen > summary').click();
  await page.locator('#bloei-herstel [data-overslaan="'+bloomIndex+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(await page.getByRole('button',{name:'Log uit',exact:true}).count(),1);
  assert.equal(await page.locator('#bloei-opslaan').evaluate(el=>el.parentElement===document.querySelector('#bloei-toevoegen').parentElement),true);
  await page.locator('#bloei-overzicht > summary').click();
  assert.equal(await page.locator('.kalrij').count(), files['data/bloeikalender.json'].data.entries.length);
  assert.match(await page.locator('.kalkop').innerText(), /2026/);
  assert.equal(await page.locator('#bloei-opslaan').isDisabled(), true);
  const calendarCount=files['data/bloeikalender.json'].data.entries.length;
  await page.locator('#bloei-toevoegen').click();
  await page.locator('#bloei-nieuw-tekst').fill('testbloei & rozen');
  await page.locator('#bloei-nieuw-van').selectOption('14');
  await page.locator('#bloei-nieuw-tot').selectOption('20');
  await page.locator('#bloei-nieuw button').click();
  assert.equal(await page.locator('.kalrij').count(), calendarCount+1);
  await page.locator('#herlaad').click();
  assert.equal(await page.locator('[data-veld="tekst"]').inputValue(), 'Testbloei & rozen', 'general reload preserves calendar edits');
  await page.locator('#bloei-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.entries.at(-1).tekst, 'Testbloei & rozen');
  assert.deepEqual(files['data/bloeikalender.json'].data.entries.at(-1).van,[8,1]);
  assert.deepEqual(files['data/bloeikalender.json'].data.entries.at(-1).tot,[11,1]);
  await page.locator('[data-veld="tekst"]').fill('aangepaste bloei');
  await page.locator('[data-veld="tot"]').selectOption('21');
  await page.locator('[data-actie="pauze"]').click();
  await page.locator('#bloei-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.entries.at(-1).tekst,'Aangepaste bloei');
  assert.deepEqual(files['data/bloeikalender.json'].data.entries.at(-1).tot,[11,2]);
  assert.equal(files['data/bloeikalender.json'].data.entries.at(-1).pauze_tot,'2026-11-30');
  await page.locator('[data-actie="hervat"]').click();
  offline=true;
  await page.locator('#bloei-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.includes('Geen bevestiging ontvangen'));
  assert.equal(await page.locator('#bloei-velden').isDisabled(),false);
  assert.equal(await page.locator('[data-veld="tekst"]').inputValue(),'Aangepaste bloei');
  await page.locator('#bloei-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.entries.at(-1).pauze_tot,undefined);
  await page.locator('[data-veld="tekst"]').fill('Niet opgeslagen');
  await page.locator('#bloei-keuzes button').first().click();
  assert.match(await page.locator('#bloei-status').innerText(),/Sla je wijzigingen eerst op/);
  assert.equal(files['data/bloeikalender.json'].data.vastgezet,undefined);
  conflict=true;
  await page.locator('#bloei-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.includes('ondertussen gewijzigd'));
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#uitloggen').click();
  assert.equal(await page.locator('#beheer').isVisible(),true,'calendar edits prevent accidental logout');
  assert.equal(await page.locator('[data-veld="tekst"]').inputValue(),'Niet opgeslagen');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Log uit',exact:true}).click();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('park-toegang')),'open','cancelling lock keeps access');
  assert.ok(await page.evaluate(()=>sessionStorage.getItem('park-beheer-sessie')),'cancelling lock keeps admin session');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#bloei-herlaad').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent==='');
  await page.locator('[data-edit="'+calendarCount+'"]').click();
  assert.equal(await page.locator('[data-veld="tekst"]').inputValue(),'Aangepaste bloei');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-actie="verwijder"]').click();
  await page.locator('#bloei-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#bloei-status').textContent.startsWith('Opgeslagen.'));
  assert.equal(files['data/bloeikalender.json'].data.entries.length,calendarCount);
  await page.screenshot({path:'test-results/beheer-kalender-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'calendar scrolls within its card');
  await page.locator('.kalrij').first().click();
  assert.ok(await page.locator('.bloei-editor:visible').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'calendar form fits mobile');
  await page.screenshot({path:'test-results/beheer-kalender-mobiel.png',fullPage:true});
  await page.setViewportSize({width:1280,height:1000});
  await page.goto(base + 'admin.html');
  await page.locator('#beheer').waitFor({state:'visible'});
  // Shared text editing, failure preservation, publication and all copy paths.
  assert.equal(await page.locator('#algemeen-editor').isVisible(),false);
  await page.locator('#algemeen-bewerken').click();
  assert.equal(await page.locator('[data-algemeen="naam"]').inputValue(),'Stichting het Park');
  await page.locator('[data-algemeen="groet"]').fill('Hartelijke groet,');
  await page.locator('[data-algemeen="naam"]').fill('Stichting het Park Rotterdam');
  await page.locator('[data-algemeen="opening"]').fill('Het Parkpaviljoen: van harte welkom.');
  conflict=true;
  await page.locator('#algemeen-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#algemeen-status').textContent.includes('ondertussen gewijzigd'));
  assert.equal(await page.locator('[data-algemeen="opening"]').inputValue(),'Het Parkpaviljoen: van harte welkom.');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#uitloggen').click();
  assert.equal(await page.locator('#beheer').isVisible(),true);
  await page.locator('#algemeen-opslaan').click();
  await page.waitForFunction(()=>document.querySelector('#algemeen-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(files['data/instellingen.json'].data.algemeen.groet,'Hartelijke groet,');
  await copy.goto(base);await copy.locator('[data-copy="1"]').waitFor();
  for(const n of [0,1]){
    assert.equal(await copy.locator('#kaart-'+n).isVisible(),false);
    await copy.locator('[data-preview="'+n+'"]').click();
    assert.match(await copy.locator('#kaart-'+n).innerText(),/Hartelijke groet,[\s\S]*Het Parkpaviljoen: van harte welkom/);
    await copy.locator('[data-copy="'+n+'"]').click();
    await copy.waitForFunction(n=>document.querySelector('#kaart-status-'+n).textContent.startsWith('Gekopieerd.'),n);
    assert.match(await copy.evaluate(()=>navigator.clipboard.readText()),/Hartelijke groet,[\s\S]*Het Parkpaviljoen: van harte welkom/);
    assert.equal(await copy.locator('#kaart-'+n).isVisible(),true,'an explicitly open preview stays open');
  }
  assert.match(await copy.locator('#kaart-0').innerText(),/Stichting het Park Rotterdam/);
  assert.match(await copy.locator('#kaart-1').innerText(),/Zoë van het Park/);
  await copy.goto(base+'?persoon='+id);await copy.locator('#kopieer:not([disabled])').waitFor();
  assert.match(await copy.locator('#handtekening').innerText(),/Hartelijke groet,[\s\S]*Zoë van het Park/);
  await page.reload();await page.locator('#algemeen-bewerken').click();
  assert.equal(await page.locator('[data-algemeen="opening"]').inputValue(),'Het Parkpaviljoen: van harte welkom.');
  await page.locator('[data-bewerk="' + id + '"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-verwijder="' + id + '"]').click();
  await page.waitForFunction(() => document.querySelector('#personenlijst').textContent.includes('nog geen personen'));
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.startsWith('Gepubliceerd.'));
  await copy.goto(base); await copy.locator('[data-copy="0"]').waitFor();
  assert.equal(await copy.locator('.collega').count(), 0);
  assert.equal(await copy.locator('#overzicht .panel').count(), 1);
  await copy.goto(base + '?persoon=' + id);
  await copy.waitForFunction(() => document.querySelector('#melding').textContent.includes('bestaat niet meer'));
  assert.equal(await copy.locator('#kopieer').isDisabled(), true);
  await page.locator('#uitloggen').click();
  await page.locator('.toegang').waitFor();
  assert.equal(await page.locator('#beheer').isVisible(), false);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('park-beheer-sessie')), null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('park-toegang')), null);
  assert.equal(await page.locator('.shell').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: login, create/edit/delete, optional phone, conflicts, pin/unpin publication, global logo modes, clipboard, mobile, calendar, logout.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
