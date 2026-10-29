/**
 * Promotion of reviewed Liberalerna 2022 manifesto candidates to promise files.
 *
 * Pure transformation: candidates (promise plus proposed Tidöavtalet link) in, promises with one
 * agreement evidence entry plus an audit map out. All editorial calls are the tables below, so the
 * review is a diff of this file and of docs/manifesto-promotion-map-l.md. Verdicts are never
 * invented: promises stay `unassessed`, except `vague` ones, which become `not_assessable`.
 * Outcome labels describe the agreement text only and never imply a verdict.
 */

import {
  promiseSchema,
  type AgreementEvidence,
  type AgreementOutcome,
  type PromiseRecord,
} from './schema.ts';

export interface CandidateLink {
  promises: string[];
  outcome: AgreementOutcome;
  note: string | null;
  /** Review-only. */
  rationale?: string;
}

export interface ManifestoCandidate {
  /** Review-only. */
  section?: string;
  promise: PromiseRecord;
  link: CandidateLink;
}

export const ID_PREFIX = 'val2022-l-';
export const AGREEMENT_SOURCE = 'tidoavtalet';
export const AGREEMENT_DATE = '2022-10-14';

/** Typo'd or truncated ids (without prefix). The new id is permanent. */
export const ID_RENAMES: Readonly<Record<string, string>> = {
  'fler-domare-och-fler-akklagare': 'fler-domare-och-fler-aklagare',
  'byggut-stod-till-offer-for-hedersbrott': 'bygg-ut-stod-till-offer-for-hedersbrott',
  'skydda-varderfulla-havsomraden-som-marina-reservat':
    'skydda-vardefulla-havsomraden-som-marina-reservat',
  'avskaffa-subventioner-till-fossila-bransen': 'avskaffa-subventioner-till-fossila-branslen',
  'gradvis-okad-subventionsgrad-for-grupper-med-sam-sta-munhals':
    'gradvis-okad-subventionsgrad-for-grupper-med-samst-munhalsa',
  'ny-vardesstyrd-utrikespolitik': 'ny-varderingsstyrd-utrikespolitik',
  'internationell-erkannande-av-abortratten': 'internationellt-erkannande-av-abortratten',
};

/** Tax cuts are changes to tax law, so they are typed `legislative` like the other tax items. */
export const TYPE_FIXES: Readonly<Record<string, { type: PromiseRecord['type']; reason: string }>> =
  {
    'sank-skatten-pa-lagsta-lonerna-med-1000-kronor': {
      type: 'legislative',
      reason: 'Tax cut typed `budget`; all other tax cuts are `legislative`.',
    },
    'skattefria-forsta-100000-kronorna': {
      type: 'legislative',
      reason: 'Tax cut typed `budget`; all other tax cuts are `legislative`.',
    },
  };

/** Wording and quote fixes, keyed by candidate id (without prefix). */
export const TEXT_FIXES: Readonly<
  Record<string, { description?: string; quote?: string; reason: string }>
> = {
  'fungerande-vagnat': {
    description: 'Vägnätet ska fungera.',
    reason:
      'The description added "i alla delar av Sverige", which belongs to the next clause (government agencies present everywhere), not to the road network.',
  },
  'ingen-satsning-pa-hoghastighetsjarnvag': {
    quote:
      'i stället för att lägga hundratals miljarder på en höghastighetsjärnväg som inte är klar ens om 20 år',
    reason: 'The quote stopped mid-phrase ("ens om"); completed from p11 of the manifesto.',
  },
};

/** Outcome changes against the proposal, keyed by candidate id (without prefix). */
export const OUTCOME_OVERRIDES: Readonly<
  Record<string, { outcome: AgreementOutcome; promises?: string[]; note: string; reason: string }>
> = {
  'tvangsmedel-mot-organiserade-gangmedlemmar-utan-brottsmissta': {
    outcome: 'weakened',
    note: 'Avtalet nämner bara att preventiva tvångsmedel mot kriminella nätverk ska övervägas och att författningsförslag ska lämnas, inte att de införs, och anger varken domstolsbeslut eller att konkret brottsmisstanke inte krävs.',
    reason:
      'Proposed as included, but the Tidö basis (p20) is only an inquiry; inquiry-only items are weakened.',
  },
  'reform-av-foraldraforsakringen-och-flerbarnstillagget': {
    outcome: 'not_addressed',
    promises: [],
    note: 'Avtalet utreder nya kvalificeringsregler för bland annat föräldrapenning och flerbarnstillägg för nyanlända, men med ett annat syfte och en annan inriktning än L:s löfte om fler utrikes födda kvinnor i arbete.',
    reason:
      'Osäker item. The Tidö inquiry touches the same benefits but is a different measure with a different aim; not_addressed rather than weakened.',
  },
};

