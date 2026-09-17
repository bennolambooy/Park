export const ALGEMENE_VELDEN = [
  ['groet','Groet','Met vriendelijke groet,',120],
  ['naam','Naam algemene handtekening','Stichting het Park',100],
  ['website_tekst','Website (zichtbare tekst)','www.hetparkinrotterdam.nl',160],
  ['website_url','Website (link)','https://hetparkinrotterdam.nl/',500],
  ['adres1','Straat en huisnummer','Baden Powelllaan 2',160],
  ['adres2','Postcode en plaats','3016 GJ Rotterdam',160],
  ['opening','Tekst Parkpaviljoen','Het Parkpaviljoen is elke dag open van 10 tot 18 uur.',300],
  ['volgen','Tekst vóór de sociale links','Volg onze',120],
  ['nieuwsbrief_url','Nieuwsbrief (link)','https://hetparkinrotterdam.us2.list-manage.com/subscribe?u=fe120296f8b3715025a0f4f7f&id=bdc33ac363',500],
  ['facebook_url','Facebook (link)','https://www.facebook.com/hetparkinrotterdam',500],
  ['instagram_url','Instagram (link)','https://www.instagram.com/hetparkinrotterdam/',500],
  ['linkedin_url','LinkedIn (link)','https://www.linkedin.com/company/het-park-in-rotterdam/',500],
];

export function algemeneTekst(invoer = {}) {
  const resultaat={};
  for(const [key,label,standaard,max] of ALGEMENE_VELDEN){
    const value=invoer?.[key] ?? standaard;
    if(typeof value!=='string' || !value.trim() || value.length>max || /[\x00-\x1f]/.test(value))throw new Error('Vul een geldige waarde in bij '+label+'.');
    resultaat[key]=value.trim();
    if(key.endsWith('_url')){
      let url;try{url=new URL(resultaat[key]);}catch{}
      if(!url || !['http:','https:'].includes(url.protocol) || url.username || url.password)throw new Error('Gebruik een volledige http- of https-link bij '+label+'.');
    }
  }
  return resultaat;
}
