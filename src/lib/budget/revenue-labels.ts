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
  '7000': 'Justeringar av skatterna, till exempel skatt som tillkommer eller dras av efteråt.',
  '8000': 'Utgifter som betalas ut genom att de dras direkt från skattekontot.',

  // Huvudgrupper.
  '1100':
    'Skatt på lön, pension och andra inkomster, främst kommunalskatt och statlig inkomstskatt.',
  '1200': 'Avgifter som arbetsgivare och egenföretagare betalar utöver lönen.',
  '1300': 'Skatt på vinster, utdelningar, räntor och fastigheter.',
  '1400':
    'Skatt som ligger på det vi köper, främst moms, och på varor som alkohol, tobak och bensin.',
  '1500': 'Tullar och andra skatter på varor som förs in i EU.',
  '1600': 'Skatter som inte passar någon annan grupp, och skatter som betalas i efterhand.',
  '1700': 'Tullar och andra skatter på import som går vidare till EU.',
  '1800': 'Går vidare till kommuner, regioner, pensionssystemet och EU.',
  '1900': 'En justering så att skatterna hamnar på rätt år.',
  '2100': 'Överskott från statliga verk och myndigheter som drivs som affärsverksamhet.',
  '2200': 'Överskott från att staten förvaltar och hyr ut sina fastigheter.',
  '2300': 'Ränta som staten får, till exempel på lån och bankkonton.',
  '2400': 'Utdelning från de företag som staten äger helt eller delvis.',
  '2500': 'Avgifter som myndigheter tar ut enligt lag, till exempel för pass och körkort.',
  '2600': 'Pengar från försäljning av varor och tjänster.',
  '2700': 'Böter, sanktionsavgifter och liknande.',
  '2800': 'Övriga inkomster av statens verksamhet.',
  '3100': 'Pengar från att staten säljer byggnader och maskiner.',
  '3200': 'Pengar från att staten säljer mark.',
  '3300': 'Pengar från försäljning av annan egendom, till exempel aktier.',
  '4100': 'Återbetalning av lån som staten gett till företag.',
  '4300': 'Pengar som tidigare studenter betalar tillbaka på sina studielån.',
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
  '7100': 'Skatt som tillkommer vid avstämning av skattekontot.',
  '7200':
    'Skatt som betalats in men som dras av vid avstämningen av skattekontot, till exempel överskjutande skatt som betalas tillbaka.',
  '8100':
    'Statliga utgifter som betalas ut genom att skattekontot krediteras i stället för att pengarna betalas ut direkt.',
};

/** Explanation for a revenue node: a node id ("rev:1100", "rev:skatter", "root:inkomster") or a code. */
export function revenueExplanation(idOrKod: string): string | undefined {
  const key = idOrKod.replace(/^rev:/, '').replace(/^root:/, '');
  return EXPLANATIONS[key];
}
