import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyLinks, sfsJudgements, type StoreDocument } from './lib/apply-links.ts';
import { promiseSchema } from './lib/schema.ts';
import { SFS_JUDGE_TEMPLATE_VERSION } from './lib/sfs-judge.ts';

// End to end: the CLI against a temporary repository tree.
const prop: StoreDocument = {
  dok_id: 'P1',
  doktyp: 'prop',
  rm: '2025/26',
  beteckning: '207',
  titel: 'En proposition',
  datum: '2026-03-17',
  url: 'https://data.riksdagen.se/dokument/P1.html',
};
const laws = {
  'sfs-2026-100': { sfs: '2026:100', title: 'Lag (2026:100) om X', ikraft: '2026-07-01' },
};
const base = promiseSchema.parse({
  id: 'tido-x',
  term: '2022-2026',
  title: 'X',
  description: 'X',
  source: { id: 'tidoavtalet' },
  parties: ['M'],
  roles: { M: 'government' },
  type: 'legislative',
  area: 'Arbetsmarknad',
  verdict: { value: 'unassessed', reasoning: '', date: '2022-10-14' },
});

const judgement = (label: 'full' | 'none') => ({
  id: 'tido-x::sfs-2026-100',
  label,
  confidence: 'high' as const,
  missing_sv: '',
  template_version: SFS_JUDGE_TEMPLATE_VERSION,
});
const linkPair = {
  promise_id: 'tido-x',
  document_id: 'P1',
  label: 'match' as const,
  stage: 'preparatory' as const,
  confidence: 'high' as const,
  proposed: true,
};

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'apply-links-'));
  const write = (rel: string, data: unknown) => {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2));
    return path;
  };
  write('tools/out/riksdag-store/2022-2026.json', {
    version: 1,
    term: '2022-2026',
    cursors: {},
    next_seq: 2,
    documents: { P1: prop },
  });
  write('tools/contradicts-overrides.json', {});
  write('tools/sfs-overrides.json', {});
  write('tools/out/link-runs/r1/manifest.json', {
    config: { thresholds: { min_confidence: 'medium' } },
  });
  write('tools/out/link-runs/r1/results.json', [
    {
      promise_id: 'tido-x',
      document_id: 'P1',
      judgement: { label: 'match', stage: 'preparatory', confidence: 'high', reason: 'r' },
      proposed: true,
    },
  ]);
  const store = write('sfs-store.json', { laws, byProp: { P1: ['sfs-2026-100'] } });
  // The promise as it stands after a complete earlier run: fulfilled through the law.
  const fulfilled = applyLinks(base, [linkPair], new Map([['P1', prop]]), '2026-11-10', new Map(), {
    laws,
    byProp: { P1: ['sfs-2026-100'] },
    judgements: sfsJudgements([judgement('full')]),
  })!;
  expect(fulfilled.verdict.value).toBe('fulfilled');
  const file = write(
    'src/data/2022-2026/promises/tido-x.json',
    promiseSchema.parse({ ...base, ...fulfilled }),
  );
  const run = (sfsRuns: string[], ...extra: string[]) =>
    execFileSync(
      'node',
      [
        '--experimental-strip-types',
        join(import.meta.dirname, 'apply-links.ts'),
        '--root',
        root,
        '--run',
        'r1',
        '--today',
        '2026-11-20',
        '--sfs-store',
        store,
        '--sfs-run',
        sfsRuns.join(','),
        ...extra,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  const verdict = () => (JSON.parse(readFileSync(file, 'utf8')) as typeof base).verdict.value;
  const results = (name: string, label: 'full' | 'none') =>
    write(`${name}.json`, { results: [judgement(label)] });
  return { run, verdict, results };
}

describe('apply-links CLI', () => {
  it('keeps a fulfilled verdict that the runs would lower, and lowers it with --allow-downgrade', () => {
    const t = setup();
    const none = t.results('none-run', 'none');
    t.run([none]);
    expect(t.verdict()).toBe('fulfilled');
    t.run([none], '--allow-downgrade');
    expect(t.verdict()).toBe('in_progress');
  });

  it('merges comma separated --sfs-run files, the later judgement replacing the earlier', () => {
    const t = setup();
    const none = t.results('none-run', 'none');
    const full = t.results('full-run', 'full');
    // Earlier run says none, the later full: the verdict stays fulfilled even when downgrades are allowed.
    t.run([none, full], '--allow-downgrade');
    expect(t.verdict()).toBe('fulfilled');
    // Reversed order: the later none wins and the downgrade is applied.
    t.run([full, none], '--allow-downgrade');
    expect(t.verdict()).toBe('in_progress');
  });
});
