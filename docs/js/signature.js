import {SITE, WEBSITE} from './config.js?v=20260916-2';
import {esc} from './shared.js?v=20260916-2';

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

export function handtekening(persoon, {basis = SITE, versie = '', logovariant} = {}) {
  const p = persoon ? valideerPersoon(persoon) : null;
  const variant = logovariant ?? kiesLogovariant();
  const asset = name => {
    const url = new URL(name, basis);
    if (versie) url.searchParams.set('v', versie);
    return esc(url.href);
  };
  const telefoon = p?.telefoon ? '<br><a href="tel:' + esc(p.telefoon.replace(/[^+0-9]/g, '')) +
    '" style="color:#1d1d1b;text-decoration:none">' + esc(p.telefoon) + '</a>' : '';
  const gegevens = p ? '<tr><td style="padding:0 0 18px;font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#1d1d1b">' +
    'Met vriendelijke groet,<br><br><strong>' + esc(p.naam) + '</strong><br>' + esc(p.functie) + telefoon + '</td></tr>' : '';
  const html = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:560px"><tbody>' +
    gegevens + '<tr><td style="padding:0 0 18px"><a href="' + WEBSITE + '" style="text-decoration:none">' +
    '<img src="' + asset('woordbeeld-' + variant + '.png') + '" width="180" height="42" alt="het Park" style="display:block;border:0;width:180px;height:42px"></a></td></tr>' +
    '<tr><td style="padding:0"><a href="' + WEBSITE + '/agenda" style="text-decoration:none">' +
    '<img src="' + asset('handtekening.png') + '" width="560" alt="Wat bloeit en gebeurt er nu in het Park? Bekijk de agenda op hetparkinrotterdam.nl" ' +
    'style="display:block;border:0;width:560px;max-width:100%;height:auto"></a></td></tr></tbody></table>';
  const tekst = [p ? ['Met vriendelijke groet,', '', p.naam, p.functie, p.telefoon].filter((s, i) => s || i === 1).join('\n') : '',
    'het Park', WEBSITE, 'Wat bloeit en gebeurt er nu in het Park? ' + WEBSITE + '/agenda'].filter(Boolean).join('\n\n');
  return {html, tekst};
}
