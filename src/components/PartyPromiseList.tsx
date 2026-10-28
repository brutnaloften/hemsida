import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { VERDICTS, VERDICT_LABELS } from "@/schema/promise";
import { VERDICT_STYLES } from "@/lib/promise-labels";
import { filterPromises, type PartyPromise } from "@/lib/party-stats";

const PAGE_SIZE = 40;

interface Row extends Pick<PartyPromise, "id" | "title" | "area" | "verdict"> {
  href: string;
}

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function PartyPromiseList({
  promises,
  areas,
}: {
  promises: Row[];
  areas: string[];
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [verdict, setVerdict] = useState<(typeof VERDICTS)[number] | "">("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => filterPromises(promises, { query, area, verdict }),
    [promises, query, area, verdict],
  );
  const visible = filtered.slice(0, shown);
  const reset = () => setShown(PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          aria-label="Filtrera på titel"
          placeholder="Filtrera på titel"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            reset();
          }}
        />
        <select
          aria-label="Område"
          className={selectClass}
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            reset();
          }}
        >
          <option value="">Alla områden</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label="Bedömning"
          className={selectClass}
          value={verdict}
          onChange={(e) => {
            setVerdict(e.target.value as typeof verdict);
            reset();
          }}
        >
          <option value="">Alla bedömningar</option>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>
              {VERDICT_LABELS[v]}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        Visar {visible.length} av {filtered.length} löften
      </p>
      <ul className="mt-2 divide-y rounded-md border">
        {visible.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <a href={p.href} className="font-medium underline-offset-2 hover:underline">
                {p.title}
              </a>
              <div className="text-xs text-muted-foreground">{p.area}</div>
            </div>
            <Badge className={`shrink-0 self-start ${VERDICT_STYLES[p.verdict.value]}`}>
              {VERDICT_LABELS[p.verdict.value]}
            </Badge>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Inga löften matchar filtren.
          </li>
        )}
      </ul>
      {visible.length < filtered.length && (
        <button
          type="button"
          className="mt-4 h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
        >
          Visa fler
        </button>
      )}
    </div>
  );
}
