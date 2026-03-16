import uFuzzy from "@leeoniya/ufuzzy";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Promise } from "@/data/index";
import PromiseCard from "./PromiseCard";
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

  const result = useMemo(
    () => (query.trim() ? (fuzzy.search(haystack, query)[0] ?? []) : undefined),
    [query],
  );

  const isFiltering = result !== undefined;
  const items = isFiltering ? result.map((idx) => promises[idx]) : promises;

  return (
    <div className="container mx-auto pt-4 px-4 md:px-6">
      <Input
        type="text"
        placeholder="Sök"
        aria-label="Sök bland löften"
        className="mb-4"
        value={input}
        onChange={(ev) => setInput(ev.target.value)}
        autoFocus
      />
      {isFiltering && (
        <p className="text-muted-foreground text-sm mb-3">
          {items.length} {items.length === 1 ? "resultat" : "resultat"}
        </p>
      )}
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
