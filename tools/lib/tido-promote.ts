/**
 * Promotion of reviewed Tidöavtalet candidates to promise files (bead hemsida-bvb.4).
 *
 * Pure transformation: candidates in, promises plus an audit map out. All editorial calls (id
 * fixes, title fixes, merges) are the tables below, so the review is a diff of this file and of
 * docs/tido-promotion-map.md. Verdicts are never invented: promises stay `unassessed`, except
 * candidates typed `vague`, which become `not_assessable` with a stated reason.
 */

import { promiseSchema, type PromiseRecord } from './schema.ts';

export interface Candidate {
  chunk?: string;
  ministry?: string;
  promise: PromiseRecord;
}

/** Ids of candidates whose id was truncated mid-word or misspelled; the new id is permanent. */
export const ID_RENAMES: Readonly<Record<string, string>> = {
  'tido-ta-bort-straffreduktion-over-18-och-utred-straffmyndighetsal':
    'tido-ta-bort-straffreduktion-18-20-utred-straffrabatt-under-18',
  'tido-tilllaggsuppdrag-vindkraft-ersattning-kommuner':
    'tido-tillaggsuppdrag-vindkraft-ersattning-kommuner',
  'tido-obligatorisk-hakning-ett-ar': 'tido-obligatorisk-haktning-ett-ar',
  'tido-lobok-per-elev-och-amne': 'tido-larobok-per-elev-och-amne',
};

/** Obvious wording errors fixed without changing meaning, keyed by candidate id. */
export const TEXT_FIXES: Readonly<
  Record<string, { title?: string; description?: string; reason: string }>
> = {
  'tido-statligt-ansvar-personlig-assistans': {
    title: 'Åtgärder för statligt ansvar för personlig assistans',
    reason:
      'Title said "mot statligt ansvar" (against); the description and source say measures towards a state responsibility.',
  },
};

export interface MergeSpec {
  /** Candidate that survives; its id, source page and quote are kept. */
  primary: string;
  /** Candidates folded into the primary. */
  absorbed: string[];
  title?: string;
  /** Replacement description combining the wording of every merged candidate. */
  description: string;
  reason: string;
}

