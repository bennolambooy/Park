import {REPO, BRANCH, GEHEIM} from './config.js?v=20260916-5';
import {verzoek} from './shared.js?v=20260916-5';

const KEY = 'park-beheer-sessie';
export class GitHubFout extends Error {
  constructor(status) {
    const bericht = status === 409 || status === 422
      ? 'Iemand heeft deze gegevens ondertussen gewijzigd. Je invoer is bewaard. Herlaad de lijst en controleer je wijziging.'
      : status === 401 || status === 403
      ? 'Je beheersessie kan niet opslaan. Log opnieuw in of laat de beheerder de toegang controleren.'
      : 'Opslaan of laden is niet gelukt (' + status + '). Je invoer is bewaard; probeer opnieuw.';
    super(bericht);
    this.status = status;
  }
}

export const isIngelogd = () => Boolean(sessionStorage.getItem(KEY));
export function uitloggen() {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem('parksleutel');
}

async function ontgrendel(wachtwoord) {
  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const basis = await crypto.subtle.importKey('raw', new TextEncoder().encode(wachtwoord), 'PBKDF2', false, ['deriveKey']);
  const sleutel = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: bytes(GEHEIM.zout), iterations: 300000, hash: 'SHA-256'},
    basis, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes(GEHEIM.iv)}, sleutel, bytes(GEHEIM.blob)));
}

export async function controleerToegang(wachtwoord) {
  try { await ontgrendel(wachtwoord); }
  catch { throw new Error('Het wachtwoord klopt niet. Probeer opnieuw.'); }
  // Only the gate marker is kept. This does not start an administrator session.
  sessionStorage.setItem('park-toegang', 'open');
}

export async function inloggen(wachtwoord) {
  let token;
  try { token = await ontgrendel(wachtwoord); }
  catch { throw new Error('Het wachtwoord klopt niet. Controleer de hoofdletters en probeer opnieuw.'); }
  // Validate the credential against GitHub before enabling administrator actions.
  const {response} = await verzoek('https://api.github.com/repos/' + REPO, {
    headers: {Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token},
    cache: 'no-store',
  });
  if (!response.ok) throw new GitHubFout(response.status);
  sessionStorage.setItem(KEY, token);
  localStorage.removeItem('parksleutel');
}

function headers() {
  const token = sessionStorage.getItem(KEY);
  if (!token) throw new Error('Log eerst in als beheerder.');
  return {Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'};
}

const urlVoor = pad => 'https://api.github.com/repos/' + REPO + '/contents/' +
  pad.split('/').map(encodeURIComponent).join('/');
const decode = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));
function encode(s) {
  let resultaat = '';
  for (const b of new TextEncoder().encode(s)) resultaat += String.fromCharCode(b);
  return btoa(resultaat);
}

export async function leesBestand(pad) {
  const {response, data:bestand} = await verzoek(urlVoor(pad) + '?ref=' + encodeURIComponent(BRANCH), {headers: headers(), cache: 'no-store'});
  if (!response.ok) throw new GitHubFout(response.status);
  return {data: JSON.parse(decode(bestand.content)), sha: bestand.sha};
}

export async function schrijfBestand(pad, data, sha, message) {
  const {response, data:resultaat} = await verzoek(urlVoor(pad), {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({message, branch: BRANCH, sha, content: encode(JSON.stringify(data, null, 2) + '\n')}),
  });
  if (!response.ok) throw new GitHubFout(response.status);
  return resultaat.content.sha;
}
