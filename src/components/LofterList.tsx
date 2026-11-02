import uFuzzy from '@leeoniya/ufuzzy';
import { useEffect, useMemo, useState } from 'react';
import { AgreementBadge } from '@/components/ui/agreement-badge';
import { Input } from '@/components/ui/input';
import { PartyChip } from '@/components/ui/party-chip';
import { VerdictBadge } from '@/components/ui/verdict-badge';
import { useDebounce } from '@/hooks/useDebounce';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  matchesFilters,
  parseFilters,
  serializeFilters,
  toggleValue,
  type LofterFilters,
} from '@/lib/lofter-filter';
import { PARTY_NAMES } from '@/lib/promise-labels';
import {
  AGREEMENT_OUTCOMES,
  AGREEMENT_OUTCOME_PHRASES,
  VERDICTS,
  VERDICT_LABELS,
} from '@/schema/promise';
import type { AgreementOutcome, ROLES } from '@/schema/promise';

const PAGE_SIZE = 50;

export interface LofterRow {
  id: string;
  title: string;
  area: string;
  href: string;
  parties: string[];
  /** Role per party in the selected term, from the term record. */
  roles: Record<string, (typeof ROLES)[number]>;
  verdict: (typeof VERDICTS)[number];
  outcome?: AgreementOutcome;
  /** Text the fuzzy search runs over. */
  search: string;
}

interface Props {
  rows: LofterRow[];
  areas: string[];
  /** The term's agreement, only when some promise has agreement evidence. */
  agreement?: { shortTitle?: string; title: string };
}

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function CheckGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: { value: T; label: string; count: number }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="space-y-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-accent"
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--foreground)]"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
            />
            <span className="flex-1">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function LofterList({ rows, areas, agreement }: Props) {
  const fuzzy = useMemo(() => new uFuzzy({ intraMode: 1 }), []);
  const haystack = useMemo(() => rows.map((r) => r.search), [rows]);

  // `filters.q` is unused; the text query lives in `input` and its debounced copy `query`.
  const [filters, setFilters] = useState<LofterFilters>(EMPTY_FILTERS);
  const [input, setInput] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [loaded, setLoaded] = useState(false);
  const query = useDebounce(input);
  const effective = useMemo(() => ({ ...filters, q: query }), [filters, query]);

  // Read the URL once on mount (not in the initial state, to match the server render).
  useEffect(() => {
    const f = parseFilters(window.location.search);
    setFilters(f);
    setInput(f.q);
    setLoaded(true);
  }, []);

  // Keep the URL in sync so a filtered view can be shared. Wait until the URL has been read and
  // the debounced query has caught up with the input, so restoring never overwrites the URL.
  useEffect(() => {
    if (!loaded || query !== input) return;
    const qs = serializeFilters(effective);
    if (qs !== window.location.search) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${qs}${window.location.hash}`,
      );
    }
  }, [loaded, query, input, effective]);

  const update = (patch: Partial<LofterFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setShown(PAGE_SIZE);
  };

  const matched = useMemo(() => {
    const q = effective.q.trim();
    let ordered: number[];
    if (q) {
      const [idxs, info, order] = fuzzy.search(haystack, q);
      ordered = info && order ? order.map((i) => info.idx[i]) : (idxs ?? []);
    } else {
      ordered = rows.map((_, i) => i);
    }
    return ordered.map((i) => rows[i]).filter((r) => matchesFilters(r, effective));
  }, [rows, haystack, fuzzy, effective]);

  const counts = useMemo(() => {
    const party = new Map<string, number>();
    const verdict = new Map<string, number>();
    const outcome = new Map<string, number>();
    for (const r of rows) {
      for (const p of r.parties) party.set(p, (party.get(p) ?? 0) + 1);
      verdict.set(r.verdict, (verdict.get(r.verdict) ?? 0) + 1);
      if (r.outcome) outcome.set(r.outcome, (outcome.get(r.outcome) ?? 0) + 1);
    }
    return { party, verdict, outcome };
  }, [rows]);

  const partyOptions = [...counts.party.keys()].sort().map((p) => ({
    value: p,
    label: `${PARTY_NAMES[p as keyof typeof PARTY_NAMES] ?? p}`,
    count: counts.party.get(p) ?? 0,
  }));
  const verdictOptions = VERDICTS.filter((v) => counts.verdict.has(v)).map((v) => ({
    value: v,
    label: VERDICT_LABELS[v],
    count: counts.verdict.get(v) ?? 0,
  }));
  const outcomeOptions = AGREEMENT_OUTCOMES.filter((o) => counts.outcome.has(o)).map((o) => ({
    value: o,
    label: agreement
      ? `${AGREEMENT_OUTCOME_PHRASES[o]} ${agreement.shortTitle ?? agreement.title}`
      : o,
    count: counts.outcome.get(o) ?? 0,
  }));

  const visible = matched.slice(0, shown);
  const active = hasActiveFilters(effective);

  return (
    <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
      <form
        role="search"
        aria-label="Sök och filtrera löften"
        className="space-y-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label htmlFor="lofter-q" className="mb-1 block text-sm font-semibold">
            Sök bland löften
          </label>
          <Input
            id="lofter-q"
            type="search"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShown(PAGE_SIZE);
            }}
          />
        </div>
        <CheckGroup
          legend="Parti"
          options={partyOptions}
          selected={filters.parties}
          onToggle={(v) => update({ parties: toggleValue(filters.parties, v) })}
        />
        <CheckGroup
          legend="Bedömning"
          options={verdictOptions}
          selected={filters.verdicts}
          onToggle={(v) => update({ verdicts: toggleValue(filters.verdicts, v) })}
        />
        {agreement && outcomeOptions.length > 0 && (
          <CheckGroup
            legend={`I ${agreement.shortTitle ?? agreement.title}`}
            options={outcomeOptions}
            selected={filters.outcomes}
            onToggle={(v) => update({ outcomes: toggleValue(filters.outcomes, v) })}
          />
        )}
        <div>
          <label htmlFor="lofter-area" className="mb-1 block text-sm font-semibold">
            Område
          </label>
          <select
            id="lofter-area"
            className={selectClass}
            value={filters.area}
            onChange={(e) => update({ area: e.target.value })}
          >
            <option value="">Alla områden</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {active && (
          <button
            type="button"
            className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            onClick={() => {
              setInput('');
              setFilters(EMPTY_FILTERS);
              setShown(PAGE_SIZE);
            }}
          >
            Rensa filter
          </button>
        )}
      </form>

      <div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {active ? `${matched.length} av ${rows.length} löften` : `${rows.length} löften`}
        </p>
        <ul className="mt-2 divide-y rounded-md border">
          {visible.map((r) => (
            <li key={r.id}>
              <a
                href={r.href}
                className="flex min-h-11 flex-col gap-2 px-3 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex shrink-0 gap-1">
                    {r.parties.map((p) => (
                      <PartyChip
                        key={p}
                        party={p}
                        role={r.roles[p] ?? 'opposition'}
                        size="inline"
                        title={PARTY_NAMES[p as keyof typeof PARTY_NAMES]}
                      />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{r.area}</span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-2 sm:justify-end">
                  {agreement && r.outcome && (
                    <AgreementBadge outcome={r.outcome} source={agreement} />
                  )}
                  <VerdictBadge verdict={r.verdict} />
                </span>
              </a>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Inga löften matchar sökningen.
            </li>
          )}
        </ul>
        {visible.length < matched.length && (
          <button
            type="button"
            className="mt-4 h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            Visa fler
          </button>
        )}
      </div>
    </div>
  );
}