export const MERGES: readonly MergeSpec[] = [
  {
    primary: 'tido-foraldrastodsprogram-alla-kommuner-fritidskort',
    absorbed: ['tido-fritidskort-minska-barns-utsatthet'],
    description:
      'Satsningen på föräldrastödsprogram byggs ut med målet att det ska finnas i alla kommuner, och satsningen på fritidskort genomförs. Åtgärder för att minska barns utsatthet tas fram, bland annat genom att värna barns fritidsaktiviteter med ett fritidskort.',
    reason:
      'Fritidskort is promised in both the crime section (p23) and the household section (p60).',
  },
  {
    primary: 'tido-karnkraft-kreditgarantier-400-miljarder',
    absorbed: ['tido-kreditgarantier-grona-oversyn-nybyggnation-karnkraft'],
    description:
      'Förutsättningarna för investeringar i ny kärnkraft stärks genom särskilda statliga kreditgarantier på 400 miljarder kronor med mer generösa villkor än dagens system. Avgränsningarna i dagens system med gröna kreditgarantier ses över så att kreditgarantierna kan användas även för nybyggnation av kärnkraft.',
    reason: 'The green-guarantee review is the legal prerequisite of the same guarantee mechanism.',
  },
  {
    primary: 'tido-kortare-tillstandsprocess-snabbspar-karnkraft',
    absorbed: ['tido-sank-ansokningsavgift-karnkraft-typgodkannande'],
    title: 'Kortare tillståndsprocess, lägre ansökningsavgift och typgodkännande för ny kärnkraft',
    description:
      'En regel i miljöbalken införs om att endast en myndighet får vara part i ett tillståndsärende, tillsammans med ett snabbspår för ny kärnkraft. Strålsäkerhetsmyndigheten får uppdraget att föreslå hur tillståndsprocessen kan kortas kraftigt. Den höga ansökningsavgiften för nya reaktorer ses över för att kraftigt sättas ned, vid behov skjuts mer medel till mark- och miljödomstolarna, och ett snabbspår för att acceptera typgodkännande av reaktorer från jämförbara länder tas fram.',
    reason: 'Two bullets under one heading, both about speeding up permitting of new reactors.',
  },
  {
    primary: 'tido-sankt-etableringsstod',
    absorbed: ['tido-avskaffa-kompletterande-forsorjningsstod-etableringsersattni'],
    description:
      'Etableringsersättningen ses över och ska vara lägre än de offentliga stöd som kan komma i fråga för personer som bott länge i Sverige, etableringstillägget avskaffas, och rätten till kompletterande försörjningsstöd för nyanlända som har rätt till etableringsersättning avskaffas. Full ersättning kräver aktivt deltagande i SFI och heltidsaktiviteter.',
    reason: 'Both abolish kompletterande försörjningsstöd for people on etableringsersättning.',
  },
  {
    primary: 'tido-asylregler-miniminivan-eu-ratten',
    absorbed: [
      'tido-asylregler-miniminivan-proposition-2026',
      'tido-begransa-familjeaterforening-anhoriginvandring-eu-miniminiva',
    ],
    description:
      'Sveriges lagstiftning för asylmottagande och anknytande regelverk anpassas så att den inte är mer generös än EU-rätten kräver. En utredning tar fram förslag på författningsändringar som så långt rättsligt möjligt begränsar asylsökandes rättigheter, bland annat skärpta bevisregler och rättigheter under asylprocessen. Rätten till familjeåterförening och anhöriginvandring ska inte vara mer långtgående eller generös än vad EU-rätten föreskriver som miniminivå. Övriga förslag genomförs genom proposition till riksdagen senast våren 2026.',
    reason:
      'One umbrella commitment (p35-36); the 2026 proposition deadline and the family-reunification limit are parts of it. Time-limited permits and the conversion inquiry stay separate.',
  },
  {
    primary: 'tido-biometri-utlanningsarenden-dna',
    absorbed: ['tido-biometriska-register-delning-myndigheter'],
    description:
      'Tilläggsdirektiv ges till utredningen Ju 2022:12 så att biometriska uppgifter, bland annat DNA, om tredjelandsmedborgare som ansöker om uppehållstillstånd i högre utsträckning samlas in och sparas i sökbara register, och åldersgränsen för inhämtning sänks. Utredningen ska också föreslå författningsändringar så att biometriska register om utlänningar kan användas och delas mellan myndigheter i större utsträckning, och att fingeravtryck och bild kan kontrolleras vid kontakt med myndigheter mot identitetshandlingar eller en central databas.',
    reason: 'Both are points of the same supplementary directive Ju 2022:12.',
  },
  {
    primary: 'tido-genomfor-sou-2021-92-granskontroller',
    absorbed: ['tido-promemoria-granskontroller-irreguljar-migration'],
    title: 'Genomför SOU 2021:92 och lägg fram proposition om gränskontroller',
    description:
      'Förslag i SOU 2021:92 om effektivare bevakning och inre utlänningskontroller i gränsområden genomförs. En departementspromemoria tas fram om hur gränskontroller kan användas mer för att bekämpa irreguljär migration, med förslag om att regeringen ska kunna återinföra identitetskontroller vid buss-, tåg- och passagerarfartygstransporter. En proposition om gränskontroller och transportöransvar genomförs under 2023.',
    reason:
      'Two numbered measures under one heading that lead to the same border-control legislation.',
  },
  {
    primary: 'tido-oversyn-regelverk-inre-utlanningskontroller',
    absorbed: ['tido-utokade-befogenheter-polisen-inre-utlanningskontroll'],
    description:
      'En breddad översyn görs av regelverket för inre utlänningskontroller för att effektivare upptäcka personer som vistas illegalt i Sverige, inklusive grunderna för kontrollerna, förstärkta möjligheter att omhänderta digitala media, kroppsvisitera och undersöka bagage samt utreda DNA-prov. Författningsändringar utreds även om utökade befogenheter för Polismyndigheten att omhänderta personer som inte kan göra sin identitet och tillståndsenliga vistelse sannolik i avvaktan på utredning, och arbetet med inre utlänningskontroller integreras i polisens löpande verksamhet.',
    reason: 'Sub-point of the same review of the rules for internal immigration checks.',
  },
  {
    primary: 'tido-utredning-foraldraansvar',
    absorbed: ['tido-ekonomiska-konsekvenser-foraldrar-skadestand'],
    description:
      'En utredning ser över olika möjligheter att förstärka föräldraansvaret och möjliggöra tidiga insatser för barn som begår brott eller är i riskzonen. Andra sätt att påverka föräldrar genom ekonomiska och sociala konsekvenser prövas, till exempel ändrad skadeståndsskyldighet för vårdnadshavare.',
    reason: 'Both are inquiry items on parental responsibility (p23-24).',
  },
  {
    primary: 'tido-obligatorisk-samhallsintroduktion-och-samhallsorientering',
    absorbed: ['tido-sfi-yrkesutbildning-alla-kommuner'],
    title: 'Obligatorisk samhällsintroduktion och samhällsorientering samt förstärkt SFI',
    description:
      'En utredning föreslår att samhällsintroduktion och samhällsorientering görs obligatoriska och villkoras så att dagersättning, försörjningsstöd, etableringsersättning och andra stöd kräver deltagande, med en nationell läroplan och ett avslutande prov i samhällskunskap. Utredningen föreslår också förstärkningar av SFI-undervisningen, bland annat att SFI med yrkesutbildning erbjuds nyanlända i alla kommuner.',
    reason: 'The SFI item is a sub-point of the same inquiry mandate (p47).',
  },
];

