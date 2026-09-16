import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createServer} from 'node:http';
import {webcrypto} from 'node:crypto';
import {chromium} from 'playwright';

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
    agenda = {...agenda, ...settingsPending, gekozen_id:settingsPending.vastgezet_id || agenda.events[0].id, versie:'test-version-' + writes};
    settingsPending = null;
  }
  await route.fulfill({json:agenda});
});

try {
  const page = await context.newPage();
  await page.goto(base + 'admin.html');
  assert.equal(await page.locator('.shell').isVisible(), false);
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
  assert.equal(await page.locator('#wachtwoord').inputValue(), '');
  assert.equal(await page.evaluate(() => localStorage.getItem('parksleutel')), null);
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
  assert.ok(!(await page.locator('#banner').getAttribute('src')).includes('test-version'));
  await page.waitForFunction(() => document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(agenda.gekozen_id, pin.id);
  assert.match(await page.locator('#banner').getAttribute('src'), /test-version/);
  await page.locator('[data-pin=""]').click();
  await page.waitForFunction(() => document.querySelector('#agenda-status').textContent.startsWith('Gepubliceerd.'));
  assert.equal(agenda.gekozen_id, agenda.events[0].id);

  await page.locator('input[value="groen"]').check();
  assert.match(await page.locator('#persoon-preview img').first().getAttribute('src'), /woordbeeld-groen/);
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
  assert.equal(await copy.locator('#handtekening img').last().evaluate(img => img.naturalWidth), 600);
  assert.ok(await copy.locator('#handtekening img').last().evaluate(img => Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height - img.naturalWidth / img.naturalHeight) < 0.02), 'banner keeps its proportions at any content height');
  assert.ok(await copy.locator('#handtekening').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'signature itself does not scroll sideways');
  const pavilion = copy.locator('#handtekening td').nth(2);
  assert.equal(await pavilion.evaluate(el => getComputedStyle(el).fontSize), '12px');
  assert.equal(await pavilion.evaluate(el => getComputedStyle(el).whiteSpace), 'normal');
  assert.equal(await pavilion.evaluate(el => getComputedStyle(el).lineHeight), 'normal');

  // Global address switch previews, persists, survives reload and reaches copied HTML.
  assert.equal(await page.locator('#toon-adres').isChecked(), false);
  await page.locator('#toon-adres').check();
  assert.match(await page.locator('#persoon-preview').innerText(), /Baden Powelllaan 2/);
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
  assert.match(await page.locator('#persoon-preview img').first().getAttribute('src'), /woordbeeld-seizoen/);
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
  await copy.locator('[data-copy="3"]').waitFor();
  assert.equal(await copy.locator('#overzicht .panel').count(), 4);
  assert.equal(await copy.locator('#detail').isVisible(), false);
  await copy.locator('[data-copy="2"]').click();
  await copy.waitForFunction(() => document.querySelector('#kaart-status-2').textContent.startsWith('Gekopieerd.'));
  const galleryHtml = await copy.evaluate(async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text());
  assert.match(galleryHtml, /Zoë van het Park/);
  const downloadPromise = copy.waitForEvent('download');
  await copy.locator('[data-download="2"]').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.html$/);
  const downloadedHtml = await readFile(await download.path(), 'utf8');
  assert.match(downloadedHtml, /name="viewport"/);
  assert.match(downloadedHtml, /handtekening-mobiel.png/);
  assert.ok(!downloadedHtml.includes('?v='));
  assert.ok(await copy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the page does not scroll horizontally');
  assert.ok(await copy.locator('.signature-wrap:visible').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), 'none of the previews scroll horizontally');
  assert.equal(await copy.locator('#installeren').isVisible(), true, 'installation help is also available on the overview');
  for (const width of [320, 375, 390]) {
    await copy.setViewportSize({width,height:844});
    assert.ok(await copy.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overview fits ${width}px`);
    assert.ok(await copy.locator('.signature-wrap:visible').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), `all variants fit ${width}px`);
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `admin fits ${width}px`);
    assert.ok(await page.locator('#persoon-preview').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `admin signature fits ${width}px`);
  }
  await page.setViewportSize({width:1280,height:1000});
  await copy.screenshot({path:'test-results/overzicht-mobiel.png',fullPage:true});

  // The same session opens the calendar, including its shared auth and DST-safe preview.
  await page.goto(base + 'beheer.html');
  await page.locator('#kalender-inhoud').waitFor({state:'visible'});
  assert.equal(await page.locator('.brand img').count(), 1);
  await page.screenshot({path:'test-results/bloeikalender-desktop.png',fullPage:true});
  assert.match(await page.locator('.kallabel').first().innerText(), /^\d{4} →$/);
  await page.goto(base + 'admin.html');
  await page.locator('#beheer').waitFor({state:'visible'});
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-verwijder="' + id + '"]').click();
  await page.waitForFunction(() => document.querySelector('#personenlijst').textContent.includes('nog geen personen'));
  await page.waitForFunction(() => document.querySelector('#persoon-status').textContent.startsWith('Gepubliceerd.'));
  await copy.goto(base + '?persoon=' + id);
  await copy.waitForFunction(() => document.querySelector('#melding').textContent.includes('bestaat niet meer'));
  assert.equal(await copy.locator('#kopieer').isDisabled(), true);
  await page.locator('#uitloggen').click();
  assert.equal(await page.locator('#beheer').isVisible(), false);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('park-beheer-sessie')), null);
  await page.getByRole('button', {name:'Vergrendelen', exact:true}).click();
  await page.locator('.toegang').waitFor();
  assert.equal(await page.locator('.shell').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: login, create/edit/delete, optional phone, conflicts, pin/unpin publication, global logo modes, clipboard, mobile, calendar, logout.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
