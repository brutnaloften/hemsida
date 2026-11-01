/**
 * Plain-Swedish one-line explanations of the revenue side (docs/design/budget-explorer.md P0, P3,
 * P11), keyed by ESV code. Shown under the H1 of a typ or huvudgrupp page and next to the avgående
 * poster in the minus strip. Pure: no data imports, so the island can use it.
 *
 * Policy: conservative. Every text restates only what the committed titles and amounts in
 * src/data/budget/revenue.json show (titelgrupp and titel names, signs, sizes). No mechanisms,
 * destinations or causes beyond what the titles say. Official ESV / regeringen / Skatteverket
 * descriptions were not consulted when this was written, so nothing here is cited from them.
 */

const EXPLANATIONS: Readonly<Record<string, string>> = {
  // Synthetic and top-level nodes.
  inkomster:
    'Statens inkomster delas in efter vad pengarna kommer från: skatter, statens egen verksamhet, försåld egendom, återbetalda lån, kalkylmässiga poster och bidrag från EU.',
  skatter:
    'Skatterna efter avdrag: kommunala skatter och avgifter till AP-fonderna, EU-skatter, momsåterbetalningar och periodiseringar räknas bort från de skatter som tas in.',

  // Typ (the top level of the revenue classification).
  '1000':
    'Skatter och avgifter, indelade i skatt på arbete, kapital, konsumtion och import, avgående poster och periodiseringar.',
  '2000':
    'Inkomster från statens verksamhet: överskott, ränta, aktier, avgifter, böter och försäljning.',
  '3000': 'Inkomster från försålda byggnader, maskiner, mark och annan egendom.',
  '4000': 'Återbetalning av lån: näringslån, studielån och övriga lån.',
  '5000': 'Kalkylmässiga inkomster: avskrivningar och amorteringar samt statliga pensionsavgifter.',
  '6000':
    'Bidrag från EU, bland annat jordbruksfonder, fiske, regional utveckling, socialfond och återhämtningsfonden.',
  '7000':
    'Justeringar av skatterna: tillkommande skatter (tullmedel och LSS-avgift) och avräkningar (moms, public service-avgift och intäkter som förs till fonder).',
  '8000': 'Utgifter som redovisas som krediteringar på skattekonto (huvudgrupp 8100).',

  // Huvudgrupper.
  '1100':
    'Skatt på arbete: inkomstskatter, allmän pensionsavgift och artistskatt, minus skattereduktioner.',
  '1200':
    'Arbetsgivaravgifter och egenavgifter, till exempel sjukförsäkringsavgift och ålderspensionsavgift.',
  '1300':
    'Skatt på kapital: kapital och företagsvinster, kupongskatt, avkastningsskatt, fastighetsskatt, stämpelskatt och riskskatt för kreditinstitut.',
  '1400':
    'Skatt på konsumtion och insatsvaror: moms, tobak, alkohol, energi, koldioxid, fordon och spel.',
  '1500': 'Tullmedel och sockeravgifter.',
  '1600':
    'Restförda skatter (ett avdrag), omprövningar, anstånd, skattetillägg och förseningsavgifter, samt avgifter som insättningsgaranti, resolution och public service.',
  '1700': 'EU-skatter som dras av från skatterna.',
  '1800': 'Kommunala skatter och avgifter till AP-fonderna som dras av från skatterna.',
  '1900':
    'Periodiseringar: justeringar av skatterna, till exempel uppbördsförskjutningar och anstånd.',
  '2100': 'Inlevererade överskott från affärsverk, övriga myndigheter och Riksbanken.',
  '2200': 'Inlevererat överskott av statens fastighetsförvaltning.',
  '2300': 'Ränteinkomster, bland annat räntor på skattekonton och på studielån.',
  '2400': 'Inkomster av statens aktier.',
  '2500':
    'Offentligrättsliga avgifter, till exempel expeditions- och ansökningsavgifter och avgifter vid Kronofogdemyndigheten och Transportstyrelsen.',
  '2600': 'Försäljningsinkomster, bland annat uppbörd av felparkeringsavgifter.',
  '2700': 'Böter, sanktionsavgifter, restavgifter och dröjsmålsavgifter.',
  '2800': 'Övriga inkomster av statens verksamhet.',
  '3100': 'Inkomster från Fortifikationsverkets försäljning av fastigheter.',
  '3200': 'Övriga inkomster av markförsäljning.',
  '3300': 'Inkomster av statens gruvegendom och övrig försåld egendom.',
  '4100': 'Återbetalning av näringslån och av tidigare infriade statliga garantier.',
  '4300': 'Återbetalning av universitetsstudielån, allmänna studielån och studiemedel.',
  '4500': 'Återbetalning av övriga lån, bland annat lån för svenska FN-styrkor.',
  '5100': 'Amortering på statskapital och uppdragsmyndigheters komplementkostnader.',
  '5200': 'Statliga pensionsavgifter, en kalkylmässig inkomst.',
  '6100': 'Bidrag från EU:s jordbruksfonder, bland annat gårdsstöd och landsbygdsutveckling.',
  '6200': 'Bidrag från EU till fiskenäringen.',
  '6300': 'Bidrag från Europeiska regionala utvecklingsfonden.',
  '6400': 'Bidrag från Europeiska socialfonden.',
  '6500': 'Bidrag till transeuropeiska nätverk.',
  '6600': 'Bidrag från Europeiska faciliteten för återhämtning och resiliens.',
  '6900': 'Övriga bidrag från EU.',
  '7100':
    'Tullmedel och utjämningsavgift för LSS-kostnader. Tullmedel redovisas i tre steg: som skatt på import (1500), som avgående EU-skatt (1700) och här (7112). De tre raderna läggs ihop i Skatter, netto.',
  '7200':
    'Avräknad moms för statliga myndigheter, momskompensation till kommuner och regioner, avgifter till public service och intäkter som förs till fonder.',
  '8100':
    'Stöd som anställningsstöd, nystartsjobb och korttidsarbete, redovisade som krediteringar på skattekonto.',
};

/** Heading of the avgående poster 1700 and 1800 in the minus strip (P0). Not for other items. */
export const AVGAENDE_NOTE = 'Går vidare till kommuner, regioner, pensionssystemet och EU.';

/** Explanation for a revenue node: a node id ("rev:1100", "rev:skatter", "root:inkomster") or a code. */
export function revenueExplanation(idOrKod: string): string | undefined {
  const key = idOrKod.replace(/^rev:/, '').replace(/^root:/, '');
  return EXPLANATIONS[key];
}