/**
 * 'Osäker' items from the proposal where the evidence did not settle the label and the more
 * conservative one was chosen (weakened rather than included, not_addressed rather than included
 * or weakened). Listed in the PR and the map doc for a later human check.
 */
export const CONSERVATIVE_CALLS: Readonly<Record<string, string>> = {
  'stopp-religiosa-friskolor':
    'Tidö only tightens inspection of confessional schools; no ban. not_addressed rather than weakened.',
  'enklare-omplacering-av-stormande-elever':
    'Tidö only commits to inquire into legislation. weakened rather than included.',
  'reform-av-foraldraforsakringen-och-flerbarnstillagget':
    'Same benefits, different aim. not_addressed rather than weakened.',
  'stoppa-kompetensutvisningarna':
    'Tidö p37 protects existing practice but does not promise to stop the deportations. not_addressed rather than weakened.',
  'asylratten-varnas-den-med-skal-ska-stanna':
    'Temporary protection could be read as contradicting; only the return half matches. weakened rather than included.',
  'nytt-brott-tjanstemannaforfoljelse':
    'No new offence, only higher penalties for threats against officials. weakened rather than included.',
  'starkare-uppfoljning-av-bidragsgivning':
    'Tidö reviews measures against public funds reaching extremist associations; follow-up is not mentioned. weakened rather than included.',
  'nedsatt-forsorjningsstod-om-man-inte-lar-sig-svenska':
    'Tidö conditions benefits on participation in SFI and introduction, not on learning Swedish. weakened rather than included.',
  'skolan-gor-alltid-polisanmalan-och-orosanmalan':
    'Tidö has the duty to report crime but not the report to social services. weakened rather than included.',
  'utvisning-ska-alltid-provas-vid-grova-brott':
    'Tidö covers all crimes, a superset of L:s; kept included (not strengthened) because the label should not imply a judgement about scope.',
  'utreda-vistelseforbud-domda-kriminella':
    'Tidö introduces a residence ban in geographic areas, not limited to vulnerable areas, instead of only trying the possibility; kept included.',
};

/** Reasoning shown on the site for promises typed `vague` (Swedish, user-facing). */
export const VAGUE_REASONING =
  'Löftet är så allmänt formulerat att det inte går att bedöma mot objektiva kriterier. Bedömningen gjordes vid import av valmanifestet.';
export const VAGUE_VERDICT_DATE = '2026-10-28';

export interface MapEntry {
  candidate: string;
  promise: string;
  outcome: AgreementOutcome;
  links: string[];
  changes: string[];
}

export interface PromoteResult {
  promises: PromiseRecord[];
  map: MapEntry[];
  vague: string[];
}

function strip(id: string): string {
  if (!id.startsWith(ID_PREFIX)) throw new Error(`Candidate id ${id} lacks prefix ${ID_PREFIX}`);
  return id.slice(ID_PREFIX.length);
}

export function promote(candidates: readonly ManifestoCandidate[]): PromoteResult {
  const known = new Set(candidates.map((c) => strip(c.promise.id)));
  if (known.size !== candidates.length) throw new Error('Duplicate candidate id');
  for (const key of [
    ...Object.keys(ID_RENAMES),
    ...Object.keys(TYPE_FIXES),
    ...Object.keys(TEXT_FIXES),
    ...Object.keys(OUTCOME_OVERRIDES),
    ...Object.keys(CONSERVATIVE_CALLS),
  ]) {
    if (!known.has(key)) throw new Error(`Editorial table references unknown candidate ${key}`);
  }

  const promises: PromiseRecord[] = [];
  const map: MapEntry[] = [];
  const vague: string[] = [];

  for (const c of candidates) {
    const key = strip(c.promise.id);
    const p = structuredClone(c.promise);
    const changes: string[] = [];

    if (key in ID_RENAMES) {
      p.id = ID_PREFIX + ID_RENAMES[key];
      changes.push('id renamed');
    }
    const typeFix = TYPE_FIXES[key];
    if (typeFix) {
      p.type = typeFix.type;
      changes.push('type fixed');
    }
    const textFix = TEXT_FIXES[key];
    if (textFix) {
      if (textFix.description) p.description = textFix.description;
      if (textFix.quote) p.source = { ...p.source, quote: textFix.quote };
      changes.push('wording fixed');
    }

    let { outcome, promises: links, note } = c.link;
    const override = OUTCOME_OVERRIDES[key];
    if (override) {
      outcome = override.outcome;
      links = override.promises ?? links;
      note = override.note;
      changes.push('outcome changed');
    }
    if (key in CONSERVATIVE_CALLS) changes.push('conservative call');

    if (p.type === 'vague') {
      p.verdict = {
        value: 'not_assessable',
        reasoning: VAGUE_REASONING,
        date: VAGUE_VERDICT_DATE,
        history: [],
      };
      vague.push(p.id);
      changes.push('vague');
    }

    const evidence: AgreementEvidence = {
      kind: 'agreement',
      source: AGREEMENT_SOURCE,
      date: AGREEMENT_DATE,
      promises: [...links],
      outcome,
      note: note ?? null,
    };
    p.evidence = [evidence, ...p.evidence];
    promises.push(p);
    map.push({ candidate: c.promise.id, promise: p.id, outcome, links: [...links], changes });
  }

  const ids = promises.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Promoted ids are not unique');
  for (const p of promises) promiseSchema.parse(p);
  return { promises, map, vague };
}

