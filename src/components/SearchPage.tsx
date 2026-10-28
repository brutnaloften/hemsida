import uFuzzy from '@leeoniya/ufuzzy';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { Promise } from '@/data/index';
import PromiseCard from './PromiseCard';
import FilterDropdown from './FilterDropdown';
import { useDebounce } from '@/hooks/useDebounce';
import { VERDICTS, VERDICT_LABELS } from '@/schema/promise';
import { TYPE_LABELS, partyName } from '@/lib/promise-labels';

export default function SearchPage({ promises }: { promises: Promise[] }) {
  const { fuzzy, haystack } = useMemo(
    () => ({
      fuzzy: new uFuzzy(),
      haystack: promises.map((p) =>
        [
          p.title,
          p.description,
          p.parties.map((c) => `${c} ${partyName(c)}`).join(' '),
          p.keywords.join(' '),
          p.area,
          p.committee ?? '',
          TYPE_LABELS[p.type],
          VERDICT_LABELS[p.verdict.value],
          p.verdict.reasoning,
          p.date,
        ].join(' '),
      ),
    }),
    [],
  );

  const [input, setInput] = useState('');
  const query = useDebounce(input);

  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());

  const parties = useMemo(
    () => [...new Set(promises.flatMap((p) => p.parties.map(partyName)))].sort(),
    [],
  );
  // Keep the schema's verdict order and only list verdicts that occur.
  const statuses = useMemo(
    () =>
      VERDICTS.filter((v) => promises.some((p) => p.verdict.value === v)).map(
        (v) => VERDICT_LABELS[v],
      ),
    [],
  );
  const types = useMemo(() => [...new Set(promises.map((p) => TYPE_LABELS[p.type]))].sort(), []);
  const terms = useMemo(() => [...new Set(promises.map((p) => p.term))].sort(), []);
  const years = useMemo(() => [...new Set(promises.map((p) => p.date.slice(0, 4)))].sort(), []);

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  const searchResult = useMemo(
    () => (query.trim() ? (fuzzy.search(haystack, query)[0] ?? []) : undefined),
    [query],
  );

  const items = useMemo(() => {
    const searched = searchResult ? searchResult.map((idx) => promises[idx]) : promises;
    return searched.filter(
      (p) =>
        (selectedParties.size === 0 ||
          p.parties.some((party) => selectedParties.has(partyName(party)))) &&
        (selectedStatuses.size === 0 || selectedStatuses.has(VERDICT_LABELS[p.verdict.value])) &&
        (selectedTypes.size === 0 || selectedTypes.has(TYPE_LABELS[p.type])) &&
        (selectedTerms.size === 0 || selectedTerms.has(p.term)) &&
        (selectedYears.size === 0 || selectedYears.has(p.date.slice(0, 4))),
    );
  }, [
    searchResult,
    selectedParties,
    selectedStatuses,
    selectedTypes,
    selectedTerms,
    selectedYears,
  ]);

  const hasActiveFilters =
    selectedParties.size > 0 ||
    selectedStatuses.size > 0 ||
    selectedTypes.size > 0 ||
    selectedTerms.size > 0 ||
    selectedYears.size > 0;
  const isFiltering = searchResult !== undefined || hasActiveFilters;

  return (
    <div className="container mx-auto pt-4 px-4 md:px-6">
      <Input
        type="text"
        placeholder="Sök"
        aria-label="Sök bland löften"
        className="mb-3"
        value={input}
        onChange={(ev) => setInput(ev.target.value)}
        autoFocus
      />
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterDropdown
          label="Parti"
          options={parties}
          selected={selectedParties}
          onChange={(v) => setSelectedParties((s) => toggle(s, v))}
        />
        <FilterDropdown
          label="Status"
          options={statuses}
          selected={selectedStatuses}
          onChange={(v) => setSelectedStatuses((s) => toggle(s, v))}
        />
        <FilterDropdown
          label="Typ"
          options={types}
          selected={selectedTypes}
          onChange={(v) => setSelectedTypes((s) => toggle(s, v))}
        />
        <FilterDropdown
          label="Mandatperiod"
          options={terms}
          selected={selectedTerms}
          onChange={(v) => setSelectedTerms((s) => toggle(s, v))}
        />
        <FilterDropdown
          label="Källans år"
          options={years}
          selected={selectedYears}
          onChange={(v) => setSelectedYears((s) => toggle(s, v))}
        />
      </div>
      {isFiltering && <p className="text-muted-foreground text-sm mb-3">{items.length} resultat</p>}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Inga resultat hittades.</p>
      ) : (
        <div>
          {items.map((p) => (
            <PromiseCard key={p.id} promise={p} />
          ))}
        </div>
      )}
    </div>
  );
}
