/**
 * Pure planning of GitHub issue changes from freshness verdicts: one open issue per stale
 * dataset, identified by a hidden marker in the body (falling back to the title), closed once
 * the dataset is fresh again. `tools/sync-freshness-issues.ts` applies the plan through `gh`.
 */
import type { Verdict } from './freshness-check.ts';

export const LABEL = 'data-stale';

export type OpenIssue = { number: number; title: string; body: string };

export type Action =
  | { type: 'create'; id: string; title: string; body: string }
  | { type: 'update'; id: string; number: number; title: string; body: string }
  | { type: 'close'; id: string; number: number; comment: string };

export const marker = (id: string): string => `<!-- ${LABEL}:${id} -->`;
export const issueTitle = (id: string): string => `Stale dataset: ${id}`;

export function issueBody(v: Verdict, today: string): string {
  return [
    marker(v.id),
    `The dataset \`${v.id}\` is stale as of ${today}: ${v.reason}.`,
    '',
    'Refresh it with the matching ingest tool in `tools/` and open a PR with the result. ' +
      'This issue is maintained by the weekly freshness check and is closed automatically ' +
      'once the dataset is fresh.',
  ].join('\n');
}

/** The dataset id an open issue tracks, from its marker or (legacy) title, or undefined. */
export function issueDatasetId(issue: OpenIssue): string | undefined {
  const m = new RegExp(`<!-- ${LABEL}:(.+?) -->`).exec(issue.body ?? '');
  if (m) return m[1];
  const prefix = issueTitle('');
  return issue.title.startsWith(prefix) ? issue.title.slice(prefix.length) : undefined;
}

export function planActions(verdicts: Verdict[], open: OpenIssue[], today: string): Action[] {
  const byId = new Map<string, OpenIssue[]>();
  for (const issue of open) {
    const id = issueDatasetId(issue);
    if (id) byId.set(id, [...(byId.get(id) ?? []), issue]);
  }
  const actions: Action[] = [];
  for (const v of verdicts) {
    // Oldest first so duplicates collapse onto the first-filed issue.
    const [keep, ...dupes] = (byId.get(v.id) ?? []).toSorted((a, b) => a.number - b.number);
    if (v.stale) {
      const title = issueTitle(v.id);
      const body = issueBody(v, today);
      if (!keep) actions.push({ type: 'create', id: v.id, title, body });
      else if (keep.body !== body || keep.title !== title)
        actions.push({ type: 'update', id: v.id, number: keep.number, title, body });
      for (const d of dupes)
        actions.push({
          type: 'close',
          id: v.id,
          number: d.number,
          comment: `Duplicate of #${keep?.number ?? 'the tracking issue'}.`,
        });
    } else {
      for (const issue of [keep, ...dupes].filter((i) => i !== undefined))
        actions.push({
          type: 'close',
          id: v.id,
          number: issue.number,
          comment: `Dataset is fresh again as of ${today}: ${v.reason}. Closing.`,
        });
    }
  }
  return actions;
}
