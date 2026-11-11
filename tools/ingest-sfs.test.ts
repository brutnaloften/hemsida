import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('ingest-sfs --dry-run', () => {
  it('exits 0 with an empty cache and fetches nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfs-'));
    const doc = (n: number) => ({
      dok_id: `HX0${n}`,
      doktyp: 'prop',
      rm: '2024/25',
      beteckning: String(n),
      titel: 'T',
      datum: '2025-01-01',
      organ: 'X',
      url: 'u',
      text: 'Regeringen föreslår',
      seq: n,
    });
    const store = {
      version: 1,
      term: '2022-2026',
      cursors: {},
      next_seq: 4,
      documents: { HX01: doc(1), HX02: doc(2), HX03: doc(3) },
    };
    const storePath = join(dir, 'store.json');
    writeFileSync(storePath, JSON.stringify(store));
    const out = execFileSync(
      'node',
      [
        '--experimental-strip-types',
        join(import.meta.dirname, 'ingest-sfs.ts'),
        '--dry-run',
        '--limit',
        '3',
        '--riksdag-store',
        storePath,
        '--cache',
        join(dir, 'cache'),
        '--out',
        join(dir, 'out'),
      ],
      { encoding: 'utf8' },
    );
    expect(out).toMatch(/not cached/);
    expect(out).toMatch(/--dry-run: nothing written/);
  });
});
