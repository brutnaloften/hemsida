import { useId, useState } from 'react';
import { badgeVariants } from '@/components/ui/badge';

/**
 * "Preliminärt" badge that explains itself on click (P9). An inline disclosure instead of the
 * Popover primitive: the Popover chunk (base-ui, about 35 kB gz) alone would use the island's
 * whole 30 kB budget (P14).
 */
export function PrelimBadge() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-block align-middle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={badgeVariants({ variant: 'outline', class: 'cursor-pointer' })}
      >
        Preliminärt
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="mt-2 block rounded-md border bg-popover p-3 text-sm font-normal text-popover-foreground"
        >
          Siffrorna för skatterna är inte slutliga. Ekonomistyrningsverket justerar dem i upp till
          ett och ett halvt år efter budgetåret. Saldot kan därför ändras något.
        </span>
      )}
    </span>
  );
}
