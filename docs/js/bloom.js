import {dagVanJaar} from './shared.js?v=20260917-7';

export function bloeiTekst(tekst) {
  const t=tekst.trim();
  return /^ij/i.test(t) ? 'IJ'+t.slice(2) : t.charAt(0).toLocaleUpperCase('nl-NL')+t.slice(1);
}

export function bloeiEinde(entry, d) {
  const [maand,helft]=entry.tot;
  const einde=(maand-1)*2+helft-1, nu=d.getMonth()*2+(d.getDate()>15?1:0);
  const jaar=d.getFullYear()+(einde<nu?1:0);
  return jaar+'-'+String(maand).padStart(2,'0')+'-'+String(helft===1?15:new Date(jaar,maand,0).getDate()).padStart(2,'0');
}

export function keuzeOpDag(entries, d, vastgezet = null) {
  const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const idx = d.getMonth()*2 + (d.getDate() > 15 ? 1 : 0);
  const actief = entries.filter(e => {
    const van = (e.van[0]-1)*2 + e.van[1]-1, tot = (e.tot[0]-1)*2 + e.tot[1]-1;
    return (van <= tot ? idx >= van && idx <= tot : idx >= van || idx <= tot) && !(e.pauze_tot && e.pauze_tot >= iso) && !(e.overslaan_tot && e.overslaan_tot >= iso);
  });
  const pool = actief.sort((a,b) => a.prio-b.prio || (a.tekst < b.tekst ? -1 : a.tekst > b.tekst ? 1 : 0));
  const vast = vastgezet?.id && vastgezet.tot >= iso ? pool.find(e => e.id === vastgezet.id) : null;
  if (vast) return vast;
  return pool.length ? pool[dagVanJaar(d) % pool.length] : null;
}