export function promiseFileName(p: PromiseRecord): string {
  return `${p.id}.json`;
}

export function outcomeCounts(map: readonly MapEntry[]): Record<AgreementOutcome, number> {
  const counts: Record<AgreementOutcome, number> = {
    included: 0,
    weakened: 0,
    strengthened: 0,
    contradicted: 0,
    not_addressed: 0,
  };
  for (const e of map) counts[e.outcome]++;
  return counts;
}

/** Render the audit document docs/manifesto-promotion-map-l.md. */
export function renderMapDoc(result: PromoteResult): string {
  const q = (id: string): string => `\`${id}\``;
  const counts = outcomeCounts(result.map);
  const L: string[] = [];
  L.push(
    '# Liberalerna 2022 manifesto promotion map',
    '',
    'Generated by `tools/promote-manifesto-candidates.ts`; do not edit by hand. The editorial decisions are the tables in `tools/lib/manifesto-promote.ts`. Candidates in `src/data/2022-2026/candidates/valmanifest-2022-l.json` are kept as the record of the extraction and the proposed links.',
    '',
    `${result.map.length} candidates became ${result.promises.length} promises in \`src/data/2022-2026/promises/\` (\`val2022-l-*.json\`), each with exactly one \`agreement\` evidence entry for \`tidoavtalet\`. Review was done by AI in place of a human reviewer, as decided for seeding. Verdicts are unchanged: every promise is \`unassessed\`, except the ${result.vague.length} \`vague\` ones, which are \`not_assessable\`. Outcome labels describe the agreement text only and are not verdicts.`,
    '',
    '## Outcome counts',
    '',
    '| Outcome | Count |',
    '| --- | --- |',
    ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Changes against the proposal',
    '',
    '### Id renames (ids are permanent once promoted)',
    '',
    ...Object.entries(ID_RENAMES).map(([a, b]) => `- ${q(ID_PREFIX + a)} -> ${q(ID_PREFIX + b)}`),
    '',
    '### Type fixes',
    '',
    ...Object.entries(TYPE_FIXES).map(([id, f]) => `- ${q(id)} -> \`${f.type}\`: ${f.reason}`),
    '',
    '### Wording fixes',
    '',
    ...Object.entries(TEXT_FIXES).map(([id, f]) => `- ${q(id)}: ${f.reason}`),
    '',
    '### Outcome changes',
    '',
    ...Object.entries(OUTCOME_OVERRIDES).map(
      ([id, f]) => `- ${q(id)} -> \`${f.outcome}\`: ${f.reason}`,
    ),
    '',
    '## Conservative calls on uncertain items',
    '',
    'The proposal marked 63 items "Osäker". They were re-read against the manifesto text and the linked Tidö promises; the proposed label was kept where the evidence supports it. These are the ones where the evidence did not settle it and the more conservative label was chosen, listed for a later human check:',
    '',
    ...Object.entries(CONSERVATIVE_CALLS).map(([id, why]) => `- ${q(id)}: ${why}`),
    '',
    '## Vague promises',
    '',
    `Typed \`vague\` and promoted as \`not_assessable\` with a reason (${result.vague.length}):`,
    '',
    ...result.vague.map((id) => `- ${q(id)}`),
    '',
    '## Candidate to promise',
    '',
    '| Candidate | Promise | Outcome | Linked Tidö promises | Changes |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const e of result.map) {
    L.push(
      `| ${q(e.candidate)} | ${q(e.promise)} | ${e.outcome} | ${e.links.map(q).join(', ')} | ${e.changes.join(', ')} |`,
    );
  }
  L.push('');
  return L.join('\n');
}
