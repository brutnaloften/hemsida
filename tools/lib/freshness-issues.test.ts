import { describe, expect, it } from 'vitest';
import { issueBody, issueDatasetId, issueTitle, planActions } from './freshness-issues.ts';

const today = '2026-11-01';
const stale = { id: 'riksdag-2022-2026', stale: true, reason: 'never ingested' };
const fresh = { id: 'budget', stale: false, reason: 'up to date' };

describe('planActions', () => {
  it('creates an issue for a stale dataset without one', () => {
    const [a] = planActions([stale], [], today);
    expect(a).toMatchObject({ type: 'create', title: issueTitle(stale.id) });
  });

  it('does nothing when the open issue is already up to date', () => {
    const open = [{ number: 3, title: issueTitle(stale.id), body: issueBody(stale, today) }];
    expect(planActions([stale], open, today)).toEqual([]);
  });

  it('updates when the reason changed', () => {
    const open = [{ number: 3, title: issueTitle(stale.id), body: issueBody(stale, '2026-10-01') }];
    expect(planActions([stale], open, today)).toMatchObject([{ type: 'update', number: 3 }]);
  });

  it('matches by title when the marker is missing', () => {
    const open = [{ number: 4, title: issueTitle(stale.id), body: 'hand edited' }];
    expect(planActions([stale], open, today)).toMatchObject([{ type: 'update', number: 4 }]);
  });

  it('closes the issue when the dataset is fresh', () => {
    const open = [{ number: 5, title: issueTitle('budget'), body: issueBody(fresh, today) }];
    expect(planActions([fresh], open, today)).toMatchObject([{ type: 'close', number: 5 }]);
  });

  it('collapses duplicates onto the oldest issue', () => {
    const body = issueBody(stale, today);
    const open = [
      { number: 9, title: issueTitle(stale.id), body },
      { number: 7, title: issueTitle(stale.id), body },
    ];
    expect(planActions([stale], open, today)).toMatchObject([{ type: 'close', number: 9 }]);
  });

  it('ignores unrelated issues', () => {
    const open = [{ number: 1, title: 'Something else', body: '' }];
    expect(issueDatasetId(open[0])).toBeUndefined();
    expect(planActions([fresh], open, today)).toEqual([]);
  });
});
