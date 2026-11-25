import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PartyChip, isFilledRole } from './party-chip';

describe('PartyChip', () => {
  it('fills government and support only', () => {
    expect(isFilledRole('government')).toBe(true);
    expect(isFilledRole('support')).toBe(true);
    expect(isFilledRole('opposition')).toBe(false);
  });
  it('renders no role for a pending term, never opposition', () => {
    expect(isFilledRole(undefined)).toBe(false);
    const html = renderToStaticMarkup(<PartyChip party="S" />);
    expect(html).not.toContain('data-role');
    expect(html).toContain('border-dashed');
  });
  it('keeps data-role when a role is known', () => {
    expect(renderToStaticMarkup(<PartyChip party="S" role="opposition" />)).toContain(
      'data-role="opposition"',
    );
  });
});