/** Reasoning shown on the site for candidates typed `vague` (Swedish, user-facing). */
export const VAGUE_REASONING =
  'Löftet är så allmänt formulerat att det inte går att bedöma mot objektiva kriterier. Bedömningen gjordes vid import av avtalet.';

export const VAGUE_VERDICT_DATE = '2026-10-28';

export interface MapEntry {
  candidate: string;
  promise: string;
  page: number | undefined;
  note: string;
}

export interface PromoteResult {
  promises: PromiseRecord[];
  map: MapEntry[];
  merges: MergeSpec[];
  renames: [string, string][];
  vague: string[];
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

export function promote(candidates: readonly Candidate[]): PromoteResult {
  const byId = new Map<string, PromiseRecord>();
  for (const c of candidates) {
    if (byId.has(c.promise.id)) throw new Error(`Duplicate candidate id ${c.promise.id}`);
    byId.set(c.promise.id, structuredClone(c.promise));
  }

  const absorbedBy = new Map<string, string>();
  for (const m of MERGES) {
    for (const id of [m.primary, ...m.absorbed]) {
      if (!byId.has(id)) throw new Error(`Merge references unknown candidate ${id}`);
    }
    for (const id of m.absorbed) {
      if (absorbedBy.has(id) || MERGES.some((o) => o.primary === id)) {
        throw new Error(`Candidate ${id} is in more than one merge`);
      }
      absorbedBy.set(id, m.primary);
    }
  }
  for (const id of [...Object.keys(ID_RENAMES), ...Object.keys(TEXT_FIXES)]) {
    if (!byId.has(id)) throw new Error(`Editorial fix references unknown candidate ${id}`);
  }

  const finalId = (id: string): string => ID_RENAMES[id] ?? id;
  const promises: PromiseRecord[] = [];
  const map: MapEntry[] = [];
  const vague: string[] = [];

  for (const c of candidates) {
    const id = c.promise.id;
    const primarySpec = MERGES.find((m) => m.primary === id);
    const absorbingInto = absorbedBy.get(id);
    if (absorbingInto !== undefined) {
      map.push({
        candidate: id,
        promise: finalId(absorbingInto),
        page: c.promise.source.page,
        note: 'merged',
      });
      continue;
    }

    const p = structuredClone(byId.get(id)!);
    const notes: string[] = [];
    if (id in ID_RENAMES) {
      p.id = finalId(id);
      notes.push('id renamed');
    }
    const fix = TEXT_FIXES[id];
    if (fix) {
      if (fix.title) p.title = fix.title;
      if (fix.description) p.description = fix.description;
      notes.push('wording fixed');
    }
    if (primarySpec) {
      for (const aid of primarySpec.absorbed) {
        const a = byId.get(aid)!;
        p.keywords = union(p.keywords, a.keywords);
        p.parties = union(p.parties, a.parties);
        p.roles = { ...a.roles, ...p.roles };
      }
      if (primarySpec.title) p.title = primarySpec.title;
      p.description = primarySpec.description;
      notes.push(`merged with ${primarySpec.absorbed.length}`);
    }
    if (p.type === 'vague') {
      p.verdict = {
        value: 'not_assessable',
        reasoning: VAGUE_REASONING,
        date: VAGUE_VERDICT_DATE,
        history: [],
      };
      vague.push(p.id);
      notes.push('vague');
    }
    promises.push(p);
    map.push({
      candidate: id,
      promise: p.id,
      page: c.promise.source.page,
      note: notes.join(', ') || 'unchanged',
    });
  }

  const ids = promises.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Promoted ids are not unique');
  for (const p of promises) promiseSchema.parse(p);

  return {
    promises,
    map,
    merges: [...MERGES],
    renames: Object.entries(ID_RENAMES).filter(([a, b]) => a !== b),
    vague,
  };
}

/** Promise id to file name: ids are already `tido-<slug>`. */
export function promiseFileName(p: PromiseRecord): string {
  return `${p.id}.json`;
}

/** Render the audit document docs/tido-promotion-map.md. */
export function renderMapDoc(
  result: PromoteResult,
  pages: ReadonlyMap<string, number | undefined>,
): string {
  const lines: string[] = [];
  const strip = (id: string): string => `\`${id}\``;
  lines.push('# Tidöavtalet promotion map', '');
  lines.push(
    'Generated by `tools/promote-tido-candidates.ts` (bead hemsida-bvb.4); do not edit by hand. The editorial decisions are the tables in `tools/lib/tido-promote.ts`. Candidates in `src/data/2022-2026/candidates/tidoavtalet.json` are kept as the record of the extraction.',
    '',
    `${result.map.length} candidates became ${result.promises.length} promises in \`src/data/2022-2026/promises/\`. Review was done by AI in place of a human reviewer, as decided for seeding. Verdicts are unchanged: every promise is \`unassessed\`, except the ${result.vague.length} \`vague\` ones, which are \`not_assessable\`.`,
    '',
    'The promise schema holds one `source.page`, so a merged promise keeps the page of its primary candidate. The pages of the absorbed candidates are listed below.',
    '',
    '## Merges',
    '',
    'Duplicate groups from `docs/tido-candidates-review.md` that were merged. The other groups were left separate on purpose, see the end of this section.',
    '',
  );
  for (const m of result.merges) {
    lines.push(
      `- ${strip(m.primary)} (p${pages.get(m.primary)}) absorbs ${m.absorbed
        .map((a) => `${strip(a)} (p${pages.get(a)})`)
        .join(', ')}. ${m.reason}`,
    );
  }
  lines.push(
    '',
    'Kept separate (distinct measures with their own legislative trail, so separate verdicts are more useful): nuclear credit guarantees vs budget refocus; humanitarian protection vs family-reunification proposition; time-limited permits and conversion of permanent permits vs the asylum umbrella; the two family-reunification requirement items; the four honour-oppression items; the Polismyndigheten border-control assignment; reporting duty vs the internal-control review; speciallärare vs the vague staff item; the four penalty-increase items; social-services reform vs social task force; the two secret-coercive-measure items; the two police-protection items; the 24-hour guarantee (single candidate, nothing to merge).',
    '',
    '## Id changes',
    '',
    'Ids stay as extracted except where truncated mid-word or misspelled (ids are permanent once promoted):',
    '',
  );
  for (const [a, b] of result.renames) lines.push(`- ${strip(a)} -> ${strip(b)}`);
  lines.push(
    '',
    '## Wording fixes',
    '',
    ...Object.entries(TEXT_FIXES).map(([id, f]) => `- ${strip(id)}: ${f.reason}`),
    '',
    '## Vague promises',
    '',
    `Typed \`vague\` by the extraction and promoted as \`not_assessable\` with a reason (${result.vague.length}):`,
    '',
    ...result.vague.map((id) => `- ${strip(id)}`),
    '',
    '## Candidate to promise',
    '',
    '| Candidate | Page | Promise | Note |',
    '| --- | --- | --- | --- |',
  );
  for (const e of result.map) {
    lines.push(`| ${strip(e.candidate)} | ${e.page ?? ''} | ${strip(e.promise)} | ${e.note} |`);
  }
  lines.push('');
  return lines.join('\n');
}
