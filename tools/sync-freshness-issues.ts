/**
 * Create/update/close one GitHub issue per stale dataset (label data-stale) using the `gh` CLI.
 * Reads the manifest only; never ingests or pushes data. Always exits 0 on stale data (a stale
 * dataset is a report, not a failure).
 *   node --experimental-strip-types tools/sync-freshness-issues.ts [--today YYYY-MM-DD] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultManifestPath, loadManifest } from './lib/freshness.ts';
import { checkFreshness, isValidDate } from './lib/freshness-check.ts';
import { LABEL, planActions, type OpenIssue } from './lib/freshness-issues.ts';

const { values } = parseArgs({
  options: { today: { type: 'string' }, 'dry-run': { type: 'boolean' } },
});
const today = values.today ?? new Date().toISOString().slice(0, 10);
if (!isValidDate(today)) throw new Error(`--today must be YYYY-MM-DD, got ${today}`);
const dryRun = values['dry-run'] ?? false;

const gh = (...args: string[]): string => execFileSync('gh', args, { encoding: 'utf8' });

const manifest = loadManifest(defaultManifestPath(resolve(import.meta.dirname, '..')));
const verdicts = checkFreshness(manifest, today);
for (const v of verdicts) console.log(`${v.stale ? 'STALE' : 'ok   '} ${v.id}: ${v.reason}`);

const open: OpenIssue[] = JSON.parse(
  gh(
    'issue',
    'list',
    '--label',
    LABEL,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    'number,title,body',
  ),
);
const actions = planActions(verdicts, open, today);

if (!dryRun && actions.some((a) => a.type === 'create')) {
  gh(
    'label',
    'create',
    LABEL,
    '--force',
    '--color',
    'fbca04',
    '--description',
    'Dataset needs a refresh',
  );
}
for (const a of actions) {
  console.log(
    `${dryRun ? '[dry-run] ' : ''}${a.type} ${a.id}${'number' in a ? ` #${a.number}` : ''}`,
  );
  if (dryRun) continue;
  if (a.type === 'create') {
    gh('issue', 'create', '--title', a.title, '--body', a.body, '--label', LABEL);
  } else if (a.type === 'update') {
    gh('issue', 'edit', String(a.number), '--title', a.title, '--body', a.body);
  } else {
    gh('issue', 'close', String(a.number), '--comment', a.comment);
  }
}
