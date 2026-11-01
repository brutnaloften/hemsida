/**
 * Plain-Swedish one-line explanations of the revenue side (docs/design/budget-explorer.md P0, P3,
 * P11), keyed by ESV code. Shown under the H1 of a typ or huvudgrupp page and next to the avgående
 * poster in the minus strip. Pure: no data imports, so the island can use it.
 */

const EXPLANATIONS: Readonly<Record<string, string>> = {
  // Synthetic and top-level nodes.
  inkomster:
    'Pengarna staten tar in under ett år: skatter, avgifter, utdelningar och bidrag från EU.',
  skatter:
    'Skatter som betalas in via statens skattekonto, minus det som går vidare till kommuner, regioner, pensionssystemet och EU.',

  // Typ (the top level of the revenue classification).
  '1000': 'Skatter som staten tar in, innan det som går vidare till andra dras av.',
  '2000': 'Pengar staten får från sin egen verksamhet: utdelningar, avgifter, böter och ränta.',
  '3000': 'Pengar staten får när den säljer byggnader, mark och annan egendom.',
  '4000': 'Pengar som låntagare betalar tillbaka till staten, till exempel studielån.',
  '5000': 'Poster som staten räknar fram i sin bokföring utan att pengar byter hand.',
  '6000': 'Pengar som staten får tillbaka från EU, till exempel jordbruksstöd.',
  '7000':
    'Poster som läggs till eller dras av skatterna innan de blir statens inkomster: tullmedel och LSS-avgift läggs till, medan momsåterbetalning och public service-avgift dras av.',
  '8000':
    'Stöd och ersättningar som staten betalar ut genom att kreditera mottagarens skattekonto.',

  // Huvudgrupper.
  '1100':
    'Skatt på lön, pension och andra inkomster, främst kommunalskatt och statlig inkomstskatt.',
  '1200': 'Avgifter som arbetsgivare och egenföretagare betalar utöver lönen.',
  '1300': 'Skatt på vinster, utdelningar, räntor och fastigheter.',
  '1400':
    'Skatt som ligger på det vi köper, främst moms, och på varor som alkohol, tobak och bensin.',
  '1500': 'Tullar och andra skatter på varor som förs in i EU.',
  '1600':
    'Restförda skatter som inte betalats i tid, rättelser av skatt som ändrats i efterhand och avgifter som inte hör till någon annan grupp, till exempel public service-avgiften.',
  '1700': 'Tullar och andra skatter på import som går vidare till EU.',
  '1800':
    'Kommunalskatten går vidare till kommuner och regioner, och pensionsavgifterna till AP-fonderna.',
  '1900': 'En justering så att skatterna hamnar på rätt år.',
  '2100': 'Överskott från statliga verk och myndigheter som drivs som affärsverksamhet.',
  '2200': 'Överskott från att staten förvaltar och hyr ut sina fastigheter.',
  '2300': 'Ränta som staten får, till exempel på lån och bankkonton.',
  '2400': 'Utdelning från de företag som staten äger helt eller delvis.',
  '2500':
    'Avgifter som myndigheter tar ut enligt lag, till exempel hos Kronofogdemyndigheten och Transportstyrelsen.',
  '2600': 'Pengar från försäljning av varor och tjänster.',
  '2700': 'Böter, sanktionsavgifter och liknande.',
  '2800': 'Övriga inkomster av statens verksamhet.',
  '3100': 'Pengar från att staten säljer byggnader och maskiner.',
  '3200': 'Pengar från att staten säljer mark.',
  '3300': 'Pengar från försäljning av annan egendom, till exempel aktier.',
  '4100': 'Återbetalning av lån som staten gett till företag.',
  '4300': 'Återbetalning av äldre studielån och studiemedel.',
  '4500': 'Återbetalning av andra lån som staten gett.',
  '5100': 'Beräknade kostnader för slitage på statens egendom, som räknas in som inkomst.',
  '5200': 'Avgifter som staten som arbetsgivare betalar för sina anställdas pensioner.',
  '6100': 'Stöd från EU till jordbruket.',
  '6200': 'Stöd från EU till fiskenäringen.',
  '6300': 'Stöd från EU:s regionala utvecklingsfond till projekt i Sverige.',
  '6400': 'Stöd från EU:s socialfond till arbetsmarknads- och utbildningsinsatser.',
  '6500': 'Stöd från EU till vägar, järnvägar och andra transportnät.',
  '6600': 'Pengar från EU:s återhämtningsfond efter pandemin.',
  '6900': 'Andra bidrag från EU.',
  '7100':
    'Inkomster som räknas till skatterna fast de inte tas in via skattekontot: tullmedel och kommunernas avgift till LSS-utjämningen.',
  '7200':
    'Moms som betalas tillbaka till statliga myndigheter, kommuner och regioner, och intäkter som förs vidare, till exempel public service-avgiften.',
  '8100':
    'Stöd och ersättningar som staten betalar ut genom att kreditera mottagarens skattekonto i stället för att betala ut pengarna direkt.',
};

/** Note at strip level in Skatter, netto: what the avgående poster 1700 and 1800 have in common. */
export const AVGAENDE_NOTE = 'Går vidare till kommuner, regioner, pensionssystemet och EU.';

/** Explanation for a revenue node: a node id ("rev:1100", "rev:skatter", "root:inkomster") or a code. */
export function revenueExplanation(idOrKod: string): string | undefined {
  const key = idOrKod.replace(/^rev:/, '').replace(/^root:/, '');
  return EXPLANATIONS[key];
}
