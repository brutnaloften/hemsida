import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VOTE_VALUES } from '@/schema/promise';
import { VOTE_LABELS, VOTE_SYMBOLS } from '@/lib/promise-page';
import { VoteBadge } from './vote-badge';

describe('VoteBadge', () => {
  it.each(VOTE_VALUES)('renders %s with its data attribute, word and hidden symbol', (v) => {
    const html = renderToStaticMarkup(<VoteBadge vote={v} />);
    expect(html).toContain(`data-vote="${v}"`);
    expect(html).toContain(VOTE_LABELS[v]);
    expect(html).toContain(`<span aria-hidden="true">${VOTE_SYMBOLS[v]}</span>`);
  });

  it('passes className and props through', () => {
    const html = renderToStaticMarkup(<VoteBadge vote="yes" className="x" id="a" />);
    expect(html).toContain('vote-badge x');
    expect(html).toContain('id="a"');
  });
});
