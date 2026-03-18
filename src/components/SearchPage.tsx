import uFuzzy from "@leeoniya/ufuzzy";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Promise } from "@/data/index";
import PromiseCard from "./PromiseCard";
import FilterDropdown from "./FilterDropdown";
import { useDebounce } from "@/hooks/useDebounce";

export default function SearchPage({ promises }: { promises: Promise[] }) {
  const { fuzzy, haystack } = useMemo(
    () => ({
      fuzzy: new uFuzzy(),
      haystack: promises.map((p) => `${p.name} ${p.description} ${p.party} ${p.tags} ${p.date}`),
    }),
    [],
  );

  const [input, setInput] = useState("");
  const query = useDebounce(input);

  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());

  const parties = useMemo(() => [...new Set(promises.map((p) => p.party))].sort(), []);
  const statuses = useMemo(() => [...new Set(promises.map((p) => p.status))].sort(), []);
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
        (selectedParties.size === 0 || selectedParties.has(p.party)) &&
        (selectedStatuses.size === 0 || selectedStatuses.has(p.status)) &&
        (selectedYears.size === 0 || selectedYears.has(p.date.slice(0, 4))),
    );
  }, [searchResult, selectedParties, selectedStatuses, selectedYears]);

  const hasActiveFilters =
    selectedParties.size > 0 || selectedStatuses.size > 0 || selectedYears.size > 0;
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
          label="År"
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
            <PromiseCard key={p.name} promise={p} />
          ))}
        </div>
      )}
    </div>
  );
}
