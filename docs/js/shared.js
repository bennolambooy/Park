export const esc = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export async function verzoek(url, opties = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {...opties, signal: controller.signal});
    const data = await response.json();
    return {response, data};
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) {
      throw new Error(opties.method === 'PUT'
        ? 'Geen bevestiging ontvangen. Je invoer blijft staan. Herlaad de lijst om te controleren of je wijziging is opgeslagen.'
        : 'De verbinding reageert niet. Probeer opnieuw; je invoer blijft staan.');
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export function dagVanJaar(d) {
  // Local calendar dates converted to UTC eliminate the DST off-by-one error.
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
    Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}

export async function leesPubliek(pad) {
  const url = new URL(pad, location.href);
  url.searchParams.set('v', Date.now());
  const {response, data} = await verzoek(url, {cache: 'no-store'}, 8000);
  if (!response.ok) throw new Error('De gegevens konden niet worden geladen. Probeer opnieuw.');
  return data;
}

export async function kopieer(html, tekst, element) {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], {type: 'text/html'}),
      'text/plain': new Blob([tekst], {type: 'text/plain'}),
    })]);
    return 'Gekopieerd. Plak je handtekening nu in je e-mailinstellingen.';
  } catch {
    // Keep rich HTML on browsers without ClipboardItem or clipboard permission.
    const selectie = window.getSelection();
    const bereik = document.createRange();
    bereik.selectNodeContents(element);
    selectie.removeAllRanges();
    selectie.addRange(bereik);
    let gelukt = false;
    try { gelukt = document.execCommand('copy'); } catch {}
    if (gelukt) {
      selectie.removeAllRanges();
      return 'Gekopieerd. Plak je handtekening nu in je e-mailinstellingen.';
    }
    return 'De handtekening is geselecteerd. Druk op ⌘C (Mac) of Ctrl+C (Windows).';
  }
}

export async function wachtOpPublicatie(pad, klaar, {pogingen = 40, pauze = 3000, isActueel = () => true} = {}) {
  const deadline = Date.now() + 120000;
  for (let i = 0; i < pogingen; i++) {
    if (!isActueel() || Date.now() >= deadline) return null;
    if (i) await new Promise(resolve => setTimeout(resolve, pauze));
    try {
      const data = await leesPubliek(pad);
      if (klaar(data)) return data;
    } catch { /* A deployment can briefly make a file unavailable. */ }
  }
  return null; // Saved is different from published: do not claim success here.
}
