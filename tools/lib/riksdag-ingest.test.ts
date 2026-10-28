import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DocumentPage, ListDocumentsParams, RiksdagDocument } from './riksdag.ts';
import {
  addDays,
  emptyStore,
  ingestDoktyp,
  loadStore,
  saveStore,
  snippetOf,
  storeSchema,
} from './riksdag-ingest.ts';

function doc(id: string, datum: string, extra: Partial<RiksdagDocument> = {}): RiksdagDocument {
  return {
    dok_id: id,
    doktyp: 'bet',
    subtyp: '',
    rm: '2023/24',
    beteckning: 'NU1',
    nummer: '1',
    datum: `${datum} 00:00:00`,
    publicerad: '',
    titel: `Titel ${id}`,
    organ: 'NU',
    status: '',
    dokument_url_html: `https://data.riksdagen.se/dokument/${id}.html`,
    dokumentstatus_url_xml: '',
    ...extra,
  };
}

/** Fake API: serves `all` filtered by from/tom, sorted by datum, paged by `sz`. */
function fakeApi(all: RiksdagDocument[], calls: ListDocumentsParams[] = []) {
  return async (p: ListDocumentsParams): Promise<DocumentPage> => {
    calls.push(p);
    const hits = all
      .filter((d) => d.datum.slice(0, 10) >= p.from! && d.datum.slice(0, 10) <= p.tom!)
      .sort((a, b) => a.datum.localeCompare(b.datum));
    const sz = p.sz ?? 200;
    const pages = Math.max(1, Math.ceil(hits.length / sz));
    const page = p.p ?? 1;
    return {
      total: hits.length,
      page,
      pages,
      documents: hits.slice((page - 1) * sz, page * sz),
    };
  };
}

const base = { term: '2022-2026', today: '2026-10-28', save: () => {} };

describe('ingestDoktyp', () => {
  it('fetches the whole term on the first run and sets the cursor', async () => {
    const calls: ListDocumentsParams[] = [];
    const store = emptyStore('2022-2026');
    const s = await ingestDoktyp(store, 'bet', {
      ...base,
      list: fakeApi([doc('A', '2023-01-05'), doc('B', '2024-02-01')], calls),
    });
    expect(calls[0]).toMatchObject({
      doktyp: 'bet',
      from: '2022-09-01',
      tom: '2026-09-30',
      sort: 'datum',
      sortorder: 'asc',
    });
    expect(s).toMatchObject({ requests: 1, added: 2 });
    expect(store.cursors.bet).toBe('2024-02-01');
    expect(store.documents.A!.seq).toBe(1);
    expect(store.documents.B!.seq).toBe(2);
    expect(storeSchema.safeParse(store).success).toBe(true);
  });

  it('fetches only from cursor minus lookback on later runs and keeps seq of known documents', async () => {
    const calls: ListDocumentsParams[] = [];
    const store = emptyStore('2022-2026');
    const all = [doc('A', '2023-01-05'), doc('B', '2024-02-01')];
    await ingestDoktyp(store, 'bet', { ...base, list: fakeApi(all) });

    all.push(doc('C', '2024-03-01'));
    const s = await ingestDoktyp(store, 'bet', { ...base, list: fakeApi(all, calls) });
    expect(calls[0]!.from).toBe(addDays('2024-02-01', -14));
    expect(s.added).toBe(1);
    expect(s.updated).toBe(0);
    expect(store.documents.B!.seq).toBe(2);
    expect(store.documents.C!.seq).toBe(3);
    expect(store.cursors.bet).toBe('2024-03-01');
  });

  it('counts a changed known document as updated, not added', async () => {
    const store = emptyStore('2022-2026');
    await ingestDoktyp(store, 'bet', { ...base, list: fakeApi([doc('A', '2024-01-01')]) });
    const s = await ingestDoktyp(store, 'bet', {
      ...base,
      list: fakeApi([doc('A', '2024-01-01', { titel: 'Ny titel' })]),
    });
    expect(s).toMatchObject({ added: 0, updated: 1 });
    expect(store.documents.A!.titel).toBe('Ny titel');
    expect(store.documents.A!.seq).toBe(1);
  });

  it('pages, saves after every page and resumes from the saved cursor', async () => {
    const all = Array.from({ length: 5 }, (_, i) => doc(`D${i}`, `2024-01-0${i + 1}`));
    const saves: number[] = [];
    const store = emptyStore('2022-2026');
    const api = fakeApi(all);
    const small = (p: ListDocumentsParams) => api({ ...p, sz: 2 });
    // Interrupt after the first page.
    await ingestDoktyp(store, 'bet', {
      ...base,
      list: small,
      maxPages: 1,
      save: (st) => saves.push(Object.keys(st.documents).length),
    });
    expect(saves).toEqual([2]);
    expect(store.cursors.bet).toBe('2024-01-02');

    const calls: ListDocumentsParams[] = [];
    const api2 = fakeApi(all, calls);
    await ingestDoktyp(store, 'bet', { ...base, list: (p) => api2({ ...p, sz: 2 }) });
    expect(Object.keys(store.documents)).toHaveLength(5);
    expect(calls.length).toBe(3); // the lookback window covers all 5 documents, 2 per page
    expect(store.cursors.bet).toBe('2024-01-05');
  });

  it('never moves the cursor past today', async () => {
    const store = emptyStore('2022-2026');
    await ingestDoktyp(store, 'bet', {
      ...base,
      today: '2026-06-01',
      list: fakeApi([doc('A', '2026-08-01')]),
    });
    expect(store.cursors.bet).toBe('2026-06-01');
  });

  it('an explicit from overrides the cursor', async () => {
    const calls: ListDocumentsParams[] = [];
    const store = emptyStore('2022-2026');
    store.cursors.bet = '2025-01-01';
    await ingestDoktyp(store, 'bet', {
      ...base,
      from: '2023-01-01',
      tom: '2023-01-31',
      list: fakeApi([], calls),
    });
    expect(calls[0]).toMatchObject({ from: '2023-01-01', tom: '2023-01-31' });
  });
});

describe('snippetOf', () => {
  it('joins distinct text pieces and strips tags', () => {
    const d = doc('A', '2024-01-01', {
      undertitel: 'Betänkande 2023/24:NU1',
      notisrubrik: 'Rubrik',
      summary: '<p>Rubrik</p>',
      notis: '<p>Text&nbsp;här</p>',
    });
    expect(snippetOf(d)).toBe('Betänkande 2023/24:NU1 Rubrik Text här');
  });
});

describe('store file', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('round-trips and starts empty when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-'));
    dirs.push(dir);
    const path = join(dir, 'sub', 's.json');
    expect(loadStore(path, '2022-2026').next_seq).toBe(1);
    const store = emptyStore('2022-2026');
    store.cursors.bet = '2024-01-01';
    saveStore(path, store);
    expect(loadStore(path, '2022-2026')).toEqual(store);
    expect(() => loadStore(path, '2026-2030')).toThrow(/term/);
  });
});
