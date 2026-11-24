import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Text shown on the site must not point at internal work: bead IDs, repo docs, PR numbers or
 * tool names. The pattern is deliberately narrow so ordinary Swedish words do not match.
 */
const INTERNAL =
  /\bhemsida-[a-z0-9]+|\b(?:docs|tools)\/[\w.-]+|\b[\w-]+\.md\b|\bPR\s*#?\d+|\bpnpm\s+\w+|\bbd\s+(?:show|create|update|close|note)\b/i;

function strings(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
}

function promiseFiles(): string[] {
  const files: string[] = [];
  for (const term of readdirSync(dataRoot, { withFileTypes: true })) {
    if (!term.isDirectory()) continue;
    try {
      for (const f of readdirSync(`${dataRoot}${term.name}/promises`))
        if (f.endsWith('.json')) files.push(`${dataRoot}${term.name}/promises/${f}`);
    } catch {
      // not a term directory
    }
  }
  return files;
}

describe('site-facing promise text', () => {
  it('has promise files to check', () => {
    expect(promiseFiles().length).toBeGreaterThan(0);
  });

  it('matcher flags internal references and spares ordinary text', () => {
    for (const s of ['se docs/budget-promises.md', 'hemsida-9lbv', 'PR #12', 'tools/x.ts'])
      expect(INTERNAL.test(s)).toBe(true);
    for (const s of ['Regeringens docs är klara', 'prop. 2023/24:1', 'ett bd av lagen'])
      expect(INTERNAL.test(s)).toBe(false);
  });

  it('contains no bead IDs, doc paths, PR numbers or tool names in reasoning or evidence notes', () => {
    const problems: string[] = [];
    for (const file of promiseFiles()) {
      const p = JSON.parse(readFileSync(file, 'utf8'));
      const texts: [string, string][] = [];
      strings(p.verdict, 'verdict', texts);
      strings(p.evidence, 'evidence', texts);
      for (const [path, text] of texts) {
        if (/\.(url|dok_id|id)$/.test(path)) continue;
        const m = INTERNAL.exec(text);
        if (m) problems.push(`${file.split('/').pop()} ${path}: "${m[0]}"`);
      }
    }
    expect(problems).toEqual([]);
  });
});
