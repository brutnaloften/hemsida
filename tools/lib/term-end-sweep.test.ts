import { describe, expect, it } from 'vitest';
import { promiseSchema } from './schema.ts';
import type { PromiseRecord } from './schema.ts';
import {
  applyVerdict,
  buildReport,
  classify,
  EXPIRED_FALLBACK,
  resolveBaseVerdict,
  failureImplying,
} from './term-end-sweep.ts';

const ev = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  dok_id: kind === 'sfs' ? 'sfs-2025-1' : `${kind}-1`,
  designation: kind === 'sfs' ? 'SFS 2025:1' : `${kind} 2023/24:1`,
  date: '2024-01-01',
  title: 'T',
  url: 'https://data.riksdagen.se/x',
  relevance: 'full',
  confidence: 'high',
  note: 'n',
  ...extra,
});

function promise(
  value: string,
  evidence: unknown[] = [],
  over: Record<string, unknown> = {},
  reasoning = 'Löftet har ännu inte prövats mot dokument.',
): PromiseRecord {
  return promiseSchema.parse({
    id: 'p1',
    term: '2022-2026',
    title: 't',
    description: 'd',
    source: { id: 'tidoavtalet' },
    parties: ['M'],
    roles: { M: 'government' },
    type: 'legislative',
    area: 'Ekonomi och skatter',
    keywords: [],
    verdict: {
      value,
      assessedBy: 'ai',
      reasoning,
      date: '2026-01-01',
      history: [],
    },
    evidence,
    ...over,
  });
}

describe('classify', () => {
  it('expires every unassessed promise', () => {
    const c = classify(promise('unassessed'));
    expect(c?.action).toBe('expire');
    expect(c?.proposedVerdict).toBe('expired');
  });

  it('leaves other verdicts alone', () => {
    expect(classify(promise('not_assessable'))).toBeNull();
    expect(classify(promise('partially_fulfilled', [ev('sfs')]))).toBeNull();
  });

  it('flags in_progress with a law for the rule check', () => {
    const c = classify(promise('in_progress', [ev('prop'), ev('sfs')]));
    expect(c?.action).toBe('rule_check');
    expect(c?.group).toBe('law (sfs)');
  });

  it('expires in_progress with only dir/sou/ds', () => {
    const c = classify(promise('in_progress', [ev('dir'), ev('sou')]));
    expect(c?.action).toBe('expire_inquiry_only');
  });

  it('flags an inquiry promise with a directive for the rule check', () => {
    const c = classify(promise('in_progress', [ev('dir')], { type: 'inquiry' }));
    expect(c?.action).toBe('rule_check');
  });

  it('keeps prop-only and bet-only in_progress for a decision', () => {
    expect(classify(promise('in_progress', [ev('prop')]))?.action).toBe('keep_needs_decision');
    expect(classify(promise('in_progress', [ev('bet'), ev('dir')]))?.action).toBe(
      'keep_needs_decision',
    );
  });

  it('does not let a contradicts law qualify', () => {
    const c = classify(
      promise('in_progress', [ev('prop'), ev('sfs', { relevance: 'contradicts' })]),
    );
    expect(c?.action).toBe('keep_needs_decision');
  });
});

describe('failureImplying', () => {
  it('flags failure and absence wording', () => {
    expect(failureImplying('Åtgärden genomfördes inte.')).toBe(true);
    expect(failureImplying('Detta nämns inte i dokumenten.')).toBe(true);
    expect(failureImplying('Löftet är inte prövat mot dokument.')).toBe(false);
  });
});

