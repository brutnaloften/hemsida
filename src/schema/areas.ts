/**
 * Controlled vocabulary for a promise's `area`. Roughly aligned with the Riksdag
 * committees (utskott) but written for readers: several committees can share an
 * area and an area can span committees. Kept term-independent so the 2026-2030
 * term reuses it; extend deliberately (and update tools/area-mapping.json) rather
 * than letting free text creep back in.
 */
export const AREAS = [
  'Kriminalpolitik',
  'Rättsstat och demokrati',
  'Migration och integration',
  'Arbetsmarknad',
  'Ekonomi och skatter',
  'Socialförsäkring och pensioner',
  'Hälso- och sjukvård',
  'Omsorg och socialtjänst',
  'Familj och jämställdhet',
  'Skola och utbildning',
  'Energi',
  'Klimat och miljö',
  'Jordbruk, skog och djur',
  'Landsbygd och regional utveckling',
  'Bostäder och samhällsbyggnad',
  'Infrastruktur och transporter',
  'Näringsliv och företagande',
  'Försvar och krisberedskap',
  'Utrikes, bistånd och EU',
  'Kultur, medier och idrott',
] as const;

export type Area = (typeof AREAS)[number];
