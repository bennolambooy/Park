import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium, webkit} from 'playwright';
import {handtekening} from '../docs/js/signature.js';

await mkdir('test-results', {recursive:true});
const python = existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python';
const fixture = spawnSync(python, ['-c', "from genereer import maak_mobiel_png; maak_mobiel_png('Rozen', 'Parkwandeling', '#ca7b00', 'test-results/kort-blok.png', vaste_mailmaat=True); maak_mobiel_png('Rozen en lampenpoetsersgras bij het Parkpaviljoen', 'Een lange wandeling door het Park met een uitgebreide kennismaking met bijzondere bomen · woensdag 30 september, 13:00 uur', '#ca7b00', 'test-results/lang-blok.png', vaste_mailmaat=True)"], {encoding:'utf8'});
assert.equal(fixture.status, 0, fixture.stderr);
const normalImage = await readFile('docs/handtekening-mail.png');
const shortImage = await readFile('test-results/kort-blok.png');
const longImage = await readFile('test-results/lang-blok.png');
const person = {id:'voorbeeld-persoon', naam:'Robin van het Park', functie:'Medewerker', telefoon:'010 123 45 67'};

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({headless:true});
  try {
    const page = await browser.newPage();
    // Reduced reproduction of the received EML: Mail had frozen both 100%
    // wrappers and the text table to 420px, overflowing an iPhone viewport.
    await page.setViewportSize({width:390,height:900});
    await page.setContent('<body style="margin:8px"><div style="width:420px;max-width:420px"><table style="width:420px"><tr><td>Met vriendelijke groet</td></tr></table></div></body>');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),428,'the received-mail regression is reproduced');
    let imageBody = normalImage;
    await page.route('https://signature.test/**', async route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (name === 'handtekening-mail.png') return route.fulfill({contentType:'image/png',body:imageBody});
      assert.match(name, /^woordbeeld-(groen|seizoen)\.png$/);
      return route.fulfill({contentType:'image/png',body:await readFile(resolve('docs', name))});
    });
    for (const width of [320, 375, 390, 900]) {
      await page.setViewportSize({width,height:900});
      for (const long of [false, true]) {
        const profile = long ? {...person, naam:'Een heel lange naam met meerdere achternamen', functie:'Coördinator-' + 'vrijwilligers'.repeat(7)} : person;
        const {html} = handtekening(profile, {basis:'https://signature.test/', versie:`layout-${width}-${long}`, toonAdres:long, logovariant:long ? 'seizoen' : 'groen'});
        // Test actual content separately and use a stable baseline for scaling.
        imageBody = long ? shortImage : normalImage;
        await page.setViewportSize({width:900,height:900});
        // Deliberately use a different surrounding font and line-height, as mail clients do.
        await page.setContent('<body style="margin:10px;font:18px/2 Georgia"><p>Dit is een voorbeeldmail.</p>' + html + '</body>');
        await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
        // Model a desktop-sized inline width after copying. max-width is now
        // 100% on the image itself, not 420px on a containing text block.
        // This is a browser regression test, not an Apple Mail paste guarantee.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('[style]')) {
            if (el.style.width) el.style.width = getComputedStyle(el).width;
            if (el.style.maxWidth) el.style.maxWidth = getComputedStyle(el).maxWidth;
          }
        });
        await page.setViewportSize({width,height:900});
        const check = async () => {
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()} ${width}: no horizontal overflow`);
          assert.equal(await page.locator('table').count(),0);
          const style = await page.locator('p').nth(1).evaluate(el => ({size:getComputedStyle(el).fontSize, line:getComputedStyle(el).lineHeight}));
          assert.equal(style.size, '14px');
          assert.ok(Math.abs(parseFloat(style.line) - 19.6) < 0.1);
          const dimensions = await page.locator('img').last().evaluate(img => ({w:img.width,h:img.height,nw:img.naturalWidth,nh:img.naturalHeight}));
          assert.equal(dimensions.nw, 900);
          assert.equal(dimensions.nh, 120);
          assert.equal(dimensions.w, Math.min(420,width-20), 'only the image scales to the available message width');
          assert.equal(await page.locator('img').last().getAttribute('height'),'56','explicit fallback height is retained for Mac Mail');
          assert.ok(Math.abs(dimensions.h - dimensions.nh * dimensions.w / dimensions.nw) <= 1, 'height follows current image contents without distortion');
          return dimensions.h;
        };
        const before = await check();
        assert.equal(await page.locator('img').last().evaluate(img=>img.closest('table')), null, 'image is outside the text table');
        const textBefore = await page.locator('p').nth(1).boundingBox();
        if (long) {
          // Only the contents shrink; the fixed canvas and ordinary text stay unchanged.
          imageBody = longImage;
          await page.locator('img').last().evaluate(img => { img.src += '?new-content'; });
          await page.locator('img').last().evaluate(img => img.decode());
          assert.equal(await check(), before, 'long lines stay inside the same fixed canvas');
          const textAfter = await page.locator('p').nth(1).boundingBox();
          assert.deepEqual(textAfter, textBefore, 'image changes never resize or reposition the text section');
        }
        await page.screenshot({path:`test-results/mail-${engine.name()}-${width}-${long ? 'lang' : 'normaal'}.png`,fullPage:true});
        await page.setViewportSize({width:900,height:900});
        assert.equal(await page.locator('img').last().evaluate(img=>img.width),420,'image returns to desktop width after resize');
        assert.equal(await page.locator('p').nth(1).evaluate(el=>getComputedStyle(el).fontSize),'14px');
      }
    }
    // With images unavailable, identity, phone, website and social links remain real usable text.
    await page.route('https://signature.test/**', route => route.abort());
    await page.setContent(handtekening(person, {basis:'https://signature.test/'}).html);
    assert.match(await page.locator('body').innerText(), /Robin van het Park/);
    assert.equal(await page.locator('a[href^="tel:"]').count(), 1);
    assert.equal(await page.locator('a[href*="linkedin.com"]').count(), 1);
    assert.match(await page.locator('img').last().getAttribute('alt'), /actuele agenda/);
    console.log(`PASS ${engine.name()}: 320/375/390/900px, long profiles, width-free text, fixed image canvas, blocked images.`);
  } finally { await browser.close(); }
}