describe('buildReport', () => {
  it('counts the groups and writes no unfulfilled candidates', () => {
    const r = buildReport(
      '2022-2026',
      [
        promise('unassessed'),
        promise('in_progress', [ev('dir')]),
        promise('in_progress', [ev('prop'), ev('sfs')]),
        promise('in_progress', [ev('bet'), ev('prop')]),
        promise('fulfilled', [ev('sfs')]),
      ],
      '2026-11-25',
    );
    expect(r.counts).toMatchObject({
      expire: 1,
      expireInquiryOnly: 1,
      ruleCheck: 1,
      keepNeedsDecision: 1,
      unfulfilledCandidates: 0,
    });
    expect(r.items).toHaveLength(4);
  });
});

describe('applyVerdict', () => {
  it('keeps the reasoning, appends the previous verdict to the history and validates', () => {
    const p = promise('unassessed');
    p.verdict.history = [
      { value: 'unassessed', assessedBy: 'ai', reasoning: 'older', date: '2025-01-01' },
    ];
    const v = applyVerdict(p.verdict, classify(p)!, '2026-11-26')!;
    expect(v.value).toBe('expired');
    expect(v.assessedBy).toBe('ai');
    expect(v.reasoning).toBe(p.verdict.reasoning);
    expect(v.history).toHaveLength(2);
    expect(v.history[1]).toMatchObject({ value: 'unassessed', date: '2026-01-01' });
    expect(promiseSchema.safeParse({ ...p, verdict: v }).success).toBe(true);
  });

  it('leaves the reasoning untouched and fills an empty one', () => {
    const bad = promise('unassessed', [], {}, 'Åtgärden genomfördes inte.');
    expect(applyVerdict(bad.verdict, classify(bad)!, 'd')!.reasoning).toBe(
      'Åtgärden genomfördes inte.',
    );
    const empty = promise('unassessed', [], {}, '');
    expect(applyVerdict(empty.verdict, classify(empty)!, 'd')!.reasoning).toBe(EXPIRED_FALLBACK);
  });

  it('does nothing for a flagged or kept promise', () => {
    const p = promise('in_progress', [ev('prop')]);
    expect(applyVerdict(p.verdict, classify(p)!, 'd')).toBeNull();
  });
});

describe('resolveBaseVerdict', () => {
  const current = promise('unassessed').verdict;
  it('uses the base file, not the working tree', () => {
    const base = promise('unassessed', [], {}, 'på basen');
    const warnings: string[] = [];
    const v = resolveBaseVerdict(JSON.stringify(base), current, (m) => warnings.push(m), 'p1');
    expect(v.reasoning).toBe('på basen');
    expect(warnings).toEqual([]);
  });
  it('falls back with a warning only when the file is missing on the base', () => {
    const warnings: string[] = [];
    expect(resolveBaseVerdict(null, current, (m) => warnings.push(m), 'p1')).toBe(current);
    expect(warnings).toHaveLength(1);
  });
  it('throws on a base file that does not parse', () => {
    expect(() => resolveBaseVerdict('{}', current, () => {})).toThrow();
  });
});

describe('fulfilled-only qualification', () => {
  it('flags an other_action promise with a bet that passes fulfilled but not partially_fulfilled', () => {
    const c = classify(promise('in_progress', [ev('prop'), ev('bet')], { type: 'other_action' }));
    expect(c?.action).toBe('rule_check');
    expect(c?.proposedVerdict).toBe('fulfilled');
  });
});

describe('contradicting and unicode cases', () => {
  it('flags an expired-group promise that carries a contradicts bet', () => {
    const c = classify(
      promise('in_progress', [ev('dir'), ev('bet', { relevance: 'contradicts' })]),
    );
    expect(c?.action).toBe('expire_inquiry_only');
    expect(c?.contradicts).toBe(true);
    expect(classify(promise('unassessed', [ev('bet')]))?.contradicts).toBe(false);
  });
  it('matches failure wording next to Swedish letters', () => {
    expect(failureImplying('Det misslyckades.')).toBe(true);
    expect(failureImplying('Åtgärden är övergiven.')).toBe(true);
    expect(failureImplying('Förbrutit är ett annat ord.')).toBe(false);
  });
});
