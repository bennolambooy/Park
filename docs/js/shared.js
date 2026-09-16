export const esc = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function dagVanJaar(d) {
  // Local calendar dates converted to UTC eliminate the DST off-by-one error.
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
    Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}

export async function leesPubliek(pad) {
  const url = new URL(pad, location.href);
  url.searchParams.set('v', Date.now());
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error('De gegevens konden niet worden geladen. Probeer opnieuw.');
  return response.json();
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

export async function wachtOpPublicatie(pad, klaar, {pogingen = 40, pauze = 3000} = {}) {
  for (let i = 0; i < pogingen; i++) {
    if (i) await new Promise(resolve => setTimeout(resolve, pauze));
    try {
      const data = await leesPubliek(pad);
      if (klaar(data)) return data;
    } catch { /* A deployment can briefly make a file unavailable. */ }
  }
  return null; // Saved is different from published: do not claim success here.
}
