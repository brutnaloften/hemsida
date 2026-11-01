import { badgeVariants } from '@/components/ui/badge';

/**
 * "Preliminärt" badge that explains itself when opened (P9). A native <details>, so it also works
 * without JavaScript. Not the Popover primitive: its chunk (base-ui, about 35 kB gz) alone would use
 * the island's whole 30 kB budget (P14).
 */
export function PrelimBadge() {
  return (
    <details className="inline-block align-middle">
      <summary
        className={badgeVariants({
          variant: 'outline',
          class: 'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
        })}
      >
        Preliminärt
      </summary>
      <span
        role="note"
        className="mt-2 block rounded-md border bg-popover p-3 text-sm font-normal text-popover-foreground"
      >
        Siffrorna för skatterna är inte slutliga. Ekonomistyrningsverket justerar dem i upp till ett
        och ett halvt år efter budgetåret. Saldot kan därför ändras något.
      </span>
    </details>
  );
}
