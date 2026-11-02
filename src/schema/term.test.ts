import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { termSchema } from './term';
import { promiseSchema, sourceSchema } from './promise';

const dataRoot = fileURLToPath(new URL('../data', import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

const valid = {
  id: '2022-2026',
  roles: {
    M: 'government',
    KD: 'government',
    L: 'government',
    SD: 'support',
    S: 'opposition',
    V: 'opposition',
    C: 'opposition',
    MP: 'opposition',
  },
  agreements: ['tidoavtalet'],
};

describe('termSchema', () => {
  it('accepts a full record', () => {
    expect(termSchema.parse(valid).role_changes).toEqual([]);
  });
  it('accepts a term with no agreements', () => {
    expect(termSchema.parse({ ...valid, agreements: [] }).agreements).toEqual([]);
    const { agreements: _a, ...rest } = valid;
    expect(termSchema.parse(rest).agreements).toEqual([]);
  });
  it('accepts several agreements', () => {
    expect(termSchema.safeParse({ ...valid, agreements: ['a', 'b'] }).success).toBe(true);
  });
  it('rejects a missing party', () => {
    const { MP: _mp, ...roles } = valid.roles;
    expect(termSchema.safeParse({ ...valid, roles }).success).toBe(false);
  });
  it('rejects bad id, unknown role and duplicate agreements', () => {
    expect(termSchema.safeParse({ ...valid, id: '2022' }).success).toBe(false);
    expect(termSchema.safeParse({ ...valid, id: '2026-2022' }).success).toBe(false);
    expect(termSchema.safeParse({ ...valid, roles: { ...valid.roles, S: 'ruler' } }).success).toBe(
      false,
    );
    expect(termSchema.safeParse({ ...valid, agreements: ['a', 'a'] }).success).toBe(false);
  });
  it('accepts dated role changes but not a no-op first change', () => {
    const ok = { date: '2024-05-01', party: 'S', role: 'government' };
    expect(termSchema.safeParse({ ...valid, role_changes: [ok] }).success).toBe(true);
    expect(
      termSchema.safeParse({ ...valid, role_changes: [{ ...ok, role: 'opposition' }] }).success,
    ).toBe(false);
    expect(
      termSchema.safeParse({ ...valid, role_changes: [{ ...ok, date: '2024-5-1' }] }).success,
    ).toBe(false);
  });
});

describe('committed term records', () => {
  const terms = readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${dataRoot}/${d.name}/term.json`))
    .map((d) => ({
      dir: d.name,
      term: termSchema.parse(readJson(`${dataRoot}/${d.name}/term.json`)),
    }));

  it('has a record for 2022-2026', () => {
    expect(terms.map((t) => t.dir)).toContain('2022-2026');
  });

  it.each(terms)(
    '$dir: id matches directory and agreements are agreement sources',
    ({ dir, term }) => {
      expect(term.id).toBe(dir);
      const kinds = new Map(
        readdirSync(`${dataRoot}/sources`)
          .filter((f) => f.endsWith('.json'))
          .map((f) => sourceSchema.parse(readJson(`${dataRoot}/sources/${f}`)))
          .map((s) => [s.id, s.kind]),
      );
      for (const a of term.agreements) expect(kinds.get(a)).toBe('government_agreement');
    },
  );

  it.each(terms)('$dir: promise roles agree with the term record', ({ dir, term }) => {
    const problems: string[] = [];
    for (const f of readdirSync(`${dataRoot}/${dir}/promises`).filter((f) => f.endsWith('.json'))) {
      const p = promiseSchema.parse(readJson(`${dataRoot}/${dir}/promises/${f}`));
      for (const [party, role] of Object.entries(p.roles)) {
        if (term.roles[party as keyof typeof term.roles] !== role) {
          problems.push(
            `${p.id}: ${party} is ${role}, term says ${term.roles[party as keyof typeof term.roles]}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
