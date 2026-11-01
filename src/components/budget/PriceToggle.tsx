import { useId } from 'react';

/** The advanced-mode switch ("Avancerat läge", P10): a button with role="switch". */
export function AdvancedSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-4 w-7 rounded-full transition-colors ${on ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
      Avancerat läge
    </button>
  );
}

/** Löpande / fasta priser as a segmented control (radio group). */
export function PriceToggle({
  fasta,
  latest,
  onChange,
}: {
  fasta: boolean;
  /** The year whose prices "fasta priser" use. */
  latest: number;
  onChange: (fasta: boolean) => void;
}) {
  const name = useId();
  const options = [
    { value: false, label: 'Löpande priser' },
    { value: true, label: `Fasta priser (KPI, ${latest})` },
  ];
  return (
    <fieldset className="flex items-center gap-2 text-sm">
      <legend className="sr-only">Priser</legend>
      <span className="font-medium" aria-hidden="true">
        Priser
      </span>
      <div className="inline-flex overflow-hidden rounded-md border border-input">
        {options.map((o) => (
          <label
            key={o.label}
            className={`cursor-pointer px-3 py-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring ${
              fasta === o.value ? 'bg-foreground text-background' : 'bg-background'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={fasta === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
