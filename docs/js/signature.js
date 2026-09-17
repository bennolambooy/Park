import {SITE, WEBSITE} from './config.js?v=20260917-11';
import {esc} from './shared.js?v=20260917-11';
import {algemeneTekst} from './general.js?v=20260917-11';

export function valideerPersoon(p) {
  if (!p || !/^[a-zA-Z0-9_-]{8,80}$/.test(p.id)) throw new Error('Ongeldig persoonsprofiel.');
  const result = {id: p.id};
  for (const [key, max, required] of [['naam', 100, true], ['functie', 140, true], ['telefoon', 40, false]]) {
    const value = p[key] ?? '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x1f]/.test(value))
      throw new Error('Vul een geldige ' + key + ' in.');
    result[key] = value.trim();
  }
  if (result.telefoon && !/^[+0-9 ()/.-]+$/.test(result.telefoon)) throw new Error('Vul een geldig telefoonnummer in.');
  return result;
}

export function persoonlijkeLink(id, basis = SITE) {
  const url = new URL(basis);
  url.searchParams.set('persoon', id);
  return url.href;
}

export function kiesLogovariant(stijl = 'random', random = Math.random) {
  return stijl === 'random' ? (random() < 0.5 ? 'groen' : 'seizoen') : stijl;
}

export function handtekening(persoon, {basis = SITE, versie = '', logovariant, toonAdres = false, algemeen} = {}) {
  const p = persoon ? valideerPersoon(persoon) : null;
  const a = algemeneTekst(algemeen);
  const variant = logovariant ?? kiesLogovariant();
  const asset = name => {
    const url = new URL(name, basis);
    if (versie) url.searchParams.set('v', versie);
    return esc(url.href);
  };
  const telefoon = p?.telefoon ? '<br><a href="tel:' + esc(p.telefoon.replace(/[^+0-9]/g, '')) +
    '" style="color:#1d1d1b;text-decoration:none">' + esc(p.telefoon) + '</a>' : '';
  const tekststijl = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;color:#1d1d1b;white-space:normal;word-wrap:break-word;overflow-wrap:break-word';
  const gegevens = '<p style="margin:0 0 16px;' + tekststijl + '">' +
    esc(a.groet)+'<br><br><strong>' + esc(p?.naam || a.naam) + '</strong>' + (p?'<br>'+esc(p.functie)+telefoon:'') + '</p>';
  // Apple Mail freezes declared percentage/table widths when pasting. Plain
  // width-free paragraphs can reflow without making a phone shrink the message.
  const html = gegevens + '<p style="margin:0 0 14px;' + tekststijl + '"><a href="' + esc(a.website_url) + '" style="text-decoration:none">' +
    '<img src="' + asset('woordbeeld-' + variant + '.png') + '" width="132" height="31" alt="het Park" style="display:block;border:0;width:132px;height:31px"></a></p>' +
    '<p style="margin:0 0 18px;' + tekststijl + '">' +
    '<a href="' + esc(a.website_url) + '" style="color:#00752e;text-decoration:underline">'+esc(a.website_tekst)+'</a><br>' +
    (toonAdres ? esc(a.adres1)+'<br>'+esc(a.adres2)+'<br><br>' : '') +
    esc(a.opening)+'<br>'+esc(a.volgen)+' ' +
    '<a href="'+esc(a.nieuwsbrief_url)+'" style="color:#00752e;text-decoration:underline">nieuwsbrief</a>, ' +
    '<a href="'+esc(a.facebook_url)+'" style="color:#00752e;text-decoration:underline">Facebook</a>, ' +
    '<a href="'+esc(a.instagram_url)+'" style="color:#00752e;text-decoration:underline">Instagram</a> en ' +
    '<a href="'+esc(a.linkedin_url)+'" style="color:#00752e;text-decoration:underline">LinkedIn</a>.</p>' +
    // Keep explicit fallback dimensions for Mac Mail, but constrain only the
    // image to its container. The stable 900:120 canvas has the same 420:56 ratio.
    // No percentage-width wrapper: Mail can freeze that wrapper when pasting.
    '<a href="' + WEBSITE + '/agenda" style="text-decoration:none">' +
    '<img src="' + asset('handtekening-mail.png') + '" width="420" height="56" alt="Nu in bloei en in de agenda van het Park — bekijk de actuele agenda" ' +
    'style="display:block;border:0;width:420px;max-width:100%;height:auto"></a>';
  const tekst = [a.groet+'\n\n'+(p ? p.naam + '\n' + p.functie + (p.telefoon ? '\n' + p.telefoon : '') : a.naam),
    'het Park',
    a.website_tekst+'\n' + (toonAdres ? a.adres1+'\n'+a.adres2+'\n\n' : '') +
    a.opening+'\n'+a.volgen+' nieuwsbrief, Facebook, Instagram en LinkedIn.',
    'Nu in bloei en in de agenda: ' + WEBSITE + '/agenda'].filter(Boolean).join('\n\n');
  return {html, tekst};
}
