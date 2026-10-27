import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  countPdfPages,
  extractChunk,
  inChunkRange,
  makeChunks,
  mergeChunk,
  slugify,
  type RawCandidate,
} from './tido-extract.ts';

const raw = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  slug: 'Skärpta straff',
  title: 'Skärpta straff',
  description: 'Straffen för gängbrott ska skärpas.',
  page: 3,
  quote: 'Straffen ska skärpas',
  type: 'legislative',
  area: 'Kriminalpolitik',
  ministry: 'Justitiedepartementet',
  committee: 'JuU',
  keywords: ['gängbrott', ' straff '],
  ...over,
});

function mockClient(candidates: RawCandidate[], stop_reason = 'end_turn') {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream: (params: unknown) => {
        calls.push(params);
        return { finalMessage: async () => ({ stop_reason, parsed_output: { candidates } }) };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe('helpers', () => {
  it('chunks pages', () => {
    expect(makeChunks(10, 4).map((c) => c.key)).toEqual(['p1-4', 'p5-8', 'p9-10']);
  });
  it('slugifies Swedish', () => {
    expect(slugify('Skärpta straff för åklagare!')).toBe('skarpta-straff-for-aklagare');
  });
  it('counts pages heuristically', () => {
    const pdf = Buffer.from('/Type /Pages /Type /Page /Type/Page /Type /Page');
    expect(countPdfPages(pdf)).toBe(3);
    expect(countPdfPages(Buffer.from('nothing'))).toBeNull();
  });
});

describe('extractChunk', () => {
  const chunk = makeChunks(8, 8)[0];

  it('produces schema-valid drafts, dedupes ids, drops out-of-range pages', async () => {
    const { client, calls } = mockClient([raw(), raw(), raw({ title: 'Utanför', page: 99 })]);
    const entries = await extractChunk(client, 'AAAA', chunk, new Set(), '2022-10-14');
    expect(entries.map((e) => e.promise.id)).toEqual([
      'tido-skarpta-straff',
      'tido-skarpta-straff-2',
    ]);
    expect(entries[0].promise.verdict.value).toBe('not_started');
    expect(entries[0].promise.verdict.date).toBe('2022-10-14');
    expect(entries[0].promise.keywords).toEqual(['gängbrott', 'straff']);
    expect(entries[0].promise.roles.SD).toBe('support');
    expect(entries[0].ministry).toBe('Justitiedepartementet');
    expect(JSON.stringify(calls[0])).toContain('pages 1 to 8');
  });

  it('tolerates off-list type and committee per item', async () => {
    const { client } = mockClient([
      raw({ type: 'bogus' }),
      raw({ title: 'Ok', slug: 'ok', committee: 'XxU' }),
    ]);
    const entries = await extractChunk(client, 'A', chunk, new Set(), '2022-10-14');
    expect(entries).toHaveLength(1);
    expect(entries[0].promise.committee).toBeUndefined();
  });

  it('explains unparseable (truncated) responses', async () => {
    const client = {
      messages: {
        stream: () => ({
          finalMessage: async () => {
            throw new SyntaxError('Unexpected end of JSON input');
          },
        }),
      },
    } as unknown as Anthropic;
    await expect(extractChunk(client, 'AAAA', chunk, new Set(), '2022-10-14')).rejects.toThrow(
      /max_tokens.*smaller --pages-per-chunk/,
    );
  });
});

/** Real SDK client whose HTTP layer returns a canned SSE stream. */
function sseClient(json: string, stopReason: string) {
  const events = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'm',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ],
    [
      'content_block_start',
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ],
    [
      'content_block_delta',
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: json } },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 2 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ];
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Anthropic({
    apiKey: 'test',
    maxRetries: 0,
    fetch: async () =>
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  });
}

describe('extractChunk with real SDK stream parsing', () => {
  const chunk = makeChunks(8, 8)[0];
  const origError = console.error;
  beforeEach(() => {
    console.error = () => {};
  });
  afterEach(() => {
    console.error = origError;
  });

  it('parses a complete streamed response', async () => {
    const client = sseClient(JSON.stringify({ candidates: [raw()] }), 'end_turn');
    const entries = await extractChunk(client, 'AAAA', chunk, new Set(), '2022-10-14');
    expect(entries).toHaveLength(1);
  });

  it('reports a response truncated at max_tokens', async () => {
    const truncated = JSON.stringify({ candidates: [raw()] }).slice(0, 40);
    const client = sseClient(truncated, 'max_tokens');
    await expect(extractChunk(client, 'AAAA', chunk, new Set(), '2022-10-14')).rejects.toThrow(
      /smaller --pages-per-chunk/,
    );
  });
});

describe('mergeChunk', () => {
  it('replaces a chunk idempotently', async () => {
    const chunk = makeChunks(8, 8)[0];
    const { client } = mockClient([raw()]);
    const first = await extractChunk(client, 'A', chunk, new Set(), '2022-10-14');
    const once = mergeChunk([], chunk, first);
    const again = mergeChunk(
      once,
      chunk,
      await extractChunk(client, 'A', chunk, new Set(), '2022-10-14'),
    );
    expect(again).toEqual(once);
  });

  it('replaces by page range when the chunking changed (no duplicates)', async () => {
    const { client } = mockClient([raw({ page: 3 }), raw({ title: 'Sju', slug: 'sju', page: 7 })]);
    const [big] = makeChunks(8, 8);
    const old = mergeChunk([], big, await extractChunk(client, 'A', big, new Set(), '2022-10-14'));
    expect(old).toHaveLength(2);
    let merged = old;
    for (const c of makeChunks(8, 4)) {
      const taken = new Set(merged.filter((e) => !inChunkRange(e, c)).map((e) => e.promise.id));
      const fresh = await extractChunk(
        mockClient([raw({ page: c.firstPage })]).client,
        'A',
        c,
        taken,
        '2022-10-14',
      );
      merged = mergeChunk(merged, c, fresh);
    }
    expect(merged.map((e) => e.promise.id)).toEqual([
      'tido-skarpta-straff',
      'tido-skarpta-straff-2',
    ]);
    expect(merged.map((e) => e.chunk)).toEqual(['p1-4', 'p5-8']);
  });
});
